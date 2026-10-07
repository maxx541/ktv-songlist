"""把「立繪」資料夾的圖去背、裁邊、縮小，輸出成透明 WebP 放進 docs/img/tachie/，並產生 docs/tachie.js 清單。

用法：python tools/cutout_tachie.py
- 已經有透明背景的圖（PNG／WebP）：只裁邊與縮小。
- 白底的圖（JPG）：從四邊往內找「接近純白」的區域當背景挖掉（衣服裡面的白色不會被挖，因為不與邊緣相連），
  再把邊緣縮 1 像素去掉白邊，最後只留下最大的主體，順便清掉浮水印這類散落的小碎塊。
只需要 Pillow 與 numpy。
"""
import glob
import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '立繪')
OUT = os.path.join(ROOT, 'docs', 'img', 'tachie')
MAX_H = 1300          # 輸出最高像素
WHITE = 246           # 三個色版都 >= 這個值才算「純白背景」
HALO = 232            # 緊鄰背景、又 >= 這個值的像素，視為白邊一起去掉


def has_alpha(im):
    if im.mode not in ('RGBA', 'LA', 'P'):
        return False
    a = np.asarray(im.convert('RGBA'))[:, :, 3]
    return (a < 250).mean() > 0.05  # 超過 5% 的像素是透明的才算有去背


def remove_white_bg(im):
    rgb = np.asarray(im.convert('RGB')).astype(np.int16)
    h, w, _ = rgb.shape
    near = (rgb >= WHITE).all(axis=2)
    # 從四邊往內擴張：只挖「與邊緣相連」的純白（衣服裡面的白色不相連，所以不會被挖）
    bg = np.zeros_like(near)
    bg[0, :] = near[0, :]; bg[-1, :] = near[-1, :]; bg[:, 0] = near[:, 0]; bg[:, -1] = near[:, -1]
    for _ in range(8000):
        grown = bg.copy()
        grown[1:, :] |= bg[:-1, :]; grown[:-1, :] |= bg[1:, :]
        grown[:, 1:] |= bg[:, :-1]; grown[:, :-1] |= bg[:, 1:]
        grown &= near
        if grown.sum() == bg.sum():
            break
        bg = grown

    # 白邊：背景往外長 2 圈，但只吃偏白的像素
    soft = (rgb >= HALO).all(axis=2)
    for _ in range(2):
        grown = np.zeros_like(bg)
        grown[1:, :] |= bg[:-1, :]; grown[:-1, :] |= bg[1:, :]
        grown[:, 1:] |= bg[:, :-1]; grown[:, :-1] |= bg[:, 1:]
        bg = bg | (grown & soft)

    fg = ~bg
    fg = keep_main_bodies(fg)
    alpha = Image.fromarray((fg * 255).astype(np.uint8), 'L')
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))  # 縮 1px 再柔化邊緣
    out = im.convert('RGBA')
    out.putalpha(alpha)
    return out


def keep_main_bodies(fg, min_ratio=0.04):
    """只留下面積夠大的連通塊（相對最大塊），其餘（浮水印文字、雜點）清掉。縮小 4 倍來標記，速度快。"""
    h, w = fg.shape
    s = 4
    small = np.asarray(Image.fromarray((fg * 255).astype(np.uint8)).resize((max(1, w // s), max(1, h // s)), Image.BOX)) > 32
    sh, sw = small.shape
    label = np.zeros((sh, sw), dtype=np.int32)
    sizes = {}
    n = 0
    for y in range(sh):
        for x in range(sw):
            if small[y, x] and not label[y, x]:
                n += 1
                q = deque([(y, x)]); label[y, x] = n; c = 0
                while q:
                    cy, cx = q.popleft(); c += 1
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < sh and 0 <= nx < sw and small[ny, nx] and not label[ny, nx]:
                            label[ny, nx] = n; q.append((ny, nx))
                sizes[n] = c
    if not sizes:
        return fg
    biggest = max(sizes.values())
    keep = {k for k, v in sizes.items() if v >= biggest * min_ratio}
    keep_small = np.isin(label, list(keep))
    # 放大回原尺寸，稍微膨脹一圈避免吃到邊緣
    big = Image.fromarray((keep_small * 255).astype(np.uint8)).resize((w, h), Image.NEAREST).filter(ImageFilter.MaxFilter(2 * s + 1))
    return fg & (np.asarray(big) > 0)


def crop_and_resize(im):
    a = np.asarray(im.getchannel('A'))
    ys, xs = np.where(a > 12)
    if not len(ys):
        raise ValueError('整張都是透明')
    pad = 6
    box = (max(0, xs.min() - pad), max(0, ys.min() - pad), min(im.width, xs.max() + 1 + pad), min(im.height, ys.max() + 1 + pad))
    im = im.crop(box)
    if im.height > MAX_H:
        im = im.resize((round(im.width * MAX_H / im.height), MAX_H), Image.LANCZOS)
    return im


def main():
    os.makedirs(OUT, exist_ok=True)
    for old in glob.glob(os.path.join(OUT, '*.webp')):
        os.remove(old)
    files = sorted(glob.glob(os.path.join(SRC, '*')))
    manifest = []
    for i, f in enumerate(files, 1):
        im = Image.open(f)
        native_h = im.height
        im = im.convert('RGBA') if has_alpha(im) else remove_white_bg(im)
        im = crop_and_resize(im)
        name = f'{i:02d}.webp'
        im.save(os.path.join(OUT, name), 'WEBP', quality=88, method=6)
        kb = os.path.getsize(os.path.join(OUT, name)) // 1024
        # 原圖很小的，頁面上限制顯示高度，避免放大變糊（最多放大 1.6 倍）
        manifest.append({'src': f'img/tachie/{name}', 'w': im.width, 'h': im.height, 'maxH': round(min(im.height, native_h) * 1.6) if native_h < 700 else None})
        print(f'{name}  {os.path.basename(f)[:40]:40}  {im.width}x{im.height}  {kb}KB')
    js = '// 由 tools/cutout_tachie.py 產生，不要手動改。登入頁每次隨機挑一張。\nexport const tachie = ' + json.dumps(manifest, ensure_ascii=False, indent=2) + ';\n'
    with open(os.path.join(ROOT, 'docs', 'tachie.js'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(js)
    print(f'共 {len(manifest)} 張，已寫入 docs/img/tachie/ 與 docs/tachie.js')


if __name__ == '__main__':
    sys.exit(main())
