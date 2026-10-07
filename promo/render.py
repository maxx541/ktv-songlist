"""MakoSing 示範影片（直式 1080×1920）渲染。

流程：把網站複製成「示範版」（假資料層）→ 開瀏覽器載入 stage.html → 逐格：step(t) → 推進假時鐘 → post(t) → 截圖 → 丟給 ffmpeg。
用法：
  python promo/render.py cues            只輸出音效提示 promo/out/cues.json（給 music.py 用）
  python promo/render.py frame 12.5      只截一張指定時間的圖到 promo/out/frame_12.5.png（檢查畫面）
  python promo/render.py video           渲染整支影片（無聲）到 promo/out/video_silent.mp4
"""
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial

from PIL import Image, ImageDraw, ImageFilter
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROMO = os.path.join(ROOT, 'promo')
BUILD = os.path.join(PROMO, 'build')
OUT = os.path.join(PROMO, 'out')
FPS = 30
PORT = 8130
FFMPEG = r'C:\Program Files (x86)\ffmpeg-8.0-essentials_build\bin\ffmpeg.exe'
YT_IDS = ['K2A5HSbAy9I', 'tpkUyfcogJA', 'aYkA2sgYjIs', 'KeuXa4_xcf0']  # 前三首由「別人」即時加入，第四首由示範的主角貼連結加入


def covers(dst):
    """8 張柔和漸層的假封面（給沒有真實縮圖的示範歌曲用）。"""
    os.makedirs(dst, exist_ok=True)
    palettes = [((255, 214, 232), (200, 170, 255)), ((190, 225, 255), (210, 190, 255)), ((200, 245, 225), (170, 215, 255)),
                ((255, 230, 190), (255, 190, 215)), ((215, 205, 255), (255, 205, 230)), ((190, 240, 240), (200, 220, 255)),
                ((255, 215, 205), (240, 190, 255)), ((205, 235, 255), (190, 245, 215))]
    for i, (a, b) in enumerate(palettes):
        w, h = 640, 360
        im = Image.new('RGB', (w, h))
        px = im.load()
        for y in range(h):
            for x in range(w):
                t = (x / w * 0.6 + y / h * 0.4)
                px[x, y] = tuple(int(a[c] + (b[c] - a[c]) * t) for c in range(3))
        ov = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(ov)
        d.ellipse((w * (0.1 + 0.07 * i % 0.4), -60, w * 0.62, h * 0.7), fill=(255, 255, 255, 70))
        d.ellipse((w * 0.5, h * 0.35, w * 1.1, h * 1.3), fill=(255, 255, 255, 55))
        d.rounded_rectangle((w * 0.42, h * 0.3, w * 0.58, h * 0.7), 16, fill=(255, 255, 255, 120))  # 簡單的麥克風剪影
        d.ellipse((w * 0.38, h * 0.62, w * 0.62, h * 0.82), outline=(255, 255, 255, 120), width=7)
        im = Image.alpha_composite(im.convert('RGBA'), ov.filter(ImageFilter.GaussianBlur(1.5))).convert('RGB')
        im.save(os.path.join(dst, f'cover{i}.jpg'), quality=90)


def build():
    if os.path.exists(BUILD):
        shutil.rmtree(BUILD)
    site = os.path.join(BUILD, 'site')
    shutil.copytree(os.path.join(ROOT, 'docs'), site)
    for f in ('store.js', 'youtube.js'):
        shutil.copy(os.path.join(PROMO, 'stub', f), os.path.join(site, f))
    for f in ('stage.html', 'stage.css', 'stage.js'):
        shutil.copy(os.path.join(PROMO, f), os.path.join(BUILD, f))
    covers(os.path.join(site, 'assets'))
    # 使用者提供的 B 站影片：歌名、上傳者、封面（問自己電腦上的中繼服務；沒開就用備用文字與假封面）
    bili = {}
    for bvid, fallback in (('BV1Va9yBmEfH', '【纯k投屏】「IF*Else」——mochari ディメンション凸ラバース!! ED'), ('BV1bzBxYdEZc', '【纯K投屏】いつもこの場所で(一如既往的地点)')):
        info = {'title': fallback, 'channel': '', 'pic': ''}
        try:
            raw = subprocess.run(['curl', '-s', '-m', '30', '-H', 'Origin: https://maxx541.github.io', f'http://127.0.0.1:8787/?bvid={bvid}'], capture_output=True).stdout
            info.update(json.loads(raw.decode('utf-8')))
        except Exception:
            pass
        cover = os.path.join(site, 'assets', f'bili_{bvid}.jpg')
        try:
            subprocess.run(['curl', '-s', '-m', '30', '-o', cover, info['pic']], check=True)
            Image.open(cover).verify()
        except Exception:
            shutil.copy(os.path.join(site, 'assets', 'cover0.jpg'), cover)
        bili[bvid] = {'title': info['title'], 'channel': info['channel']}

    # 使用者指定的 YouTube 歌曲：抓標題、頻道、縮圖，存成本機檔（影片渲染時不再連網）
    yt = []
    for vid in YT_IDS:
        raw = subprocess.run(['curl', '-s', '-m', '20', f'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={vid}&format=json'], capture_output=True).stdout
        try:
            j = json.loads(raw.decode('utf-8')); title, ch = j['title'], j['author_name']
        except Exception:
            title, ch = f'示範歌曲 {vid}', ''
        subprocess.run(['curl', '-s', '-m', '20', '-o', os.path.join(site, 'assets', f'yt_{vid}.jpg'), f'https://i.ytimg.com/vi/{vid}/mqdefault.jpg'], check=True)
        yt.append({'id': vid, 'title': title, 'channel': ch})
    open(os.path.join(site, 'demo-data.js'), 'w', encoding='utf-8').write(
        'export const YT = ' + json.dumps(yt, ensure_ascii=False) + ';\nexport const BILI = ' + json.dumps(bili, ensure_ascii=False) + ';\n')

    # 縮圖：示範版一律用本機圖，不連網
    sp = os.path.join(site, 'shared.js')
    t = open(sp, encoding='utf-8').read()
    start = t.index('export function thumbnailFor(videoId, thumb) {')
    end = t.index('\n}\n', start) + 3
    t = t[:start] + (
        "export function thumbnailFor(videoId) {\n"
        "  if (!videoId) return null;\n"
        "  if (/^BV1[0-9A-Za-z]{9}$/.test(videoId) && videoId.length === 12) return `assets/bili_${videoId}.jpg`;\n"
        f"  if ({YT_IDS!r}.includes(videoId)) return 'assets/yt_' + videoId + '.jpg';\n"
        "  let n = 0; for (const c of String(videoId)) n += c.charCodeAt(0);\n"
        "  return `assets/cover${n % 8}.jpg`;\n}\n") + t[end:]
    open(sp, 'w', encoding='utf-8').write(t)
    # 關掉所有轉場與動畫（畫面完全由時間決定），隱藏捲軸
    ip = os.path.join(site, 'index.html')
    h = open(ip, encoding='utf-8').read()
    h = h.replace('</head>', '<style>*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}'
                  'html{scrollbar-width:none}::-webkit-scrollbar{display:none}</style></head>')
    open(ip, 'w', encoding='utf-8').write(h)


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), partial(Quiet, directory=BUILD))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


SEED_JS = """(() => { let a = 0x2f6e2b1; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();"""


def open_stage(p):
    browser = p.chromium.launch(args=['--force-device-scale-factor=1', '--hide-scrollbars'])
    ctx = browser.new_context(viewport={'width': 1080, 'height': 1920}, device_scale_factor=1)
    ctx.add_init_script(SEED_JS)
    page = ctx.new_page()
    page.clock.install(time='2026-10-08T12:00:00')
    page.on('console', lambda m: print('  [console]', m.text) if m.type in ('error', 'warning') else None)
    page.goto(f'http://127.0.0.1:{PORT}/stage.html')
    page.wait_for_function("document.getElementById('site').contentDocument && document.getElementById('site').contentDocument.readyState === 'complete'")
    page.clock.run_for(200)
    return browser, page


def advance(page, t):
    page.evaluate('t => window.step(t)', t)
    page.clock.run_for(int(1000 / FPS))
    page.evaluate('t => window.post(t)', t)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'video'
    os.makedirs(OUT, exist_ok=True)
    build()
    srv = serve()
    with sync_playwright() as p:
        browser, page = open_stage(p)
        total = page.evaluate('window.TOTAL')
        if mode == 'cues':
            cues = page.evaluate('window.CUES')
            json.dump({'total': total, 'cues': cues, 'sections': page.evaluate('window.SECTIONS')}, open(os.path.join(OUT, 'cues.json'), 'w'), ensure_ascii=False, indent=1)
            print(f'{len(cues)} 個音效提示，總長 {total}s')
        elif mode == 'frames':
            targets = sorted(float(x) for x in sys.argv[2:])
            ti = 0
            for i in range(int(targets[-1] * FPS) + 1):
                advance(page, i / FPS)
                if ti < len(targets) and i >= round(targets[ti] * FPS):
                    path = os.path.join(OUT, f'frame_{targets[ti]:05.1f}.jpg')
                    page.screenshot(path=path, type='jpeg', quality=85)
                    ti += 1
            print('錯誤：', page.evaluate('window.__errors'))
        elif mode == 'frame':
            target = float(sys.argv[2])
            n = int(target * FPS)
            for i in range(n + 1):
                advance(page, i / FPS)
            path = os.path.join(OUT, f'frame_{sys.argv[2]}.png')
            page.screenshot(path=path)
            print(path, '錯誤：', page.evaluate('window.__errors'))
        else:
            n = int(total * FPS)
            out = os.path.join(OUT, 'video_silent.mp4')
            ff = subprocess.Popen([FFMPEG, '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-',
                                   '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
                                  stdin=subprocess.PIPE)
            t0 = time.time()
            for i in range(n):
                advance(page, i / FPS)
                ff.stdin.write(page.screenshot(type='jpeg', quality=95))
                if i % 60 == 0:
                    print(f'  {i}/{n}  ({time.time() - t0:.0f}s)', flush=True)
            ff.stdin.close(); ff.wait()
            print('完成', out, '錯誤：', page.evaluate('window.__errors'))
        browser.close()
    srv.shutdown()


if __name__ == '__main__':
    main()
