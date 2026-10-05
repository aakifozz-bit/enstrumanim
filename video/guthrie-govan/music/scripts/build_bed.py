"""Build the 300.0 s music bed (bed.wav) + cues.json for the Guthrie Govan documentary.

Edits are placed on bar lines measured from each track's tempo grid (see GRID below; the
grids were measured with an onset/novelty analysis and checked against the tracks' own
section changes).  Re-time a chapter boundary by changing the bar numbers in PLAN.

Run:  python3 scripts/make_sfx.py && python3 scripts/build_bed.py
"""

import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from dsp import (SR, block_loudness, db, fade_curve, integrated_loudness, load,  # noqa: E402
                 true_peak_db, tv_filter, write_wav)

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TR = os.path.join(HERE, "tracks")
SFXDIR = os.path.join(HERE, "sfx")
DUR = 300.0
N = int(round(DUR * SR))
TARGET_LUFS = -18.0
TP_CEIL = -1.0

KM_LIC = "CC BY 4.0"
KM_CREDIT = ('"{t}" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: '
             'By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/')
SB_CREDIT = "'{t}' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au"

TRACKS = {
    "exhilarate": dict(file="Kevin MacLeod - Exhilarate.mp3", title="Exhilarate", artist="Kevin MacLeod",
                       url="https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1300028",
                       dl="https://incompetech.com/music/royalty-free/mp3-royaltyfree/Exhilarate.mp3"),
    "coldfunk": dict(file="Kevin MacLeod - Cold Funk.mp3", title="Cold Funk", artist="Kevin MacLeod",
                     url="https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100499",
                     dl="https://incompetech.com/music/royalty-free/mp3-royaltyfree/Cold%20Funk.mp3"),
    "motherlode": dict(file="Kevin MacLeod - Motherlode.mp3", title="Motherlode", artist="Kevin MacLeod",
                       url="https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1500033",
                       dl="https://incompetech.com/music/royalty-free/mp3-royaltyfree/Motherlode.mp3"),
    "retrofuture": dict(file="Kevin MacLeod - RetroFuture Clean.mp3", title="RetroFuture Clean",
                        artist="Kevin MacLeod",
                        url="https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1200040",
                        dl="https://incompetech.com/music/royalty-free/mp3-royaltyfree/RetroFuture%20Clean.mp3"),
    "aphelion": dict(file="Scott Buckley - Aphelion.mp3", title="Aphelion", artist="Scott Buckley",
                     url="https://www.scottbuckley.com.au/library/aphelion/",
                     dl="https://www.scottbuckley.com.au/library/wp-content/uploads/2026/04/Aphelion.mp3"),
    "blood": dict(file="Scott Buckley - Blood.mp3", title="Blood", artist="Scott Buckley",
                  url="https://www.scottbuckley.com.au/library/blood/",
                  dl="https://www.scottbuckley.com.au/wp-content/audio/sb_blood.mp3"),
    "bots": dict(file="Scott Buckley - Born Of The Sky.mp3", title="Born Of The Sky", artist="Scott Buckley",
                 url="https://www.scottbuckley.com.au/library/born-of-the-sky/",
                 dl="https://www.scottbuckley.com.au/library/wp-content/uploads/2025/08/BornOfTheSky.mp3"),
}
for k, v in TRACKS.items():
    v["license"] = KM_LIC if v["artist"] == "Kevin MacLeod" else "CC BY 4.0"
    v["credit"] = (KM_CREDIT if v["artist"] == "Kevin MacLeod" else SB_CREDIT).format(t=v["title"])

# tempo grids: bar(k) = first + k * bar_len   (seconds in the decoded source).  Kevin MacLeod
# in-points are additionally snapped to the real transient with refine_onset(); the orchestral
# grids include the ~30 ms spectral-flux detection lag.
GRID = {
    "exhilarate": dict(bpm=170.0, beats=4, first=0.711),   # first hit = bar 0
    "coldfunk": dict(bpm=112.0, beats=4, first=1.601),     # 2-beat pickup at 0.53; groove at bar 4
    "motherlode": dict(bpm=90.0, beats=4, first=0.0),      # 8-bar sections every 21.33 s
    "retrofuture": dict(bpm=91.0, beats=4, first=-0.004),  # 4-bar phrases every 10.55 s
    "aphelion": dict(bpm=119.99, beats=4, first=0.49),      # orchestral arrival at 108.47 s
    "blood": dict(bpm=None),                               # ambient, no grid used
    "bots": dict(bpm=119.98, beats=4, first=0.485),         # climax 108.47 -> final chord 164.48
}


def bar(key, k):
    g = GRID[key]
    return g["first"] + k * g["beats"] * 60.0 / g["bpm"]


def refine_onset(x, t, win=0.04):
    """Snap a grid time to the actual transient (max rise of HF energy within +-win)."""
    a, b = int((t - win) * SR), int((t + win) * SR)
    a = max(a, 0)
    seg = x[a:b].mean(1)
    d = np.diff(seg, prepend=seg[0])
    e = np.convolve(d ** 2, np.ones(64) / 64, "same")
    rise = np.diff(e, prepend=e[0])
    return (a + int(np.argmax(rise)) - 32) / SR


# ------------------------------------------------------------------ PLAN (bed seconds)
# Chapter cue sheet: 0-20 hook | 20-75 childhood | 75-150 career rise |
# 150-205 Aristocrats / Steven Wilson / Hans Zimmer | 205-270 style & philosophy | 270-300 outro
B = {}
B["A_tape"] = 14                     # Exhilarate: tape stop on the downbeat of bar 14
B["B_in_bar"] = 2                    # Cold Funk enters on its bar 2 (last 2 bars of the intro)
B["B_in_bed"] = 20.45
B["B_out_bar"] = 28                  # 6 x 4-bar phrases after the groove starts (bar 4)
B["C_out_bar"] = 28                  # Motherlode bars 0..28
B["D_in_bar"] = 24                   # RetroFuture Clean bars 24..36 (new section at 63.29 s)
B["D_out_bar"] = 36
B["E_arrival_src"] = 108.50          # Aphelion: big orchestral arrival (transient ~30 ms after grid)
B["E_pre"] = 2.0                     # seconds of Aphelion build faded in under the riser
B["E_len"] = 25.0                    # arrival + 12.5 bars
B["E_fade"] = 6.0                    # long fade = a "breath" after the climax
B["F_src_in"] = 166.9                # Blood: soft guitar entry (note at 167.0 s)
B["G_bar_in"] = 70                   # Born Of The Sky bar 70 (= 140.47 s, 16 bars into the climax)
B["G_final_bar"] = 82                # bar 82 = 164.48 s, last big chord of the climax
B["G_bed_in"] = 272.0
B["G_fade_from"] = 297.0

# per-segment loudness targets (LUFS, before the global -18 LUFS normalisation)
SEG_LUFS = dict(A=-16.0, B=-19.0, C=-16.5, D=-17.0, E=-16.0, F=-20.5, G=-16.0)


class Bed:
    def __init__(self):
        self.x = np.zeros((N, 2))
        self.cues = []
        self.sfx = []

    def add(self, sig, at):
        i = int(round(at * SR))
        a, b = max(i, 0), min(i + len(sig), N)
        if b > a:
            self.x[a:b] += sig[a - i:b - i]


def env_apply(sig, fades):
    """fades: list of (start_s, dur_s, kind) relative to sig start."""
    g = np.ones(len(sig))
    for s, d, kind in fades:
        a = int(round(s * SR)); n = int(round(d * SR))
        a = max(a, 0); n = min(n, len(sig) - a)
        if n <= 0:
            continue
        c = fade_curve(n, kind)
        g[a:a + n] *= c
        if kind.endswith("out") or kind == "cos_out":
            g[a + n:] = 0
        else:
            g[:a] = 0
    return sig * g[:, None]


def gain_to(sig, target, core=None):
    ref = sig if core is None else sig[int(core[0] * SR):int(core[1] * SR)]
    L = integrated_loudness(ref)
    return sig * db(target - L), target - L, L


def level_ride(sig, ratio=0.5, max_up=8.0, max_down=6.0, smooth=4.0):
    """Slow gain riding: shrink deviations from the median short-term loudness by `ratio`."""
    t, S = block_loudness(sig, win=3.0, hop=0.1)
    S = np.maximum(S, -45.0)
    g = np.clip((np.median(S) - S) * (1 - ratio), -max_down, max_up)
    k = max(1, int(smooth / 0.1))
    g = np.convolve(np.pad(g, (k, k), mode="edge"), np.ones(k) / k, "same")[k:-k]
    g_s = np.interp(np.arange(len(sig)) / SR, t + 1.5, g)
    return sig * db(g_s)[:, None]


def sweep_lowpass(sig, start, dur, f_from=18000.0, f_to=400.0, gain_db_end=-6.0):
    """Exponential low-pass sweep + gain ramp over [start, start+dur] (sig-relative seconds)."""
    n = len(sig)
    fc = np.full(n, f_from)
    g = np.ones(n)
    a = int(start * SR); m = int(dur * SR)
    u = np.linspace(0, 1, m)
    fc[a:a + m] = f_from * (f_to / f_from) ** (u ** 0.8)
    fc[a + m:] = f_to
    g[a:a + m] = db(gain_db_end * u)
    g[a + m:] = db(gain_db_end)
    out = sig.copy()
    out[a:] = tv_filter(sig[a:], "lp", fc[a:], Q=0.9)
    return out * g[:, None]


def tape_stop(src, pos_s, T):
    """Tape-stop starting at source position pos_s, lasting T seconds of output."""
    n = int(T * SR)
    tau = np.arange(n) / SR
    p = pos_s * SR + (tau - tau ** 2 / (2 * T)) * SR
    out = np.stack([np.interp(p, np.arange(len(src)), src[:, c]) for c in range(2)], 1)
    rate = 1 - tau / T
    lvl = np.clip(rate, 0, 1) ** 0.6
    fc = 400 + 17000 * rate ** 2
    out = tv_filter(out, "lp", fc, Q=0.7) * lvl[:, None]
    out[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))[:, None]
    return out


def sfx_load(name):
    x = load(os.path.join(SFXDIR, name))
    _, M = block_loudness(x)
    return x, float(M.max())


def main():
    bed = Bed()
    src = {k: load(os.path.join(TR, v["file"])) for k, v in TRACKS.items()}

    def cue(seg, key, s0, s1, src_in, src_out, mood, notes=""):
        t = TRACKS[key]
        bed.cues.append(dict(segment=seg, start=round(s0, 3), end=round(s1, 3), track_file=f"tracks/{t['file']}",
                             track_title=t["title"], artist=t["artist"], license=t["license"],
                             source_url=t["url"], download_url=t["dl"], attribution=t["credit"],
                             src_in=round(src_in, 3), src_out=round(src_out, 3), mood=mood, notes=notes))

    # ---------------- A: hook - Exhilarate from its first hit, tape-stop at bar 14
    x = src["exhilarate"]
    on = refine_onset(x, bar("exhilarate", 0)) - 0.003
    stop_bed = bar("exhilarate", B["A_tape"]) - bar("exhilarate", 0)       # 19.765
    T = 0.9
    body = x[int(on * SR):int((on + stop_bed) * SR)]
    ts = tape_stop(x, on + stop_bed, T)
    segA = np.concatenate([body, ts])
    segA = env_apply(segA, [(0, 0.002, "lin_in")])
    segA, gA, LA = gain_to(segA, SEG_LUFS["A"], core=(0, stop_bed))
    bed.add(segA, 0.0)
    endA = stop_bed + T
    cue("A", "exhilarate", 0.0, endA, on, on + stop_bed + T / 2, "hook - punchy guitar rock, opens on the first hit",
        f"bars 0-14 from the first hit; tape-stop {stop_bed:.2f}-{endA:.2f}s")
    bed.sfx.append(dict(type="tape stop", file=None, start=round(stop_bed, 3), end=round(endA, 3),
                        note="tape-stop DSP applied to Exhilarate itself (no sample); a standalone "
                             "synthesized version is in sfx/tape_stop.wav (not used in the bed)",
                        license="n/a (processing of the CC BY track)"))

    # ---------------- B: childhood - Cold Funk
    x = src["coldfunk"]
    b_in = bar("coldfunk", B["B_in_bar"]); b_out = bar("coldfunk", B["B_out_bar"])
    off = B["B_in_bed"] - b_in                                               # bed = src + off
    pre = 0.02
    segB = x[int((b_in - pre) * SR):int(b_out * SR)]
    seg_len = len(segB) / SR
    riser_bars = 2
    sweep_start = bar("coldfunk", B["B_out_bar"] - 1) - (b_in - pre)
    segB = sweep_lowpass(segB, sweep_start, bar("coldfunk", 1) - bar("coldfunk", 0), 18000, 500, -5.0)
    segB = env_apply(segB, [(0, 0.04, "eqp_in"), (seg_len - 0.03, 0.03, "lin_out")])
    segB, gB, LB = gain_to(segB, SEG_LUFS["B"], core=(4.3, sweep_start))
    bed.add(segB, b_in - pre + off)
    tB0, tB1 = b_in - pre + off, b_out + off
    cue("B", "coldfunk", tB0, tB1, b_in - pre, b_out, "childhood - light, groovy clean-guitar funk",
        f"bars {B['B_in_bar']}-{B['B_out_bar']}; low-pass sweep in the last bar under the riser")

    # ---------------- C: career rise - Motherlode
    x = src["motherlode"]
    on = max(refine_onset(x, 0.02, 0.02) - 0.003, 0.0)
    c_len = bar("motherlode", B["C_out_bar"]) - bar("motherlode", 0)
    segC = x[int(on * SR):int((on + c_len) * SR)]
    segC = env_apply(segC, [(0, 0.003, "lin_in"), (c_len - 0.12, 0.12, "eqp_out")])
    segC, gC, LC = gain_to(segC, SEG_LUFS["C"])
    tC0 = tB1
    bed.add(segC, tC0)
    tC1 = tC0 + c_len
    cue("C", "motherlode", tC0, tC1, on, on + c_len, "career rise - big guitar-driven rock with majestic horns",
        f"bars 0-{B['C_out_bar']} (sections at 21.33 s multiples)")

    # riser + impact into C
    r, rM = sfx_load("riser_6s.wav")
    rlen = bar("coldfunk", B["B_out_bar"]) - bar("coldfunk", B["B_out_bar"] - riser_bars)
    r = r[-int(rlen * SR):]
    bed.add(r * db(SEG_LUFS["B"] + 1.0 - rM), tC0 - rlen)
    bed.sfx.append(dict(type="riser", file="sfx/riser_6s.wav (last %.2f s)" % rlen, start=round(tC0 - rlen, 3),
                        end=round(tC0, 3), note="last 2 bars of Cold Funk into Motherlode"))
    im, imM = sfx_load("impact_soft.wav")
    bed.add(im * db(SEG_LUFS["C"] + 1.0 - imM), tC0)
    bed.sfx.append(dict(type="impact", file="sfx/impact_soft.wav", start=round(tC0, 3),
                        end=round(tC0 + len(im) / SR, 3), note="on Motherlode's first downbeat"))

    # ---------------- D: Aristocrats - RetroFuture Clean
    x = src["retrofuture"]
    d_in = refine_onset(x, bar("retrofuture", B["D_in_bar"])) - 0.003
    d_len = bar("retrofuture", B["D_out_bar"]) - bar("retrofuture", B["D_in_bar"])
    segD = x[int(d_in * SR):int((d_in + d_len) * SR)]
    bar_d = bar("retrofuture", 1) - bar("retrofuture", 0)
    segD = sweep_lowpass(segD, d_len - bar_d, bar_d, 18000, 350, -9.0)
    segD = env_apply(segD, [(0, 0.005, "lin_in"), (d_len - 0.06, 0.06, "lin_out")])
    segD, gD, LD = gain_to(segD, SEG_LUFS["D"], core=(0, d_len - bar_d))
    tD0 = tC1
    bed.add(segD, tD0)
    tD1 = tD0 + d_len
    cue("D", "retrofuture", tD0, tD1, d_in, d_in + d_len, "The Aristocrats / Steven Wilson - bouncy rock-funk fusion",
        f"bars {B['D_in_bar']}-{B['D_out_bar']}; low-pass sweep in the last bar")
    w, wM = sfx_load("whoosh.wav")
    bed.add(w * db(SEG_LUFS["D"] - 1.0 - wM), tD0 - 0.62 * len(w) / SR)
    bed.sfx.append(dict(type="whoosh", file="sfx/whoosh.wav", start=round(tD0 - 0.62 * len(w) / SR, 3),
                        end=round(tD0 + 0.38 * len(w) / SR, 3), note="Motherlode -> RetroFuture Clean, peak on the downbeat"))

    # ---------------- E: Hans Zimmer - Aphelion arrival
    x = src["aphelion"]
    arr = B["E_arrival_src"]
    segE = x[int((arr - B["E_pre"]) * SR):int((arr + B["E_len"]) * SR)]
    e_tot = B["E_pre"] + B["E_len"]
    segE = env_apply(segE, [(0, B["E_pre"], "sq_in"), (e_tot - B["E_fade"], B["E_fade"], "eqp_out")])
    segE, gE, LE = gain_to(segE, SEG_LUFS["E"], core=(B["E_pre"], e_tot - B["E_fade"]))
    tE_arr = tD1
    bed.add(segE, tE_arr - B["E_pre"])
    tE0, tE1 = tE_arr - B["E_pre"], tE_arr + B["E_len"]
    cue("E", "aphelion", tE0, tE1, arr - B["E_pre"], arr + B["E_len"],
        "Hans Zimmer - epic cinematic hybrid orchestra (Interstellar-like build)",
        f"2 s of build under the riser, arrival at {tE_arr:.2f}s, fades {tE1 - B['E_fade']:.2f}-{tE1:.2f}s")
    r5, r5M = sfx_load("riser_6s.wav")
    rlen = 2 * bar_d
    r5 = r5[-int(rlen * SR):]
    bed.add(r5 * db(SEG_LUFS["D"] + 1.0 - r5M), tE_arr - rlen)
    bed.sfx.append(dict(type="riser", file="sfx/riser_6s.wav (last %.2f s)" % rlen, start=round(tE_arr - rlen, 3),
                        end=round(tE_arr, 3),
                        note="last 2 bars of RetroFuture Clean into the Aphelion arrival"))
    rs, rsM = sfx_load("reverse_swell_2s.wav")
    bed.add(rs * db(SEG_LUFS["D"] - 4.0 - rsM), tE_arr - len(rs) / SR)
    bed.sfx.append(dict(type="reverse swell", file="sfx/reverse_swell_2s.wav", start=round(tE_arr - len(rs) / SR, 3),
                        end=round(tE_arr, 3), note="reverse-cymbal into the arrival"))
    ib, ibM = sfx_load("impact_big.wav")
    bed.add(ib * db(SEG_LUFS["E"] + 2.0 - ibM), tE_arr)
    bed.sfx.append(dict(type="impact", file="sfx/impact_big.wav", start=round(tE_arr, 3),
                        end=round(tE_arr + len(ib) / SR, 3), note="cinematic boom on the Aphelion arrival"))

    # ---------------- F: style & philosophy - Blood (ambient guitar / piano)
    x = src["blood"]
    tF0 = tE1 - B["E_fade"] + 1.0
    tF1 = B["G_bed_in"] + 0.3
    f_in = B["F_src_in"]
    segF = x[int(f_in * SR):int((f_in + (tF1 - tF0)) * SR)]
    f_len = len(segF) / SR
    segF = level_ride(segF, ratio=0.5)          # halve Blood's internal 13 LU swing, keep its shape
    segF = env_apply(segF, [(0, 0.1, "eqp_in"), (f_len - 1.8, 1.8, "eqp_out")])
    segF, gF, LF = gain_to(segF, SEG_LUFS["F"], core=(3.0, f_len - 2.0))
    bed.add(segF, tF0)
    cue("F", "blood", tF0, tF1, f_in, f_in + f_len, "style & philosophy - calm, emotional ambient guitar/piano; swells gently",
        "crossfades out of Aphelion; ends under the outro riser")

    # ---------------- G: outro - Born Of The Sky climax, final chord, fade to 300.0
    x = src["bots"]
    g_in = bar("bots", B["G_bar_in"])
    g_final = bar("bots", B["G_final_bar"])
    tG_in = B["G_bed_in"]
    pre = 0.5
    segG = x[int((g_in - pre) * SR):int((g_in + (DUR - tG_in)) * SR)]
    g_len = len(segG) / SR
    fade_from = B["G_fade_from"] - (tG_in - pre)
    segG = env_apply(segG, [(0, pre, "eqp_in"), (fade_from, g_len - fade_from, "cos_out")])
    segG, gG, LG = gain_to(segG, SEG_LUFS["G"], core=(pre, fade_from))
    bed.add(segG, tG_in - pre)
    t_final = tG_in + (g_final - g_in)
    cue("G", "bots", tG_in - pre, DUR, g_in - pre, g_in + (DUR - tG_in),
        "outro - epic orchestra + drums/guitar swell, final chord, clean fade to silence at 300.0",
        f"final climax chord at {t_final:.2f}s, fade {B['G_fade_from']:.1f}-300.0s")
    r4, r4M = sfx_load("riser_4s.wav")
    bed.add(r4 * db(SEG_LUFS["F"] + 3.0 - r4M), tG_in - len(r4) / SR)
    bed.sfx.append(dict(type="riser", file="sfx/riser_4s.wav", start=round(tG_in - len(r4) / SR, 3),
                        end=round(tG_in, 3), note="Blood -> Born Of The Sky"))
    bed.add(im * db(SEG_LUFS["G"] - 1.0 - imM), tG_in)
    bed.sfx.append(dict(type="impact", file="sfx/impact_soft.wav", start=round(tG_in, 3),
                        end=round(tG_in + len(im) / SR, 3), note="outro entry"))
    fin = ib[: int((DUR - t_final) * SR)]
    fin = env_apply(fin, [(len(fin) / SR - 1.5, 1.5, "cos_out")])
    bed.add(fin * db(SEG_LUFS["G"] + 2.0 - ibM), t_final)
    bed.sfx.append(dict(type="impact", file="sfx/impact_big.wav", start=round(t_final, 3), end=DUR,
                        note="final hit, reinforced; rings out under the fade"))
    # the opening hit
    bed.add(ib * db(SEG_LUFS["A"] + 1.0 - ibM), 0.0)
    bed.sfx.insert(0, dict(type="impact", file="sfx/impact_big.wav", start=0.0, end=round(len(ib) / SR, 3),
                           note="opening hit, layered on Exhilarate's first downbeat"))

    # ---------------- master: normalise to -18 LUFS, true-peak safety
    y = bed.x
    L0 = integrated_loudness(y)
    y = y * db(TARGET_LUFS - L0)
    tp = true_peak_db(y)
    if tp > TP_CEIL:  # simple look-ahead peak limiter (rarely engaged at -18 LUFS)
        from scipy.ndimage import maximum_filter1d
        lim = db(TP_CEIL - 0.3)
        pk = maximum_filter1d(np.abs(y).max(1), size=int(0.005 * SR))
        g = np.minimum(1.0, lim / (pk + 1e-12))
        k = int(0.004 * SR)
        g = np.convolve(g, np.ones(k) / k, "same")
        g = np.minimum(g, maximum_filter1d(g, 1))
        y = y * g[:, None]
    y[: int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))[:, None]
    y[-1] = 0.0
    write_wav(os.path.join(HERE, "bed.wav"), y)
    Lf = integrated_loudness(y)

    for c in bed.cues:
        c["start"] = max(c["start"], 0.0)
    out = dict(
        file="bed.wav", duration_s=DUR, sample_rate=SR, channels=2, integrated_lufs=round(Lf, 2),
        true_peak_dbtp=round(true_peak_db(y), 2),
        chapter_plan=[dict(start=0, end=20, chapter="hook"), dict(start=20, end=75, chapter="childhood / early years"),
                      dict(start=75, end=150, chapter="career rise"),
                      dict(start=150, end=205, chapter="The Aristocrats / Steven Wilson / Hans Zimmer"),
                      dict(start=205, end=270, chapter="style & philosophy"), dict(start=270, end=300, chapter="outro")],
        segments=bed.cues,
        sfx=[{**s, "license": s.get("license", "CC0 1.0 (synthesized for this project, scripts/make_sfx.py)")}
             for s in bed.sfx],
        transitions=[
            dict(at=round(stop_bed, 3), kind="tape stop -> Cold Funk intro"),
            dict(at=round(tC0, 3), kind="2-bar riser + soft impact, cut on downbeat"),
            dict(at=round(tD0, 3), kind="whoosh, cut on downbeat (Motherlode bar 28 -> RetroFuture bar 24)"),
            dict(at=round(tE_arr, 3), kind="2-bar riser + reverse swell + big impact into the Aphelion arrival"),
            dict(at=round(tE1 - B["E_fade"], 3), kind=f"{B['E_fade']:.0f} s equal-power fade Aphelion -> Blood"),
            dict(at=round(tG_in, 3), kind="4 s riser + soft impact into the Born Of The Sky climax (both in E major)"),
            dict(at=round(t_final, 3), kind="final climax chord + big impact, cos fade to digital silence at 300.0"),
        ],
    )
    with open(os.path.join(HERE, "cues.json"), "w") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f"pre-norm {L0:.2f} LUFS -> {Lf:.2f} LUFS, TP {true_peak_db(y):.2f} dBTP")
    for c in bed.cues:
        print(f"  {c['segment']} {c['start']:7.2f}-{c['end']:7.2f}  {c['track_title']:18s} src {c['src_in']:7.2f}-{c['src_out']:7.2f}")
    print("  gains:", {k: round(v, 1) for k, v in dict(A=gA, B=gB, C=gC, D=gD, E=gE, F=gF, G=gG).items()})
    print("  raw seg loudness:", {k: round(v, 1) for k, v in dict(A=LA, B=LB, C=LC, D=LD, E=LE, F=LF, G=LG).items()})


if __name__ == "__main__":
    main()
