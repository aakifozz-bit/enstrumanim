"""Shared DSP helpers for the Guthrie Govan music bed (numpy/scipy only)."""

import subprocess

import numpy as np
from scipy.signal import lfilter, fftconvolve

SR = 44100


# ---------------------------------------------------------------- I/O
def load(path, sr=SR):
    """Decode any file with ffmpeg to float32 stereo (n, 2) at `sr` (soxr resampler)."""
    r = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-af", "aresample=resampler=soxr:precision=28",
         "-f", "f32le", "-ac", "2", "-ar", str(sr), "-"],
        capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def write_wav(path, x, sr=SR, bits=24):
    """Write float (n, ch) array as PCM WAV via ffmpeg (16 or 24 bit)."""
    x = np.ascontiguousarray(np.clip(x, -1.0, 1.0).astype(np.float32))
    codec = {16: "pcm_s16le", 24: "pcm_s24le"}[bits]
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(sr), "-ac", str(x.shape[1]),
         "-i", "-", "-c:a", codec, str(path)],
        input=x.tobytes(), check=True)


# ---------------------------------------------------------------- loudness (ITU-R BS.1770-4)
def _k_weight(x, sr=SR):
    # stage 1: high shelf (+4 dB @ 1.5 kHz), stage 2: RLB high-pass (38 Hz)
    G, Q, fc = 4.0, 1 / np.sqrt(2), 1500.0
    A = 10 ** (G / 40); w0 = 2 * np.pi * fc / sr; al = np.sin(w0) / (2 * Q); c = np.cos(w0)
    b1 = [A * ((A + 1) + (A - 1) * c + 2 * np.sqrt(A) * al), -2 * A * ((A - 1) + (A + 1) * c),
          A * ((A + 1) + (A - 1) * c - 2 * np.sqrt(A) * al)]
    a1 = [(A + 1) - (A - 1) * c + 2 * np.sqrt(A) * al, 2 * ((A - 1) - (A + 1) * c),
          (A + 1) - (A - 1) * c - 2 * np.sqrt(A) * al]
    fc, Q = 38.0, 0.5
    w0 = 2 * np.pi * fc / sr; al = np.sin(w0) / (2 * Q); c = np.cos(w0)
    b2 = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    a2 = [1 + al, -2 * c, 1 - al]
    y = lfilter(b1, a1, x, axis=0)
    return lfilter(b2, a2, y, axis=0)


def block_loudness(x, sr=SR, win=0.4, hop=0.1):
    """Momentary-style loudness per block (LUFS), returns (times, values)."""
    y = _k_weight(x, sr) ** 2
    p = y.sum(1)
    n, h = int(win * sr), int(hop * sr)
    if len(p) < n:
        return np.array([0.0]), np.array([-120.0])
    cs = np.concatenate([[0], np.cumsum(p)])
    starts = np.arange(0, len(p) - n + 1, h)
    ms = (cs[starts + n] - cs[starts]) / n
    return starts / sr, -0.691 + 10 * np.log10(ms + 1e-20)


def integrated_loudness(x, sr=SR):
    _, L = block_loudness(x, sr, 0.4, 0.1)
    L = L[L > -70]
    if len(L) == 0:
        return -120.0
    rel = -0.691 + 10 * np.log10(np.mean(10 ** ((L + 0.691) / 10))) - 10
    L = L[L > rel]
    return -0.691 + 10 * np.log10(np.mean(10 ** ((L + 0.691) / 10)))


def true_peak_db(x, os_factor=4):
    from scipy.signal import resample_poly
    y = resample_poly(x, os_factor, 1, axis=0)
    return 20 * np.log10(np.abs(y).max() + 1e-12)


# ---------------------------------------------------------------- filters
def biquad(kind, fc, sr=SR, Q=0.707, gain_db=0.0):
    fc = float(np.clip(fc, 10, sr * 0.45))
    w0 = 2 * np.pi * fc / sr; al = np.sin(w0) / (2 * Q); c = np.cos(w0)
    if kind == "lp":
        b = [(1 - c) / 2, 1 - c, (1 - c) / 2]; a = [1 + al, -2 * c, 1 - al]
    elif kind == "hp":
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]; a = [1 + al, -2 * c, 1 - al]
    elif kind == "bp":  # constant 0 dB peak gain
        b = [al, 0, -al]; a = [1 + al, -2 * c, 1 - al]
    elif kind == "peak":
        A = 10 ** (gain_db / 40)
        b = [1 + al * A, -2 * c, 1 - al * A]; a = [1 + al / A, -2 * c, 1 - al / A]
    else:
        raise ValueError(kind)
    b = np.array(b) / a[0]; a = np.array(a) / a[0]
    return b, a


def tv_filter(x, kind, fc_curve, Q=0.707, block=128, sr=SR):
    """Time-varying biquad. fc_curve: array of cutoff per sample (len == len(x))."""
    x = np.atleast_2d(x.T).T if x.ndim == 1 else x
    y = np.zeros_like(x)
    zi = np.zeros((2, x.shape[1]))
    for s in range(0, len(x), block):
        e = min(s + block, len(x))
        b, a = biquad(kind, fc_curve[(s + e) // 2], sr, Q)
        y[s:e], zi = lfilter(b, a, x[s:e], axis=0, zi=zi)
    return y


def filt(x, kind, fc, Q=0.707, sr=SR, gain_db=0.0):
    b, a = biquad(kind, fc, sr, Q, gain_db)
    return lfilter(b, a, x, axis=0)


# ---------------------------------------------------------------- misc
def synth_reverb(x, rt60=2.0, wet_db=-10.0, predelay=0.02, lp=5000.0, seed=7, sr=SR):
    """Cheap stereo 'hall' reverb: convolution with decorrelated exponentially decaying noise."""
    rng = np.random.default_rng(seed)
    n = int(rt60 * 1.2 * sr)
    t = np.arange(n) / sr
    env = np.exp(-6.91 * t / rt60)
    ir = rng.standard_normal((n, 2)) * env[:, None]
    ir = filt(ir, "lp", lp)
    ir[: int(predelay * sr)] = 0
    ir /= np.sqrt((ir ** 2).sum(0, keepdims=True))
    mono_in = x if x.ndim == 2 else np.stack([x, x], 1)
    wet = np.stack([fftconvolve(mono_in[:, c], ir[:, c]) for c in range(2)], 1)
    out = np.zeros_like(wet)
    out[: len(mono_in)] += mono_in
    return out + wet * 10 ** (wet_db / 20)


def fade_curve(n, kind="eqp_in"):
    u = np.linspace(0, 1, n, endpoint=False) if n > 0 else np.zeros(0)
    if kind == "eqp_in":
        return np.sin(0.5 * np.pi * u)
    if kind == "eqp_out":
        return np.cos(0.5 * np.pi * u)
    if kind == "lin_in":
        return u
    if kind == "lin_out":
        return 1 - u
    if kind == "sq_in":
        return u ** 2
    if kind == "cos_out":  # smooth to exactly zero
        return 0.5 * (1 + np.cos(np.pi * np.linspace(0, 1, n)))
    raise ValueError(kind)


def db(x):
    return 10 ** (x / 20)
