#!/usr/bin/env python3
# 生成军旅风格的程序化音效（44.1kHz 16bit 单声道 WAV）到 assets/resources/sounds/。
# 设计原则：低调、克制、鼓/锣/木鱼质感，音量留有余地（峰值 ~0.5），
# 作为正式音效资源到位前的可用兜底；后续可直接同名替换。
import math
import os
import random
import struct
import wave

SR = 44100
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "resources", "sounds")


def write_wav(name, samples):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{name}.wav")
    # 轻压限 + 归一化到 0.5 峰值
    peak = max(abs(s) for s in samples) or 1.0
    scale = 0.5 / peak
    with wave.open(path, "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        frames = bytearray()
        for s in samples:
            v = int(max(-1.0, min(1.0, s * scale)) * 32767)
            frames += struct.pack("<h", v)
        f.writeframes(bytes(frames))
    print(f"wrote {path} ({len(samples) / SR:.2f}s)")


def sec(t: float) -> int:
    return int(t * SR)


def env(i: int, n: int, attack: float = 0.005, decay_pow: float = 3.0) -> float:
    """快攻慢衰包络。"""
    t = i / SR
    total = n / SR
    if t < attack:
        return t / attack
    return max(0.0, 1.0 - ((t - attack) / max(1e-9, total - attack))) ** decay_pow


def tone(freq, dur, decay_pow=3.0, harmonics=((1, 1.0),)):
    n = sec(dur)
    out = []
    for i in range(n):
        s = 0.0
        for mult, amp in harmonics:
            s += amp * math.sin(2 * math.pi * freq * mult * i / SR)
        out.append(s * env(i, n, decay_pow=decay_pow))
    return out


def drum_hit(freq_start: float, freq_end: float, dur: float, noise: float = 0.0):
    """鼓：频率下滑 + 指数衰减 + 可选噪声起振。"""
    n = sec(dur)
    out = []
    rnd = random.Random(1942)
    phase = 0.0
    for i in range(n):
        t = i / SR
        prog = t / dur
        freq = freq_start + (freq_end - freq_start) * prog
        phase += 2 * math.pi * freq / SR
        e = math.exp(-t * (10.0 / dur))
        s = math.sin(phase) * e
        if noise > 0 and t < 0.012:
            s += noise * (rnd.random() * 2 - 1) * (1 - t / 0.012)
        out.append(s)
    return out


def mix(*layers):
    n = max(len(x) for x in layers)
    out = [0.0] * n
    for layer in layers:
        for i, s in enumerate(layer):
            out[i] += s
    return out


def delayed(samples, delay):
    pad = [0.0] * sec(delay)
    return pad + samples


def bell(freq: float, dur: float):
    """锣/钟：非整数分音 + 长衰减。"""
    return tone(freq, dur, decay_pow=1.6, harmonics=((1, 1.0), (2.71, 0.55), (4.23, 0.3), (6.1, 0.18)))


# 1) turn — 战鼓双击（回合推进）
turn = mix(drum_hit(148, 66, 0.30, noise=0.35), delayed(drum_hit(120, 55, 0.34, noise=0.3), 0.17))
write_wav("turn", turn)

# 2) select — 木鱼叩击（点选）
select = mix(drum_hit(880, 660, 0.07, noise=0.12), delayed(drum_hit(590, 480, 0.05), 0.045))
write_wav("select", select)

# 3) march — 行军鼓点（出征）
march = mix(
    drum_hit(160, 80, 0.12, noise=0.25),
    delayed(drum_hit(160, 80, 0.12, noise=0.2), 0.16),
    delayed(drum_hit(130, 62, 0.16, noise=0.3), 0.32),
    delayed(drum_hit(130, 62, 0.16, noise=0.25), 0.48),
)
write_wav("march", march)

# 4) battle — 战场轰鸣（鼓 + 金属噪声）
n = sec(0.85)
rnd = random.Random(618)
battle = []
for i in range(n):
    t = i / SR
    e = env(i, n, attack=0.003, decay_pow=1.8)
    noise = (rnd.random() * 2 - 1) * 0.42 * math.exp(-t * 6)
    low = math.sin(2 * math.pi * 72 * t) * math.exp(-t * 3) * 0.9
    rumble = math.sin(2 * math.pi * 47 * t + math.sin(t * 9)) * math.exp(-t * 2.2) * 0.55
    battle.append((noise + low + rumble) * e)
battle = mix(battle, drum_hit(200, 60, 0.5, noise=0.5))
write_wav("battle", battle)

# 5) report — 铜锣（战报）
report = mix(bell(392, 0.9), delayed(bell(294, 0.7), 0.05))
write_wav("report", report)

# 6) alert — 急报钟（领土告急）
alert = mix(bell(523, 0.32), delayed(bell(523, 0.42), 0.22), delayed(bell(659, 0.5), 0.46))
write_wav("alert", alert)

# 7) scheme — 计策（低语般滑音）
n = sec(0.5)
scheme = []
for i in range(n):
    t = i / SR
    freq = 220 * (2 ** (t * 1.6))
    s = math.sin(2 * math.pi * freq * t) * env(i, n, decay_pow=1.4) * 0.7
    s += math.sin(2 * math.pi * freq * 1.5 * t) * env(i, n, decay_pow=2.2) * 0.3
    scheme.append(s)
write_wav("scheme", scheme)

# 8) diplomacy — 礼乐双音（邦交）
diplomacy = mix(tone(392, 0.35, harmonics=((1, 1.0), (2, 0.4))), delayed(tone(523, 0.5, harmonics=((1, 1.0), (2, 0.35))), 0.12))
write_wav("diplomacy", diplomacy)

print("done")
