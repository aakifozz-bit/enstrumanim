"""Original score + sound design for THE LAST PAGE (all synthesized, no samples)."""
import sys
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt
from scipy.io import wavfile

SR = 44100
DUR = 63.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)
REV_L = np.zeros(N); REV_R = np.zeros(N)  # send buses

def T(t): return int(t * SR)
def lp(x, fc, o=2): return sosfilt(butter(o, fc, 'low', fs=SR, output='sos'), x)
def hp(x, fc, o=2): return sosfilt(butter(o, fc, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)
def env(n, a, d, s_lvl=1.0, rel=None):
    e = np.ones(n) * s_lvl
    na = max(1, int(a * SR)); e[:na] = np.linspace(0, 1, na) ** 2 * s_lvl
    if rel: nr = min(n, int(rel * SR)); e[-nr:] *= np.linspace(1, 0, nr) ** 2
    return e
def add(sig, t, pan=0.0, gain=1.0, rev=0.3):
    i = T(t); j = min(N, i + len(sig)); sig = sig[: j - i] * gain
    gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    L[i:j] += sig * gl * (1 - rev * 0.5); R[i:j] += sig * gr * (1 - rev * 0.5)
    REV_L[i:j] += sig * gl * rev; REV_R[i:j] += sig * gr * rev
def noise(n): return rng.standard_normal(n)
def hz(name):
    names = {'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5, 'F': -4, 'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2}
    n, o = name[:-1], int(name[-1]); return 440 * 2 ** ((names[n] + (o - 4) * 12) / 12)

# ---------- instruments ----------
def felt_piano(f, dur=4.0, vel=0.7, bright=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; out = np.zeros(n)
    B = 0.0004
    for k in range(1, 12):
        fk = f * k * np.sqrt(1 + B * k * k)
        if fk > 9000: break
        amp = (1 / k ** (1.6 - 0.3 * bright)) * (0.6 + 0.4 * vel)
        dec = 0.6 + 0.55 * k * (f / 440) ** 0.5
        out += amp * np.sin(2 * np.pi * fk * t + rng.random() * 6) * np.exp(-dec * t)
    out += 0.5 * np.sin(2 * np.pi * f * t) * np.exp(-0.35 * t)  # sustain body
    thump = lp(noise(n), 900) * np.exp(-t * 60) * 0.25
    out = out + thump
    a = int(0.006 * SR); out[:a] *= np.linspace(0, 1, a)
    rel = int(0.3 * SR); out[-rel:] *= np.linspace(1, 0, rel)
    return lp(out, 1800 + 2500 * vel * bright) * vel
def strings(f, dur, att=1.2, rel=1.5, bright=0.5, vib=0.004):
    n = int(dur * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for d in (-0.006, -0.002, 0.003, 0.007):
        ph = 2 * np.pi * f * (1 + d) * t + 2 * np.pi * vib * f * np.sin(2 * np.pi * (5 + d * 100) * t) / 5.3
        for k in range(1, 16):
            if f * k > 8000: break
            out += np.sin(k * ph + rng.random() * 6) / k * np.exp(-k * (1 - bright) * 0.18)
    out *= env(n, att, 0, 1, rel) / 6
    return lp(out, 1200 + 4000 * bright)
def brass(f, dur, att=0.8, rel=1.2, bright=0.6):
    n = int(dur * SR); t = np.arange(n) / SR; out = np.zeros(n)
    e = env(n, att, 0, 1, rel)
    for k in range(1, 14):
        if f * k > 7000: break
        out += np.sin(2 * np.pi * f * k * t * (1 + 0.001 * np.sin(2 * np.pi * 4.5 * t))) * (e ** (1 + k * (1 - bright) * 0.4)) / k ** 1.1
    return lp(out, 2500) * 0.35
def timpani(f, dur=2.5, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    fr = f * (1 + 0.15 * np.exp(-t * 20))
    out = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 1.6) + 0.5 * np.sin(2 * np.pi * np.cumsum(fr * 1.5) / SR) * np.exp(-t * 3)
    out += lp(noise(n), 400) * np.exp(-t * 25) * 0.6
    return out * vel
def swell_noise(dur, lo, hi, shape=2.0):
    n = int(dur * SR); x = bp(noise(n), lo, hi); e = np.linspace(0, 1, n) ** shape
    return x * e
def paper_flutter(dur, rate=18, density=1.0, lo=1200, hi=7000):
    n = int(dur * SR); t = np.arange(n) / SR
    x = bp(noise(n), lo, hi)
    am = 0.5 + 0.5 * np.sin(2 * np.pi * (rate + 6 * np.sin(2 * np.pi * 0.7 * t)) * t)
    grains = np.zeros(n)
    for _ in range(int(dur * 40 * density)):
        g = int(SR * (0.01 + rng.random() * 0.05)); i = rng.integers(0, max(1, n - g - 1))
        seg_ = grains[i:i + g]; seg_ += np.hanning(len(seg_)) * (0.4 + rng.random())
    return x * (am ** 2 * 0.6 + grains * 0.8)
def wind(dur, base=0.3):
    n = int(dur * SR); t = np.arange(n) / SR
    x = lp(noise(n), 900) * 0.6 + bp(noise(n), 300, 2400) * 0.25
    gust = 0.5 + 0.5 * np.sin(2 * np.pi * 0.11 * t + 1) * np.sin(2 * np.pi * 0.047 * t)
    whistle = bp(noise(n), 700, 760, 2) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.08 * t)) * 0.4
    return (x * (base + 0.7 * gust) + whistle) * 0.5
def creak(dur=1.2, f0=60):
    n = int(dur * SR); out = np.zeros(n); t = 0.0; i = 0
    while i < n - 400:
        rate = f0 * (0.6 + 0.8 * np.sin(np.pi * i / n))
        imp = np.zeros(300); imp[0] = 1
        i += int(SR / rate * (0.8 + rng.random() * 0.4)); out[min(i, n - 1)] += (0.5 + rng.random()) * np.sin(np.pi * i / n)
    res = bp(out, 180, 900, 2) * 4 + bp(out, 1400, 2600, 2) * 1.5
    return lp(res, 3000)
def thump(f=70, dur=0.25, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t * (1 - 0.3 * t)) * np.exp(-t * 22) + lp(noise(n), 500) * np.exp(-t * 50) * 0.5) * vel
def pawstep(vel=0.4):
    n = int(0.12 * SR); t = np.arange(n) / SR
    return (lp(noise(n), 700) * np.exp(-t * 55) * 0.8 + bp(noise(n), 2000, 5000) * np.exp(-t * 90) * 0.08) * vel
def brush(dur, vel=0.5):
    n = int(dur * SR); t = np.arange(n) / SR
    e = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.6
    return bp(noise(n), 2500, 9000) * e * vel * (0.7 + 0.3 * np.sin(2 * np.pi * 9 * t))
def whoosh(dur, lo=200, hi=1800, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; e = np.sin(np.pi * t / dur) ** 2
    sweep = np.zeros(n); x = noise(n)
    a = bp(x, lo, hi); return a * e * vel
def bell(f, dur=3, vel=0.3):
    n = int(dur * SR); t = np.arange(n) / SR
    return sum(np.sin(2 * np.pi * f * r * t) * np.exp(-t * d) * a for r, a, d in [(1, 1, 1.2), (2.76, 0.4, 2.5), (5.4, 0.2, 4), (8.9, 0.1, 6)]) * vel

# ---------- the motif (original) ----------
BEAT = 60 / 72
MOTIF = [('A4', 0, 1), ('D5', 1, 1), ('E5', 2, 0.5), ('F#5', 2.5, 1.5), ('E5', 4, 1), ('D5', 5, 0.5), ('B4', 5.5, 0.5), ('A4', 6, 2),
         ('G4', 8, 1), ('B4', 9, 1), ('D5', 10, 0.5), ('E5', 10.5, 1.5), ('D5', 12, 1), ('C#5', 13, 0.5), ('A4', 13.5, 2.5)]
def play_motif(t0, vel=0.5, octave=0, bright=0.8, pan=0.0, beat=BEAT, bass=True, gain=1.0):
    for name, b, d in MOTIF:
        f = hz(name) * 2 ** octave
        add(felt_piano(f, dur=max(2.5, d * beat * 2.2), vel=vel * (0.85 + 0.3 * rng.random()), bright=bright), t0 + b * beat + rng.random() * 0.012, pan=pan + 0.1, gain=gain, rev=0.45)
    if bass:
        for name, b in [('D3', 0), ('B2', 4), ('G2', 8), ('A2', 12)]:
            add(felt_piano(hz(name) * 2 ** octave, 5, vel * 0.6, 0.5), t0 + b * beat, pan=-0.2, gain=gain * 0.8, rev=0.45)
            add(felt_piano(hz(name) * 1.5 * 2 ** octave, 4, vel * 0.35, 0.5), t0 + (b + 0.5) * beat, pan=-0.1, gain=gain * 0.6, rev=0.45)

# ===== CUES =====
# wind throughout, swelling at sunrise
w = wind(DUR); wenv = np.interp(np.arange(N) / SR, [0, 2, 7, 8, 14, 32, 39, 44, 52, 56, 63], [0, 2.2, 2.0, 0.3, 0.15, 0.1, 0.5, 0.9, 0.35, 0.3, 0])
add(w * wenv, 0, 0, 0.5, rev=0.1)
# shot 1: a faint distant chime as the window light moves
add(bell(hz('A5'), 4, 0.04), 2.2, 0.5, 1, 0.8)
# shot 2: paw steps, lantern, motif enters
for k in range(16):
    t = 7.1 + k * 0.24 + rng.random() * 0.02
    if t > 10.9: break
    add(pawstep(0.25 + 0.1 * rng.random()), t, -0.5 + k * 0.03, 1, 0.25)
add(thump(160, 0.2, 0.15), 11.25, -0.1, 1, 0.3)  # lantern set down
add(bp(noise(T(6)), 300, 1200) * 0.02, 7.5, 0, 1, 0.2)  # flame breath
play_motif(7.6, vel=0.38, bright=0.6, beat=BEAT * 1.05, bass=True, gain=0.9)
# shot 3: sniff
for t in (15.85, 16.0, 16.17): add(bp(noise(T(0.07)), 2500, 6000) * np.hanning(T(0.07)) * 0.05, t, 0.1, 1, 0.1)
# shot 4: hop, land, paw on the page, ink, the bird peels away
add(whoosh(0.4, 400, 2500, 0.08), 19.0); add(thump(90, 0.25, 0.35), 19.85, 0, 1, 0.3)
add(pawstep(0.3), 20.95, 0.0, 1, 0.3)
add(brush(1.5, 0.05), 21.85, 0.2, 1, 0.4)
add(bell(hz('D6'), 3, 0.05), 21.85, 0.2, 1, 0.7)
for i, nm in enumerate(['D5', 'E5', 'A5']): add(felt_piano(hz(nm), 3, 0.22, 1), 22.0 + i * 0.45, 0.2, 1, 0.6)
add(bp(noise(T(0.5)), 3000, 8000) * np.hanning(T(0.5)) * 0.04, 23.3, 0.3, 1, 0.3)  # shiver
add(paper_flutter(1.3, 22, 0.3) * 0.09 * np.linspace(1, 0.2, T(1.3)), 23.9, 0.5, 1, 0.3)
# shot 5: tremor: low strings, creaks, dust, flame
for nm, g in [('D2', 1), ('A2', 0.7), ('D3', 0.5), ('D#3', 0.35)]:
    s = strings(hz(nm), 6.4, att=4.5, rel=0.05, bright=0.35) * g
    add(s * np.linspace(0.3, 1.4, len(s)), 25.0, 0, 0.55, 0.35)
for t, f0 in [(25.3, 45), (26.6, 60), (27.6, 38), (28.4, 70), (29.2, 50), (30.0, 34)]: add(creak(1.1 + rng.random() * 0.6, f0), t, rng.random() - 0.5, 0.3, 0.4)
add(swell_noise(5.0, 3000, 9000, 1.0) * 0.03, 25.6, 0.2, 1, 0.3)  # dust sifting
add(whoosh(0.9, 200, 900, 0.12), 27.9, 0, 1, 0.2)  # flame leans
add(thump(40, 1.5, 0.3), 26.4, 0, 1, 0.5); add(thump(36, 1.5, 0.35), 28.9, 0, 1, 0.5)
# stillness 30.4-32: nothing, a held breath then the burst
# shot 6: the roar of fluttering paper
roar = paper_flutter(7.5, 26, 3.0)
renv = np.interp(np.arange(len(roar)) / SR, [0, 0.05, 1, 5, 7.5], [0, 1, 0.75, 1.0, 0.5])
add(roar * renv * 0.32, 32.0, -0.3, 1, 0.3); add(paper_flutter(7.5, 31, 3.0) * renv * 0.32, 32.0, 0.3, 1, 0.3)
add(thump(50, 2.0, 0.9), 32.0, 0, 1, 0.5)
add(whoosh(5.0, 150, 1200, 0.25) * np.linspace(0.3, 1, T(5.0)), 34.5, 0, 1, 0.4)
# shutters break, gold light: metal clang + swell
add(bell(hz('C3'), 3, 0.25) + bell(hz('F#3'), 3, 0.15), 37.0, 0, 1, 0.6)
add(timpani(hz('D2'), 3, 0.9), 37.0, 0, 1, 0.5)
add(swell_noise(1.8, 5000, 14000, 3) * 0.08, 35.2, 0, 1, 0.5)
# rising strings into sunrise
for nm in ['D3', 'A3', 'D4', 'F#4', 'A4']: add(strings(hz(nm), 7.5, att=2.5, rel=1.0, bright=0.55), 36.5, rng.random() - 0.5, 0.42, 0.45)
# shot 7 sunrise: full orchestral swell (D - Bm - G - A)
prog = [(39.0, ['D3', 'A3', 'D4', 'F#4', 'A4', 'D5']), (41.5, ['B2', 'F#3', 'B3', 'D4', 'F#4', 'B4']), (44.0, ['G2', 'D3', 'G3', 'B3', 'D4', 'G4']), (46.5, ['A2', 'E3', 'A3', 'C#4', 'E4', 'A4']),
        (49.0, ['D3', 'A3', 'D4', 'F#4', 'A4', 'D5']), (51.0, ['G2', 'D3', 'G3', 'B3', 'D4', 'G4'])]
for i, (t, ch) in enumerate(prog):
    dur = 2.9 if i < len(prog) - 1 else 4.5
    for nm in ch: add(strings(hz(nm), dur, att=0.6, rel=1.0, bright=0.75), t, rng.random() - 0.5, 0.36, 0.45)
    for nm in ch[:3]: add(brass(hz(nm), dur, att=0.5, rel=0.8, bright=0.65), t, 0, 0.5, 0.4)
add(timpani(hz('D2'), 3, 1.0), 39.0); add(timpani(hz('A1'), 3, 0.8), 41.5)
add(swell_noise(2.0, 4000, 14000, 2.5) * 0.06, 37.2, 0, 1, 0.5)
add(whoosh(4.5, 100, 700, 0.35), 40.5, 0, 1, 0.4)  # ring of wind
# shot 8 climax: the motif returns at full scale
play_motif(44.0, vel=0.95, octave=0, bright=1.2, beat=0.5, bass=True, gain=1.2)
play_motif(44.0, vel=0.6, octave=1, bright=1.2, beat=0.5, bass=False, gain=0.6)
for nm, b in [('A4', 0), ('D5', 1), ('E5', 2), ('F#5', 2.5), ('E5', 4), ('D5', 5), ('B4', 5.5), ('A4', 6)]:
    add(strings(hz(nm), 1.4 * 0.5 + 0.6, att=0.12, rel=0.5, bright=0.85), 44.0 + b * 0.5, 0.2, 0.4, 0.45)
# the enormous wingbeat (47.33s): sub whoomp + air + paper
n = T(2.2); t = np.arange(n) / SR
sub = np.sin(2 * np.pi * np.cumsum(55 * (1 - 0.5 * t / 2.2)) / SR) * np.exp(-t * 2.2) * np.clip(t * 20, 0, 1)
add(sub * 0.9, 47.15, 0, 1, 0.4); add(whoosh(1.4, 80, 600, 0.9), 46.8, 0, 1, 0.4)
add(paper_flutter(1.5, 14, 4) * 0.25 * np.linspace(1, 0, T(1.5)), 47.3, 0, 1, 0.4)
add(timpani(hz('D2'), 3, 1.1), 47.33)
# the sweep across the sky
add(whoosh(4.0, 300, 3000, 0.3), 48.2, -0.6, 1, 0.4); add(paper_flutter(4, 24, 1.5) * 0.1 * np.linspace(1, 0, T(4)), 48.5, -0.5, 1, 0.4)
# shot 9: quiet returns
for nm in ['D4', 'A4', 'F#4']: add(strings(hz(nm), 4.0, att=1.0, rel=2.0, bright=0.4), 52.2, 0, 0.18, 0.6)
for k in range(10): add(paper_flutter(0.4, 20, 0.2) * 0.04, 52.5 + k * 0.35 + rng.random() * 0.2, rng.random() - 0.5, 1, 0.4)
add(pawstep(0.25), 55.2, -0.1, 1, 0.3)
# one single soft piano note as the ink touches the final page
add(felt_piano(hz('D5'), 6, 0.45, 0.8), 55.25, 0, 1, 0.6)
add(felt_piano(hz('D4'), 6, 0.2, 0.6), 55.25, 0, 1, 0.6)
# brush writing the title, the seal, the line
add(brush(0.6, 0.09), 56.6, -0.3); add(brush(0.5, 0.08), 57.4, -0.1); add(brush(0.6, 0.08), 58.0, 0.1); add(brush(0.5, 0.07), 58.6, 0.3)
add(thump(110, 0.3, 0.3), 59.0, 0, 1, 0.4)
add(brush(1.6, 0.05), 59.7, 0)
add(whoosh(0.5, 600, 3000, 0.05), 61.2, 0.6)  # tail flick

# ---------- reverb + master ----------
irn = int(3.2 * SR); ti = np.arange(irn) / SR
ir_l = noise(irn) * np.exp(-ti * 2.1); ir_r = noise(irn) * np.exp(-ti * 2.1)
ir_l = lp(ir_l, 5000); ir_r = lp(ir_r, 5000); ir_l /= np.sqrt(np.sum(ir_l ** 2)); ir_r /= np.sqrt(np.sum(ir_r ** 2))
wl = fftconvolve(REV_L, ir_l)[:N] * 0.9; wr = fftconvolve(REV_R, ir_r)[:N] * 0.9
outL = L + wl; outR = R + wr
mix = np.stack([outL, outR], 1)
mix = hp(mix.T, 25).T
peak = np.max(np.abs(mix)); mix = mix / peak * 0.92
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
fade = np.ones(N); fe = T(1.5); fade[-fe:] = np.linspace(1, 0, fe) ** 2
mix *= fade[:, None]
wavfile.write(sys.argv[1], SR, (mix * 32767).astype(np.int16))
print('ok', DUR)
