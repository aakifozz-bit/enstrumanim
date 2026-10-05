"""Synthesize the transition SFX (original, numpy-generated -> dedicated CC0).

Writes 44.1 kHz / 24-bit stereo WAVs into ../sfx/:
  impact_big.wav, impact_soft.wav, riser_4s.wav, riser_6s.wav, whoosh.wav,
  reverse_swell_2s.wav, tape_stop.wav
Deterministic (fixed seeds), so re-running gives identical files.
"""

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from dsp import SR, filt, synth_reverb, tv_filter, write_wav  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sfx")


def norm_peak(x, peak_db=-1.0):
    return x / (np.abs(x).max() + 1e-12) * 10 ** (peak_db / 20)


def impact(dur=4.5, sub_hz=(72.0, 30.0), decay=1.1, crack=0.55, rt60=2.6, wet_db=-9.0, seed=1):
    rng = np.random.default_rng(seed)
    n = int(dur * SR); t = np.arange(n) / SR
    # pitched sub boom with fast downward glide
    f = sub_hz[1] + (sub_hz[0] - sub_hz[1]) * np.exp(-t / 0.10)
    ph = 2 * np.pi * np.cumsum(f) / SR
    att = 1 - np.exp(-t / 0.0015)
    sub = np.sin(ph) * att * np.exp(-t / decay)
    sub += 0.35 * np.sin(2 * ph) * att * np.exp(-t / (decay * 0.4))       # 2nd harmonic for small speakers
    # body: low band-passed noise thump
    body = filt(rng.standard_normal(n), "bp", 140, Q=0.8) * np.exp(-t / 0.22) * 2.2
    # transient crack
    cr = filt(rng.standard_normal(n), "hp", 1800) * np.exp(-t / 0.02) * crack
    mono = sub + body + cr
    mono = np.tanh(1.6 * mono) / np.tanh(1.6)                              # gentle saturation
    st = np.stack([mono, mono], 1)
    st = synth_reverb(st, rt60=rt60, wet_db=wet_db, predelay=0.015, lp=4500, seed=seed + 10)[:n]
    fade = np.ones(n); m = int(0.4 * SR); fade[-m:] = np.linspace(1, 0, m) ** 2
    return norm_peak(st * fade[:, None])


def riser(dur=4.0, seed=2):
    """Noise + glide riser with accelerating tremolo; ends abruptly (lands on the downbeat)."""
    rng = np.random.default_rng(seed)
    n = int(dur * SR); t = np.arange(n) / SR; u = t / dur
    noise = rng.standard_normal((n, 2))
    fc = 250 * (40 ** u)                                                    # 250 Hz -> 10 kHz
    nz = tv_filter(noise, "bp", fc, Q=1.4)
    nz += 0.35 * tv_filter(noise, "hp", fc * 0.8, Q=0.7)
    # pitch-glide layer (no fixed pitch -> key-agnostic), 3 detuned saws, low-passed
    f0 = 70 * 2 ** (3.2 * u ** 1.6)
    glide = np.zeros(n)
    for det in (-0.012, 0.0, 0.013):
        ph = np.cumsum(f0 * (1 + det)) / SR
        glide += 2 * (ph % 1.0) - 1
    glide = tv_filter(glide[:, None], "lp", 400 + 6000 * u ** 2, Q=0.9)[:, 0] / 3
    glide = np.stack([glide * 0.9, glide * 1.1], 1)
    trem_rate = 3 + 22 * u ** 2
    trem = 1 - 0.45 * u * (0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(trem_rate) / SR))
    env = (u ** 2.4)[:, None]
    x = (nz * 0.9 + glide * 0.45 * u[:, None]) * env * trem[:, None]
    x[-int(0.004 * SR):] *= np.linspace(1, 0, int(0.004 * SR))[:, None]
    return norm_peak(x)


def whoosh(dur=1.6, peak_at=0.62, seed=3):
    rng = np.random.default_rng(seed)
    n = int(dur * SR); t = np.arange(n) / SR; u = t / dur
    noise = rng.standard_normal((n, 2))
    # pinkish tilt
    noise = filt(noise, "lp", 6000) + 0.3 * noise
    bell = np.where(u < peak_at, (u / peak_at) ** 2.2, np.exp(-(u - peak_at) / (1 - peak_at) * 4.0))
    fc = 300 + 2600 * bell
    x = tv_filter(noise, "bp", fc, Q=1.1) * 1.6 + 0.25 * tv_filter(noise, "lp", 200 + 800 * bell, Q=0.7)
    x *= bell[:, None]
    pan = np.clip(u, 0, 1)                                                  # sweep left -> right
    x[:, 0] *= np.cos(0.5 * np.pi * pan) * 1.2
    x[:, 1] *= np.sin(0.5 * np.pi * pan) * 1.2 + 0.2
    x[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))[:, None]
    return norm_peak(x)


def reverse_swell(dur=2.0, seed=4):
    """Reverse-cymbal style swell (bright metallic noise, exponential rise, abrupt stop)."""
    rng = np.random.default_rng(seed)
    n = int(dur * SR); t = np.arange(n) / SR; u = t / dur
    noise = rng.standard_normal((n, 2))
    x = filt(noise, "hp", 3500)
    for f, g in ((4200, 0.8), (6300, 0.6), (8900, 0.5), (11800, 0.35)):     # inharmonic "metal"
        x += g * filt(noise, "bp", f, Q=9)
    k = 5.0
    env = (np.exp(k * u) - 1) / (np.exp(k) - 1)
    x *= env[:, None]
    x = filt(x, "lp", 14000)
    x[-int(0.003 * SR):] *= np.linspace(1, 0, int(0.003 * SR))[:, None]
    return norm_peak(x)


def tape_stop(dur=1.2, seed=5):
    """Standalone 'power-down' tape stop: a synth chord + noise slowed to a halt."""
    rng = np.random.default_rng(seed)
    src_len = 1.0
    m = int(src_len * SR); t = np.arange(m) / SR
    chord = sum(np.sign(np.sin(2 * np.pi * f * t)) * 0.25 + np.sin(2 * np.pi * f * t) * 0.5
                for f in (110.0, 164.8, 220.0, 277.2))
    chord = filt(chord, "lp", 3000) + 0.05 * rng.standard_normal(m)
    n = int(dur * SR); tau = np.arange(n) / SR
    pos = tau - tau ** 2 / (2 * dur)                                        # linear deceleration
    y = np.interp(pos * SR, np.arange(m), chord)
    rate = 1 - tau / dur
    y *= np.sqrt(np.clip(rate, 0, 1))
    y = tv_filter(y[:, None], "lp", 300 + 8000 * rate ** 1.5, Q=0.7)[:, 0]
    y[-int(0.01 * SR):] *= np.linspace(1, 0, int(0.01 * SR))
    return norm_peak(np.stack([y, y], 1))


def main():
    os.makedirs(OUT, exist_ok=True)
    items = {
        "impact_big.wav": impact(),
        "impact_soft.wav": impact(dur=3.5, sub_hz=(60.0, 34.0), decay=0.7, crack=0.25, rt60=2.0,
                                  wet_db=-11.0, seed=11),
        "riser_4s.wav": riser(4.0),
        "riser_6s.wav": riser(6.0, seed=12),
        "whoosh.wav": whoosh(),
        "reverse_swell_2s.wav": reverse_swell(),
        "tape_stop.wav": tape_stop(),
    }
    for name, x in items.items():
        write_wav(os.path.join(OUT, name), x)
        print(f"{name:22s} {len(x) / SR:5.2f}s")


if __name__ == "__main__":
    main()
