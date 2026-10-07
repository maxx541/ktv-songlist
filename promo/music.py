"""MakoSing 示範影片的原創配樂與音效（純 numpy 合成，不用任何樣本）。
讀 promo/out/cues.json（stage.js 產生的音效提示），輸出 promo/out/music.wav（立體聲 44.1kHz）。
曲風：輕快的 city-pop／lo-fi，C 大調，BPM 112。段落跟影片對齊：
  0–4.4 片頭（只有鋪底與亮晶晶的琶音）→ 4.4 起節奏進來 → 22.4 起加入主旋律琶音 → 41.8 起更飽滿 → 53.6 起收尾、長音結束。
用法：python promo/music.py
"""
import json
import os

import numpy as np
import soundfile as sf

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
BPM = 112
BEAT = 60 / BPM
BAR = BEAT * 4
rng = np.random.default_rng(7)

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

CH = {  # 和弦：(根音, 和弦音們) MIDI
    'F': (41, [60, 64, 67, 69]),     # Fmaj6 色彩
    'G': (43, [59, 62, 67, 71]),
    'E': (40, [59, 62, 67, 71]),     # Em7
    'A': (45, [60, 64, 67, 72]),     # Am7
    'C': (48, [60, 64, 67, 71]),     # Cmaj7
}
PROG = ['F', 'G', 'E', 'A']
nbars = int(TOTAL / BAR) + 1
bars = []
for b in range(nbars):
    bars.append(PROG[b % 4])
# 收尾：最後幾小節走 F G A C
for k, ch in zip(range(nbars - 5, nbars - 1), ['F', 'G', 'A', 'C']):
    bars[k] = ch
LAST_BAR_START = (nbars - 5 + 3) * BAR      # 最後那個 C 長音開始的時間


def level(t):
    """依段落決定各層音量：回傳 dict。"""
    L = {'pad': 1.0, 'epiano': 0, 'bass': 0, 'drums': 0, 'hat': 0, 'arp': 0, 'sparkle': 1.0}
    if t >= 4.4:
        L.update(epiano=1, bass=1, drums=1, hat=1)
    if t >= 22.4:
        L.update(arp=0.7)
    if t >= 41.8:
        L.update(arp=1.0)
    if t >= 53.6:
        L.update(drums=0, hat=0, arp=0.4)
    return L


for b, ch in enumerate(bars):
    t0 = b * BAR
    root, tones = CH[ch]
    L = level(t0 + 0.01)
    final = t0 >= LAST_BAR_START - 1e-6
    # 鋪底（每小節一個長音，intro 就有）
    for p in tones:
        put(send, t0, pad(midi(p - 12), BAR * (3.2 if final else 1.05), 1.0 * L['pad']), pan=rng.uniform(-0.5, 0.5))
    if final:
        for k, p in enumerate(tones):
            put(send, t0 + k * 0.05, epiano(midi(p), 3.5, 0.7), pan=(k - 1.5) * 0.3)
        put(music, t0, bass(midi(root), 3.0, 0.9))
        continue
    if L['epiano']:
        # 切分和弦刷奏（八分音符，反拍有重音）
        for step, accent in ((0, 1.0), (3, 0.8), (4, 0.6), (6, 0.9)):
            st = t0 + step * BEAT / 2
            for k, p in enumerate(tones):
                put(send, st + k * 0.012, epiano(midi(p), BEAT * 0.9, 0.55 * accent), pan=(k - 1.5) * 0.25)
    if L['bass']:
        for step, note, dur in ((0, root, 0.9), (3, root, 0.4), (4, root + 7, 0.5), (6, root + 12, 0.4)):
            put(music, t0 + step * BEAT / 2, bass(midi(note), BEAT * dur, 0.9))
    if L['drums']:
        for beat in range(4):
            tb = t0 + beat * BEAT
            if beat in (0, 2):
                put(music, tb, kick(1.0), gain=1.0)
            if beat in (1, 3):
                put(music, tb, snare(0.8))
        put(music, t0 + 2.5 * BEAT, kick(0.7))
    if L['hat']:
        for s8 in range(8):
            put(music, t0 + s8 * BEAT / 2, hat(0.7 if s8 % 2 == 0 else 0.45, open_=(s8 == 7)), pan=0.25)
    if L['arp']:
        # 十六分音符琶音（高八度），帶一點回音感由殘響處理
        order = [0, 2, 1, 3, 2, 1, 3, 2]
        for s16 in range(8):
            p = tones[order[s16]] + 12
            put(send, t0 + s16 * BEAT / 2 + BEAT / 4 * (s16 % 2), pluck(midi(p), 0.3, 0.8 * L['arp']), pan=0.35 * (1 if s16 % 2 else -1))

# 片頭的亮晶晶（0–4.4）：五聲音階往上
for k, p in enumerate([76, 79, 83, 84, 88, 91]):
    put(send, 0.9 + k * 0.28, bell(midi(p), 1.2, 0.8), pan=(-1) ** k * 0.4)

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
# 開頭淡入、結尾淡出
mix *= np.minimum(T / 0.6, 1.0)[:, None]
mix *= np.clip((TOTAL - T) / 1.4, 0, 1)[:, None]
peak = np.abs(mix).max()
mix = mix / peak * 0.89     # 約 -1 dBFS
sf.write(os.path.join(OUT, 'music.wav'), mix.astype(np.float32), SR, subtype='PCM_16')
rms = 20 * np.log10(np.sqrt((mix ** 2).mean()) + 1e-9)
print(f'已輸出 music.wav：{TOTAL:.1f}s，峰值 -1 dBFS，平均音量 {rms:.1f} dBFS，音效 {len(cues["cues"])} 個')
