"""把 soundeffects/ 裡的音訊素材轉成網站用的語音，放進 docs/audio/<立繪編號>/。

對應規則（立繪編號 = 立繪資料夾裡原圖的檔名，例如 007.jpg → 007）：
  007  ← soundeffects/ 裡所有影片檔（.mov／.mp4）的音軌，依檔名排序，轉成 1.mp3、2.mp3 …（點一下隨機播一句）
  008  ← soundeffects/蒼ダーリン.mp3
每一段都把峰值正規化到 -3 dBFS，讓不同來源的音量差不多。
用法：python tools/make_voices.py   （做完再跑 python tools/cutout_tachie.py 更新 docs/tachie.js）
"""
import glob
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'soundeffects')
DST = os.path.join(ROOT, 'docs', 'audio')
FFMPEG = r'C:\Program Files (x86)\ffmpeg-8.0-essentials_build\bin\ffmpeg.exe'
TARGET_PEAK_DB = -3.0
# 先統一成立體聲，再把左右平均成單聲道（單聲道來源也能用）；量測與轉檔都用這條，峰值才不會在混音時多出來
MONO = 'aformat=channel_layouts=stereo,pan=mono|c0=0.5*c0+0.5*c1'


def natural_key(name):
    """檔名裡的數字照數值排序（_2 排在 _10 前面）；沒有數字的（第一個）排最前面。"""
    m = re.search(r'_(\d+)\.[^.]+$', name)
    return (int(m.group(1)) if m else -1, name)


def peak_db(path):
    # 量測與轉檔用同一條濾鏡鏈（先混成單聲道、再調音量），正規化才準
    out = subprocess.run([FFMPEG, '-hide_banner', '-nostats', '-i', path, '-vn', '-af', f'{MONO},volumedetect', '-f', 'null', '-'], capture_output=True, text=True, encoding='utf-8', errors='replace').stderr or ''
    m = re.search(r'max_volume:\s*(-?[\d.]+) dB', out)
    return float(m.group(1)) if m else 0.0


def convert(src, dst):
    gain = TARGET_PEAK_DB - peak_db(src)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', src, '-vn', '-af', f'{MONO},volume={gain:.2f}dB', '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '4', dst], check=True)
    return gain


def main():
    for d in ('007', '008'):
        shutil.rmtree(os.path.join(DST, d), ignore_errors=True)
    videos = sorted([f for f in glob.glob(os.path.join(SRC, '*')) if f.lower().endswith(('.mov', '.mp4', '.m4a', '.wav'))], key=lambda p: natural_key(os.path.basename(p)))
    for i, f in enumerate(videos, 1):
        g = convert(f, os.path.join(DST, '007', f'{i}.mp3'))
        print(f'007/{i}.mp3  ← {os.path.basename(f)[-24:]}  增益 {g:+.1f} dB')
    aoi = os.path.join(SRC, '蒼ダーリン.mp3')
    if os.path.exists(aoi):
        g = convert(aoi, os.path.join(DST, '008', 'aoi-darling.mp3'))
        print(f'008/aoi-darling.mp3  ← 蒼ダーリン.mp3  增益 {g:+.1f} dB')
    else:
        print('找不到 蒼ダーリン.mp3', file=sys.stderr)


if __name__ == '__main__':
    main()
