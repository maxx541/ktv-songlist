"""MakoSing 示範影片的原創配樂與音效（純 numpy 合成，不用任何樣本）。
讀 promo/out/cues.json（stage.js 產生的音效提示），輸出 promo/out/music.wav（立體聲 44.1kHz）。
曲風：快節奏的 city-pop／future-pop，C 大調，BPM 128。段落跟影片對齊（時間由 cues.json 的 sections 決定）：
  片頭（鋪底與亮晶晶的鈴聲）→ 節奏進來 → 加入十六分音符琶音 → 最後一段更飽滿 → 收尾、長音結束。
用法：python promo/music.py                              （用自己合成的配樂）
      python promo/music.py --music-file 某首.mp3 [起點秒數]  （配樂換成指定的音樂檔；音效仍是合成的）
"""
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
BPM = 128
BEAT = 60 / BPM
BAR = BEAT * 4
rng = np.random.default_rng(7)

FFMPEG = r'C:\Program Files (x86)\ffmpeg-8.0-essentials_build\bin\ffmpeg.exe'
_i = sys.argv.index('--music-file') if '--music-file' in sys.argv else -1
EXT = sys.argv[_i + 1] if _i >= 0 else None
EXT_START = float(sys.argv[_i + 2]) if _i >= 0 and len(sys.argv) > _i + 2 else 0.0
EXT_GAIN = 0.62      # 外部音樂本身很大聲（真峰值超過 0 dBFS），先壓一點，音效才聽得清楚

cues = json.load(open(os.path.join(OUT, 'cues.json'), encoding='utf-8'))
TOTAL = cues['total'] + 1.6               # 後面多留一小段殘響
N = int(TOTAL * SR)
T = np.arange(N) / SR


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def env_ad(n, a, d):
    """快速起音、指數衰減。"""
    t = np.arange(n) / SR
    return np.minimum(t / max(a, 1e-4), 1.0) * np.exp(-t / d)


def put(buf, start, sig, pan=0.0, gain=1.0):
    """把單聲道 sig 混進立體聲 buf（pan -1..1）。"""
    i = int(start * SR)
    if i >= N or i < 0:
        return
    sig = sig[: N - i]
    l = gain * np.cos((pan + 1) * np.pi / 4)
    r = gain * np.sin((pan + 1) * np.pi / 4)
    buf[i:i + len(sig), 0] += sig * l
    buf[i:i + len(sig), 1] += sig * r


# ---------- 樂器 ----------
def epiano(f, dur, vel=1.0):
    n = int((dur + 0.6) * SR)
    t = np.arange(n) / SR
    idx = 1.6 * np.exp(-t / 0.35) + 0.25
    car = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * 1.0 * t))
    bell = 0.18 * np.sin(2 * np.pi * f * 4 * t) * np.exp(-t / 0.08)
    amp = np.exp(-t / (dur * 0.9 + 0.25)) * np.minimum(t / 0.004, 1.0)
    rel = np.clip((dur + 0.3 - t) / 0.3, 0, 1)
    return (car + bell) * amp * rel * vel * 0.5


def pad(f, dur, vel=1.0):
    n = int((dur + 1.2) * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for det in (-0.004, 0.0, 0.004):
        ff = f * (1 + det)
        for h, g in ((1, 1.0), (2, 0.45), (3, 0.25), (4, 0.12)):
            s += g * np.sin(2 * np.pi * ff * h * t + rng.uniform(0, 6.28))
    a = np.minimum(t / 0.9, 1.0)
    r = np.clip((dur + 1.0 - t) / 1.0, 0, 1)
    return s * a * r * vel * 0.07


def bass(f, dur, vel=1.0):
    n = int((dur + 0.1) * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / 0.15)
    s = np.tanh(1.6 * s) * np.exp(-t / (dur * 1.1)) * np.minimum(t / 0.005, 1.0)
    return s * np.clip((dur + 0.08 - t) / 0.08, 0, 1) * vel * 0.55


def pluck(f, dur=0.35, vel=1.0):
    n = int((dur + 0.2) * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for h, g in ((1, 1.0), (2, 0.5), (3, 0.3), (4, 0.15), (5, 0.08)):
        s += g * np.sin(2 * np.pi * f * h * t) * np.exp(-t * h / 0.25)
    return s * np.minimum(t / 0.002, 1.0) * vel * 0.28


def kick(vel=1.0):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    f = 48 + 90 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.14) * vel * 0.9


def hp_noise(n, k=1):
    x = rng.standard_normal(n)
    for _ in range(k):
        x = np.diff(x, prepend=0.0)
    return x / (np.abs(x).max() + 1e-9)


def snare(vel=1.0):
    n = int(0.28 * SR)
    t = np.arange(n) / SR
    noise = hp_noise(n) * np.exp(-t / 0.07)
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.05)
    return (0.8 * noise + 0.5 * tone) * vel * 0.55


def hat(vel=1.0, open_=False):
    n = int((0.22 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    return hp_noise(n, 2) * np.exp(-t / (0.09 if open_ else 0.015)) * vel * 0.28


def bell(f, dur=0.9, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = sum(g * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d) for r, g, d in ((1, 1, 0.45), (2.76, 0.45, 0.2), (5.4, 0.2, 0.1)))
    return s * np.minimum(t / 0.002, 1.0) * vel * 0.3


def sweep_noise(dur, f0, f1, width=0.7):
    """逐塊做 FFT 頻帶濾波：中心頻率從 f0 掃到 f1 的噪音（whoosh／swipe 用）。"""
    n = int(dur * SR)
    blk = 2048
    hop = blk // 2
    win = np.hanning(blk)
    out = np.zeros(n + blk)
    freqs = np.fft.rfftfreq(blk, 1 / SR)
    for s in range(0, n, hop):
        p = s / max(n, 1)
        fc = f0 * (f1 / f0) ** p
        mask = np.exp(-0.5 * ((np.log(freqs + 1) - np.log(fc)) / width) ** 2)
        x = np.fft.irfft(np.fft.rfft(rng.standard_normal(blk) * win) * mask, blk)
        out[s:s + blk] += x * win
    out = out[:n]
    return out / (np.abs(out).max() + 1e-9)


# ---------- 配樂 ----------
music = np.zeros((N, 2))
send = np.zeros((N, 2))   # 進殘響的訊號

SEC = cues['sections']                      # 影片各段落的開始時間（stage.js 提供）
GRID0 = max(0.0, SEC['groove'] - 2 * BAR)   # 節拍格從這裡開始，讓「節奏進來」剛好落在小節線上（前面兩小節是片頭）
bar_of = lambda t: max(0, int(round((t - GRID0) / BAR)))
B_GROOVE, B_ARP, B_FULL, B_OUTRO = bar_of(SEC['groove']), bar_of(SEC['arp']), bar_of(SEC['full']), bar_of(SEC['outro'] + 0.5)

CH = {  # 和弦：(根音, 和弦音們) MIDI
    'F': (41, [60, 64, 67, 69]),     # Fmaj6 色彩
    'G': (43, [59, 62, 67, 71]),
    'E': (40, [59, 62, 67, 71]),     # Em7
    'A': (45, [60, 64, 67, 72]),     # Am7
    'C': (48, [60, 64, 67, 71]),     # Cmaj7
}
PROG = ['F', 'G', 'E', 'A']
nbars = int((TOTAL - GRID0) / BAR) + 1
bars = [PROG[b % 4] for b in range(nbars)]
for k, ch in zip(range(nbars - 5, nbars - 1), ['F', 'G', 'A', 'C']):   # 收尾走 F G A C，最後一個 C 長音
    bars[k] = ch
LAST_BAR = nbars - 2

# 每個段落開始前一小節放一個上升的噪音（riser）＋ 小鼓滾奏，帶出能量
def riser(t_end, dur=BAR, gain=0.7):
    x = sweep_noise(dur, 400, 7000, 0.9)
    env = np.linspace(0, 1, len(x)) ** 2
    put(music, t_end - dur, x * env * gain)


for b, ch in enumerate(bars):
    t0 = GRID0 + b * BAR
    if t0 >= TOTAL:
        break
    root, tones = CH[ch]
    intro = b < B_GROOVE
    outro = b >= B_OUTRO
    last = b >= LAST_BAR
    arp_gain = 0.0 if b < B_ARP else (0.65 if b < B_FULL else 1.0)
    if outro and not last:
        arp_gain = 0.45
    # 鋪底
    for p in tones:
        put(send, t0, pad(midi(p - 12), BAR * (3.2 if last else 1.05), 1.0), pan=rng.uniform(-0.5, 0.5))
    if last:
        for k, p in enumerate(tones):
            put(send, t0 + k * 0.04, epiano(midi(p), 3.0, 0.7), pan=(k - 1.5) * 0.3)
        put(music, t0, bass(midi(root), 2.5, 0.9))
        put(music, t0, kick(1.0))
        continue
    if intro:
        continue
    # 底鼓：四四拍每拍一下；2、4 拍加拍手／小鼓；16 分音符的 hi-hat
    if not outro:
        for beat in range(4):
            put(music, t0 + beat * BEAT, kick(1.0 if beat in (0, 2) else 0.85))
            if beat in (1, 3):
                put(music, t0 + beat * BEAT, snare(0.9))
        for s16 in range(16):
            accent = 1.0 if s16 % 4 == 2 else (0.6 if s16 % 2 == 0 else 0.35)
            put(music, t0 + s16 * BEAT / 4, hat(accent, open_=(s16 % 8 == 6)), pan=0.25)
        if b >= B_FULL:                                    # 最後一段更滿：加一層反拍小鼓與 16 分音符底鼓點綴
            put(music, t0 + 3.5 * BEAT, snare(0.55))
            put(music, t0 + 2.75 * BEAT, kick(0.6))
    else:
        put(music, t0, kick(0.9)); put(music, t0 + 2 * BEAT, kick(0.7))
    # 貝斯：八分音符推進（根音—八度交錯）
    for s8, note in enumerate([root, root, root + 12, root, root, root + 7, root + 12, root + 7]):
        put(music, t0 + s8 * BEAT / 2, bass(midi(note), BEAT * 0.42, 0.85))
    # 電鋼琴：反拍八分音符短刷奏
    for s8 in (1, 3, 5, 7):
        st = t0 + s8 * BEAT / 2
        for k, p in enumerate(tones):
            put(send, st + k * 0.008, epiano(midi(p), BEAT * 0.4, 0.5 + 0.1 * (s8 == 7)), pan=(k - 1.5) * 0.25)
    # 十六分音符琶音（高八度），左右交替
    if arp_gain > 0:
        order = [0, 1, 2, 3, 2, 1, 3, 2, 0, 1, 2, 3, 1, 2, 3, 2]
        for s16 in range(16):
            p = tones[order[s16]] + 12
            put(send, t0 + s16 * BEAT / 4, pluck(midi(p), 0.22, 0.75 * arp_gain), pan=0.4 * (1 if s16 % 2 else -1))

# 段落轉換：上升噪音 + 前一小節最後一拍的小鼓滾奏
for sec_bar in (B_GROOVE, B_ARP, B_FULL):
    t_sec = GRID0 + sec_bar * BAR
    riser(t_sec, BAR * (2 if sec_bar == B_GROOVE else 1))
    if sec_bar != B_GROOVE:
        for k in range(8):
            put(music, t_sec - BEAT + k * BEAT / 8, snare(0.35 + 0.08 * k))
    put(music, t_sec, kick(1.1))

# 片頭的亮晶晶：五聲音階往上
for k, p in enumerate([76, 79, 83, 84, 88, 91]):
    put(send, 0.5 + k * 0.2, bell(midi(p), 1.2, 0.8), pan=(-1) ** k * 0.4)
# ---------- 外部音樂：取代上面合成的配樂 ----------
if EXT:
    raw = subprocess.run([FFMPEG, '-v', 'error', '-ss', str(EXT_START), '-i', EXT, '-ar', str(SR), '-ac', '2', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    ext = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)
    if len(ext) < N:                                   # 音樂比影片短就循環
        ext = np.tile(ext, (int(np.ceil(N / len(ext))), 1))
    music[:] = ext[:N] * EXT_GAIN
    send[:] = 0

# ---------- 殘響 ----------
ir_n = int(1.6 * SR)
ir = np.stack([rng.standard_normal(ir_n) * np.exp(-np.arange(ir_n) / SR / 0.45) for _ in range(2)], axis=1)
ir[:int(0.012 * SR)] = 0
nfft = 1 << int(np.ceil(np.log2(N + ir_n)))
wet = np.zeros((N, 2))
for c in range(2):
    wet[:, c] = np.fft.irfft(np.fft.rfft(send[:, c], nfft) * np.fft.rfft(ir[:, c], nfft), nfft)[:N]
wet *= 0.10
music += send * 0.85 + wet

# ---------- 音效 ----------
sfx = np.zeros((N, 2))


def sfx_click():
    n = int(0.05 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 1700 * t) * np.exp(-t / 0.012) + 0.4 * hp_noise(n) * np.exp(-t / 0.006)) * 0.6


def sfx_tick(k):
    n = int(0.025 * SR); t = np.arange(n) / SR
    return hp_noise(n) * np.exp(-t / 0.006) * (0.35 + 0.1 * (k % 3)) + 0.2 * np.sin(2 * np.pi * (2300 + 120 * (k % 4)) * t) * np.exp(-t / 0.01)


def sfx_pop():
    n = int(0.12 * SR); t = np.arange(n) / SR
    f = 520 + 520 * np.minimum(t / 0.05, 1)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.05) * 0.7


def sfx_paste():
    n = int(0.18 * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 110 * t) * np.exp(-t / 0.05) + 0.5 * hp_noise(n) * np.exp(-t / 0.02)) * 0.7


def sfx_ding():
    return bell(midi(84), 0.9, 0.9) + 0.6 * bell(midi(88), 0.9, 0.9)


def sfx_swipe():
    x = sweep_noise(0.4, 600, 3000, 0.6)
    t = np.arange(len(x)) / SR
    return x * np.sin(np.pi * np.clip(t / 0.4, 0, 1)) ** 2 * 0.55


def sfx_whoosh():
    x = sweep_noise(0.9, 250, 4500, 0.8)
    t = np.arange(len(x)) / SR
    return x * np.sin(np.pi * np.clip(t / 0.9, 0, 1)) ** 1.5 * 0.7


def sfx_sparkle():
    out = np.zeros(int(1.5 * SR))
    for k, p in enumerate([84, 88, 91, 96]):
        b = bell(midi(p), 0.9, 0.7)
        i = int(k * 0.07 * SR)
        out[i:i + len(b)] += b[: len(out) - i]
    return out


counter = 0
for c in cues['cues']:
    ty, tt = c['type'], c['t']
    counter += 1
    if ty == 'click':
        put(sfx, tt, sfx_click(), pan=0.0, gain=0.9)
    elif ty == 'tick':
        put(sfx, tt, sfx_tick(counter), pan=rng.uniform(-0.2, 0.2), gain=0.8)
    elif ty == 'pop':
        put(sfx, tt, sfx_pop(), pan=0.15, gain=0.8)
    elif ty == 'paste':
        put(sfx, tt, sfx_paste(), gain=0.9)
    elif ty == 'ding':
        put(sfx, tt, sfx_ding(), pan=0.1, gain=0.8)
    elif ty == 'swipe':
        put(sfx, tt, sfx_swipe(), pan=-0.1, gain=0.6)
    elif ty == 'whoosh':
        put(sfx, tt - 0.25, sfx_whoosh(), gain=0.8)
    elif ty == 'sparkle':
        put(sfx, tt, sfx_sparkle(), pan=0.2, gain=0.8)

# ---------- 混音、淡出、輸出 ----------
# 音效出現時，把配樂壓低一點點（ducking），讓點擊聲與提示音聽得清楚
duck = np.ones(N)
for c in cues['cues']:
    if c['type'] in ('whoosh', 'ding', 'sparkle'):
        i = int(c['t'] * SR)
        seg = np.arange(int(0.7 * SR))
        g = 1 - 0.25 * np.exp(-seg / (0.25 * SR))
        duck[i:i + len(seg)] = np.minimum(duck[i:i + len(seg)], g[: N - i])
mix = music * duck[:, None] * 0.9 + sfx * 0.85
if EXT:
    # 外部音樂本來就母帶處理過、峰值很高，直接正規化會偏小聲；用輕微的軟限幅把中段音量拉上來，峰值不變
    mix = np.tanh(1.5 * mix) / np.tanh(1.5)
# 開頭淡入、結尾淡出
mix *= np.minimum(T / 0.6, 1.0)[:, None]
mix *= np.clip((TOTAL - T) / 1.4, 0, 1)[:, None]
peak = np.abs(mix).max()
mix = mix / peak * 0.89     # 約 -1 dBFS
sf.write(os.path.join(OUT, 'music.wav'), mix.astype(np.float32), SR, subtype='PCM_16')
rms = 20 * np.log10(np.sqrt((mix ** 2).mean()) + 1e-9)
print(f'已輸出 music.wav：{TOTAL:.1f}s，峰值 -1 dBFS，平均音量 {rms:.1f} dBFS，音效 {len(cues["cues"])} 個')
