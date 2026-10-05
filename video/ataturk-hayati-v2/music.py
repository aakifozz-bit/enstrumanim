"""v2 için arka plan müziği (re minör, sahne geçişleriyle eşzamanlı akorlar).

v1'deki sentezleyicinin anlatım altında çalışacak şekilde sadeleştirilmiş hâli:
ped + bas + piyano arpejleri + timpani; ana ezgi yalnızca kapanışta.
`score(starts, durations)` -> (2, n) float64 stereo dizi, 44.1 kHz.
"""

import math

import numpy as np

SR = 44100
PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "Bb": 10}
CHORDS = {"Dm": ("D", 3), "Bb": ("Bb", 4), "F": ("F", 4), "C": ("C", 4), "Gm": ("G", 3),
          "A": ("A", 4), "D": ("D", 4)}
# her sahne için (ilk yarı, ikinci yarı) akorları; son sahne ayrıca tanımlı
CHORD_PLAN = [("Dm", "Dm"), ("Bb", "F"), ("C", "Dm"), ("Bb", "Gm"), ("F", "C"), ("Dm", "Bb"),
              ("F", "C"), ("Bb", "C"), ("F", "Bb"), ("C", "A")]


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def voicing(name):
    root, third = CHORDS[name]
    pc = PC[root]
    r = 48 + pc if pc <= 5 else 36 + pc
    pad = [r, r + 7, r + 12, r + 12 + third, r + 19]
    a = 60 + pc if pc < 7 else 48 + pc
    arp = [a, a + third, a + 7, a + 12, a + 12 + third, a + 19]
    bass = r - 12 if r - 12 >= 36 else r
    return pad, bass, arp


def env_adsr(n, attack, release_start, release):
    t = np.arange(n) / SR
    e = np.sin(np.clip(t / max(attack, 1e-4), 0, 1) * np.pi / 2) ** 2
    rel = np.clip((t - release_start) / release, 0, 1)
    return e * np.cos(rel * np.pi / 2) ** 2


def score(starts, durations, total, final_start):
    """starts/durations: ilk len(CHORD_PLAN) sahnenin zamanlaması; final_start: kapanış sahnesi."""
    rng = np.random.default_rng(5)
    n = int(SR * (total + 3))
    tt = np.arange(n) / SR
    stems = {k: np.zeros((2, n)) for k in ("pad", "bass", "piano", "lead", "perc", "bell")}

    def add(stem, sig, start, pan=0.0, sig_r=None):
        i0 = int(round(start * SR))
        if i0 < 0:
            sig = sig[-i0:]
            sig_r = None if sig_r is None else sig_r[-i0:]
            i0 = 0
        i1 = min(n, i0 + len(sig))
        m = i1 - i0
        gl, gr = math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)
        stems[stem][0, i0:i1] += sig[:m] * gl
        stems[stem][1, i0:i1] += (sig if sig_r is None else sig_r)[:m] * gr

    def saw(f, t, cents):
        out = np.zeros_like(t)
        ff = f * 2 ** (cents / 1200)
        ph = rng.uniform(0, 2 * np.pi)
        for h in range(1, 14):
            if ff * h > 6000:
                break
            out += np.sin(2 * np.pi * ff * h * t + ph * h) / h * math.exp(-h / 4.0)
        return out

    chords = []
    for i, (a, b) in enumerate(CHORD_PLAN):
        s, d = starts[i], durations[i]
        chords += [(s, s + d / 2, a), (s + d / 2, s + d, b)]
    f0 = final_start
    chords += [(f0, f0 + 2.5, "Dm"), (f0 + 2.5, total - 1.7, "Bb"), (total - 1.7, total + 1.5, "D")]
    merged = []
    for c in chords:
        if merged and merged[-1][2] == c[2]:
            merged[-1] = (merged[-1][0], c[1], c[2])
        else:
            merged.append(c)
    chords = merged

    def chord_at(t):
        for s, e, nme in chords:
            if s <= t < e:
                return nme
        return chords[-1][2]

    for s, e, name in chords:
        pad, bass, _ = voicing(name)
        start, length = s - 0.3, (e - s) + 0.3
        nn = int((length + 1.2) * SR)
        t = np.arange(nn) / SR
        env = env_adsr(nn, 0.8, length, 1.2)
        L = sum(saw(hz(m), t, -7) + saw(hz(m), t, 3) for m in pad) * env
        R = sum(saw(hz(m), t, -3) + saw(hz(m), t, 8) for m in pad) * env
        add("pad", L, start, 0.0, R)
        fb = hz(bass)
        b = (np.sin(2 * np.pi * fb * t) + 0.35 * np.sin(4 * np.pi * fb * t)
             + 0.12 * np.sin(6 * np.pi * fb * t)) * env_adsr(nn, 0.15, length, 1.0)
        add("bass", b, start)

    def piano(f, vel, dur=2.4):
        t = np.arange(int(dur * SR)) / SR
        sig = sum((1 / h ** 1.5) * np.sin(2 * np.pi * f * h * (1 + 0.0004 * h * h) * t)
                  * np.exp(-t * (1.2 + 0.8 * h)) for h in range(1, 7))
        return sig * np.clip(t / 0.004, 0, 1) * np.exp(-t * 0.9) * vel

    pattern = [0, 1, 2, 3, 4, 3, 2, 1]
    t0, k = starts[1] + 0.1, 0
    while t0 < final_start - 0.2:
        step = 0.375 if t0 < starts[6] else 0.25
        _, _, arp = voicing(chord_at(t0))
        idx = pattern[k % len(pattern)]
        vel = (0.6 + 0.3 * (k % 4 == 0)) * clamp((t0 - starts[1]) / 2.5, 0.25, 1)
        add("piano", piano(hz(arp[idx]), vel), t0, -0.35 + 0.14 * idx)
        t0 += step
        k += 1

    # kapanış ezgisi
    for s, d, m in ((f0 + 0.2, 2.3, 74), (f0 + 2.5, total - 1.7 - f0 - 2.5, 74),
                    (total - 1.7, 3.0, 78)):
        nn = int((d + 0.8) * SR)
        t = np.arange(nn) / SR
        f = hz(m) * (1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.35) / 0.4, 0, 1))
        ph = 2 * np.pi * np.cumsum(f) / SR
        sig = sum(a * np.sin(h * ph) for h, a in
                  enumerate([1.0, 0.45, 0.28, 0.16, 0.09, 0.05], start=1))
        add("lead", sig * env_adsr(nn, 0.28, d, 0.7), s, 0.1)

    def timp(amp, f0_=73.42):
        nn = int(2.2 * SR)
        t = np.arange(nn) / SR
        f = f0_ * (1 + 0.08 * np.exp(-t * 9))
        ph = 2 * np.pi * np.cumsum(f) / SR
        sig = sum(a * np.sin(r * ph) * np.exp(-t * dcy) for r, a, dcy in
                  ((1, 1.0, 2.2), (1.5, 0.45, 3.5), (1.98, 0.3, 4.5), (2.44, 0.18, 6)))
        noise = rng.normal(0, 1, nn)
        noise = np.convolve(noise, np.ones(30) / 30, mode="same") * np.exp(-t * 35) * 2.5
        return (sig + noise) * amp

    hits = [(0.4, 0.5), (starts[3], 0.8), (starts[4], 0.6), (starts[6], 0.9),
            (starts[6] + durations[6] / 2, 0.55), (starts[7], 1.0), (starts[9], 0.5),
            (total - 1.7, 1.0)]
    for s, a in hits:
        add("perc", timp(a), s)
    tr = total - 3.4
    while tr < total - 1.75:
        add("perc", timp(0.06 + 0.3 * ((tr - (total - 3.4)) / 1.65) ** 2), tr,
            rng.uniform(-0.2, 0.2))
        tr += 0.075

    for s, m in ((f0 + 0.3, 74), (f0 + 1.5, 69)):
        nn = int(4.0 * SR)
        t = np.arange(nn) / SR
        f = hz(m)
        sig = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * dcy) for r, a, dcy in
                  ((1, 1.0, 0.9), (2.0, 0.45, 1.5), (2.76, 0.35, 2.2), (5.4, 0.15, 3.6)))
        add("bell", sig * np.clip(t / 0.003, 0, 1), s, rng.uniform(-0.3, 0.3))

    def auto(points):
        xs, ys = zip(*points)
        return np.interp(tt, xs, ys)

    stems["pad"] *= auto([(0, 0), (1.5, 0.6), (starts[3], 0.7), (starts[6], 0.95),
                          (final_start - 0.4, 0.85), (final_start + 0.6, 0.55),
                          (total - 1.7, 1.0), (total + 3, 0.9)])
    stems["bass"] *= auto([(0, 0), (2, 0.6), (starts[3], 0.8), (starts[6], 1.0),
                           (final_start, 0.6), (total - 1.7, 1.0)])
    gains = {"pad": 0.24, "bass": 0.09, "piano": 0.17, "lead": 0.10, "perc": 0.35, "bell": 0.14}
    for k_, g in gains.items():
        peak = np.abs(stems[k_]).max()
        stems[k_] *= g / max(peak, 1e-9)
    dry = sum(stems.values())

    ir_n = int(2.8 * SR)
    ti = np.arange(ir_n) / SR
    wet = np.zeros_like(dry)
    size = 1 << int(math.ceil(math.log2(n + ir_n)))
    for ch in range(2):
        ir = rng.normal(0, 1, ir_n) * np.exp(-ti * 2.6)
        ir = np.convolve(ir, np.ones(6) / 6, mode="same")
        ir[: int(0.02 * SR)] = 0
        ir /= np.sqrt((ir ** 2).sum())
        wet[ch] = np.fft.irfft(np.fft.rfft(dry[ch], size) * np.fft.rfft(ir, size), size)[:n]
    mix = dry + 0.45 * wet
    freqs = np.fft.rfftfreq(size, 1 / SR)
    hp = 1 / np.sqrt(1 + (40.0 / np.maximum(freqs, 1e-3)) ** 4)
    for ch in range(2):
        mix[ch] = np.fft.irfft(np.fft.rfft(mix[ch], size) * hp, size)[:n]
    mix = mix[:, : int(SR * total)]
    return mix / np.abs(mix).max()
