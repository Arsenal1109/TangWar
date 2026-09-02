#!/usr/bin/env python3
# 军帐背景乐生成器：五声音阶（D 宫调式）拨弦 + 低音持续 + 隐约鼓点，约 30 秒无缝循环。
# 零依赖（wave + math + random），输出 assets/resources/audio/bgm-council.wav。
# 正式配乐到位后可同名替换；循环节点经过处理（持续声整数周期、拨弦不在尾部起音）。
import math
import random
import struct
import wave
import os

SR = 44100
DUR = 30.0
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "assets", "resources", "audio", "bgm-council.wav")

# D 宫五声：D3 E3 F#3 A3 B3（Hz）
SCALE = [146.83, 164.81, 185.00, 220.00, 246.94]
ROOT2 = 73.42   # D2 持续低音
FIFTH2 = 110.0  # A2 持续五度


def pluck(freq, dur, amp):
    """古筝式拨弦：基频 + 二/三次泛音，指数衰减，快速起振。"""
    n = int(dur * SR)
    out = []
    for i in range(n):
        t = i / SR
        env = math.exp(-t * 4.2) * min(1.0, t / 0.004)
        s = (math.sin(2 * math.pi * freq * t) * 1.0
             + math.sin(2 * math.pi * freq * 2 * t) * 0.38
             + math.sin(2 * math.pi * freq * 3.01 * t) * 0.16)
        out.append(s * env * amp)
    return out


def mix_at(canvas, start, samples, gain=1.0):
    idx = int(start * SR)
    for i, s in enumerate(samples):
        j = idx + i
        if 0 <= j < len(canvas):
            canvas[j] += s * gain


def main():
    n = int(DUR * SR)
    rnd = random.Random(618)
    canvas = [0.0] * n

    # 1) 持续低音：D2+A2 正弦，慢呼吸（整数周期保证无缝）
    breath_cycles = 10  # 3 秒/周期 × 10 = 30 秒整数周期
    lfo_period = DUR / breath_cycles
    for i in range(n):
        t = i / SR
        breathe = 0.72 + 0.28 * math.sin(2 * math.pi * t / lfo_period - math.pi / 2)
        s = math.sin(2 * math.pi * ROOT2 * t) * 0.5 + math.sin(2 * math.pi * FIFTH2 * t) * 0.3
        canvas[i] += s * 0.16 * breathe

    # 2) 拨弦声部：稀疏五声旋律，只在 [0, DUR-2.5s] 起音（尾音可自然衰减过循环点，
    #    且首拍前静默 0.4s 留出上一轮尾音空间 → 听感连续）
    beat = 0.75  # 每拍 0.75 秒
    pos = 0.4
    last_deg = 0
    while pos < DUR - 2.5:
        # 音程走向：偏爱级进与四度跳进
        step = rnd.choice([-2, -1, -1, 0, 1, 1, 2, 3])
        deg = max(0, min(len(SCALE) - 1, last_deg + step))
        last_deg = deg
        dur = rnd.choice([1.8, 2.4, 3.2])
        amp = rnd.uniform(0.10, 0.17)
        mix_at(canvas, pos, pluck(SCALE[deg], dur, amp))
        # 偶尔高八度回声
        if rnd.random() < 0.22:
            mix_at(canvas, pos + beat * 0.5, pluck(SCALE[deg] * 2, 1.4, amp * 0.45))
        pos += beat * rnd.choice([2, 2, 3, 4, 4, 6])

    # 3) 隐约战鼓：每小节（4 拍）一记闷鼓，音量极低
    bar = beat * 4
    t0 = 0.4
    while t0 < DUR - 1.0:
        dur = 0.28
        m = int(dur * SR)
        phase = 0.0
        for i in range(m):
            tt = i / SR
            prog = tt / dur
            freq = 82 * (1 - 0.45 * prog)
            phase += 2 * math.pi * freq / SR
            env = math.exp(-tt * 14)
            j = int(t0 * SR) + i
            if j < n:
                canvas[j] += math.sin(phase) * env * 0.11
        t0 += bar * 2

    # 4) 极轻的空气感：慢变噪声（伪滤波：相邻样本低通）
    prev = 0.0
    rnd2 = random.Random(907)
    for i in range(n):
        x = (rnd2.random() * 2 - 1) * 0.5
        prev = prev * 0.995 + x * 0.005
        canvas[i] += prev * 0.05

    # 压限 + 归一到 0.32 峰值（bgmSource.volume=0.32 再叠一层，实际听感温和）
    peak = max(abs(s) for s in canvas) or 1.0
    scale = 0.32 / peak
    frames = bytearray()
    for s in canvas:
        v = int(max(-1.0, min(1.0, s * scale)) * 32767)
        frames += struct.pack("<h", v)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with wave.open(OUT, "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(bytes(frames))
    print("wrote %s (%.1fs, %.1fKB)" % (OUT, DUR, len(frames) / 1024.0))


if __name__ == "__main__":
    main()
