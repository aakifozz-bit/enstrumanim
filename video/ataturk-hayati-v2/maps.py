#!/usr/bin/env python3
"""Animated documentary-style map scenes for the Atatürk v2 video (1920x1080, 30 fps).

API
    from maps import MAP_SCENES
    duration, render = MAP_SCENES["selanik"]
    frame = render(1.25)          # full-frame RGB PIL.Image, t = seconds from scene start

    Scenes: "selanik" (5 s), "canakkale" (6 s), "milli_mucadele" (7 s), "buyuk_taarruz" (6 s).
    Importing has no side effects; geodata, fonts and the pre-rendered base maps are loaded
    lazily and cached per process, so render functions can be used from multiprocessing workers.

CLI
    python3 maps.py --stills                  # a few PNGs per scene
    python3 maps.py --preview selanik         # mp4 preview of one scene ("all" for every scene)
    python3 maps.py --bench canakkale         # per-frame timing on one core

Geodata: data/region.json, clipped from Natural Earth v4.1.0 (public domain) via the npm
packages world-atlas@2.0.2 and sane-topojson@4.0.0; see data/build_geodata.py.
"""

import argparse
import json
import math
import os
import subprocess
import sys
import time
from functools import lru_cache

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1920, 1080, 30
HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, "..", "ataturk-hayati", "fonts")
GEO_PATH = os.path.join(HERE, "data", "region.json")
DEFAULT_OUT = os.environ.get(
    "MAPS_OUT",
    "/tmp/claude-0/-home-user-enstrumanim/5c31ff89-7eb2-5303-97e5-43100aff2598/scratchpad/maps")

FONTS = {
    "serif": "PlayfairDisplay-Regular.ttf",
    "serif-bold": "PlayfairDisplay-Bold.ttf",
    "serif-italic": "PlayfairDisplay-Italic.ttf",
    "sans": "Montserrat-Regular.ttf",
    "sans-light": "Montserrat-Light.ttf",
    "sans-medium": "Montserrat-Medium.ttf",
    "sans-semibold": "Montserrat-SemiBold.ttf",
}

RED = (227, 10, 23)
RED_DARK = (110, 4, 12)
GOLD = (214, 178, 106)
CREAM = (244, 236, 222)
INK = (14, 20, 26)
SEPIA = (78, 56, 36)
ALLY = (104, 138, 180)         # Allied / Greek forces (steel blue)
ALLY_LIGHT = (196, 212, 230)

# base-map palette (float RGB)
SEA_A = np.array([27, 62, 72], np.float32)       # ink blue-teal
SEA_B = np.array([13, 34, 44], np.float32)       # deep
SHALLOW = np.array([58, 104, 106], np.float32)
WATERLINE = np.array([150, 190, 186], np.float32)
PAPER = np.array([229, 212, 175], np.float32)
PAPER_DARK = np.array([196, 168, 122], np.float32)
EDGE = np.array([168, 132, 88], np.float32)
COAST = np.array([62, 42, 28], np.float32)
BORDER = np.array([104, 70, 48], np.float32)
RIVER = np.array([66, 112, 118], np.float32)


# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------

def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def smooth(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def smoother(x):
    x = clamp(x)
    return x * x * x * (x * (6 * x - 15) + 10)


def ease_out(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    x = clamp(x)
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def ease_back(x, k=1.9):
    x = clamp(x) - 1
    return 1 + x * x * ((k + 1) * x + k)


def bounce(x):
    x = clamp(x)
    n, d = 7.5625, 2.75
    if x < 1 / d:
        return n * x * x
    if x < 2 / d:
        x -= 1.5 / d
        return n * x * x + 0.75
    if x < 2.5 / d:
        x -= 2.25 / d
        return n * x * x + 0.9375
    x -= 2.625 / d
    return n * x * x + 0.984375


def lerp(a, b, u):
    return a + (b - a) * u


def tr_upper(s):
    """Turkish-aware upper case (i -> İ, ı -> I)."""
    return s.replace("i", "İ").replace("ı", "I").upper()


def rgba(c, a=1.0):
    return (int(c[0]), int(c[1]), int(c[2]), int(round(255 * clamp(a))))


# ---------------------------------------------------------------------------
# projection & geodata
# ---------------------------------------------------------------------------

def merc(lat):
    return np.degrees(np.log(np.tan(np.pi / 4 + np.radians(lat) / 2)))


def G(lat, lon):
    """Geographic -> map units (Mercator, 1 unit = 1 degree of longitude, y down)."""
    return np.array([float(lon), -float(merc(lat))])


def GP(latlons):
    return np.array([G(a, b) for a, b in latlons])


def chaikin(a, closed, it=2):
    for _ in range(it):
        if len(a) < 3:
            return a
        if closed:
            b = np.roll(a, -1, axis=0)
            q, r = 0.75 * a + 0.25 * b, 0.25 * a + 0.75 * b
            a = np.stack([q, r], axis=1).reshape(-1, 2)
        else:
            q = 0.75 * a[:-1] + 0.25 * a[1:]
            r = 0.25 * a[:-1] + 0.75 * a[1:]
            a = np.vstack([a[:1], np.stack([q, r], axis=1).reshape(-1, 2), a[-1:]])
    return a


def _chunks(a, closed, n=48):
    if closed:
        a = np.vstack([a, a[:1]])
    out = []
    for i in range(0, len(a) - 1, n):
        c = a[i:i + n + 1]
        out.append((c[:, 0].min(), c[:, 1].min(), c[:, 0].max(), c[:, 1].max(), c))
    return out


@lru_cache(maxsize=1)
def geo():
    with open(GEO_PATH, encoding="utf-8") as f:
        d = json.load(f)
    q = float(d["q"])

    def dec(arr, closed):
        ll = np.cumsum(np.asarray(arr, dtype=np.int64).reshape(-1, 2), axis=0) / q
        if closed and len(ll) > 3 and np.allclose(ll[0], ll[-1]):
            ll = ll[:-1]
        uv = np.empty_like(ll)
        uv[:, 0] = ll[:, 0]
        uv[:, 1] = -merc(ll[:, 1])
        return chaikin(uv, closed)

    def bb(a):
        return (a[:, 0].min(), a[:, 1].min(), a[:, 0].max(), a[:, 1].max())

    def polys(key):
        return [[(bb(r), r) for r in (dec(x, True) for x in p)] for p in d[key]]

    out = {k: polys(k) for k in ("land", "turkey", "lakes")}
    for k in ("borders", "rivers"):
        out[k] = [c for line in d[k] for c in _chunks(dec(line, False), False)]
    out["coast"] = [c for k in ("land", "lakes") for p in out[k] for _, r in p
                    for c in _chunks(r, True)]
    return out


# ---------------------------------------------------------------------------
# camera
# ---------------------------------------------------------------------------

class Cam:
    __slots__ = ("u", "v", "s")

    def __init__(self, u, v, s):
        self.u, self.v, self.s = float(u), float(v), float(s)

    def xy(self, p):
        p = np.asarray(p, dtype=np.float64)
        out = np.empty_like(p)
        out[..., 0] = (p[..., 0] - self.u) * self.s + W / 2
        out[..., 1] = (p[..., 1] - self.v) * self.s + H / 2
        return out

    def at(self, lat, lon):
        x, y = self.xy(G(lat, lon))
        return float(x), float(y)

    def rect(self, pad=0.0):
        hw, hh = (W / 2 + pad) / self.s, (H / 2 + pad) / self.s
        return (self.u - hw, self.v - hh, self.u + hw, self.v + hh)


def key_cam(keys, t, drift=0.0):
    """keys: [(time, lat, lon, view width in degrees)]. Cubic Hermite with Catmull-Rom
    tangents in (u, v, log scale); zero velocity at the first/last key. `drift` adds a
    slow continuous push-in (fraction per second)."""
    ts = [k[0] for k in keys]
    P = [np.array([*G(k[1], k[2]), math.log(W / k[3])]) for k in keys]
    n = len(keys)

    def tan(i):
        if i == 0 or i == n - 1:
            return np.zeros(3)
        return (P[i + 1] - P[i - 1]) / (ts[i + 1] - ts[i - 1])

    if t <= ts[0]:
        p = P[0]
    elif t >= ts[-1]:
        p = P[-1]
    else:
        i = max(j for j in range(n - 1) if ts[j] <= t)
        h = ts[i + 1] - ts[i]
        x = (t - ts[i]) / h
        h00, h10 = 2 * x ** 3 - 3 * x ** 2 + 1, x ** 3 - 2 * x ** 2 + x
        h01, h11 = -2 * x ** 3 + 3 * x ** 2, x ** 3 - x ** 2
        p = h00 * P[i] + h10 * h * tan(i) + h01 * P[i + 1] + h11 * h * tan(i + 1)
    return Cam(p[0], p[1], math.exp(p[2]) * (1 + drift * t))


# ---------------------------------------------------------------------------
# procedural textures (anchored to map coordinates so they move with the map)
# ---------------------------------------------------------------------------

NOISE_BOX = (8.0, -float(merc(53.0)), 58.0, -float(merc(25.0)))


@lru_cache(maxsize=32)
def _grid(d, seed):
    u0, v0, u1, v1 = NOISE_BOX
    nx, ny = int((u1 - u0) / d) + 4, int((v1 - v0) / d) + 4
    a = np.random.default_rng(seed).random((ny, nx), dtype=np.float32)
    return Image.fromarray(a, "F")


def _noise(d, seed, u0, v0, S, w, h):
    g = _grid(d, seed)
    U0, V0 = NOISE_BOX[:2]
    box = ((u0 - U0) / d, (v0 - V0) / d, (u0 + w / S - U0) / d, (v0 + h / S - V0) / d)
    return np.asarray(g.resize((w, h), Image.BICUBIC, box=box), dtype=np.float32) - 0.5


def fbm(octaves, seed, u0, v0, S, w, h):
    acc = np.zeros((h, w), np.float32)
    tot = 0.0
    for i, (d, amp) in enumerate(octaves):
        if d * S < 1.2:          # finer than a pixel at this level: skip
            continue
        acc += amp * _noise(d, seed + i, u0, v0, S, w, h)
        tot += amp
    return acc / max(tot, 1e-6) * 2.0     # roughly in [-0.5, 0.5]


# ---------------------------------------------------------------------------
# base map rendering (once per pyramid level) and per-frame sampling
# ---------------------------------------------------------------------------

def render_base(style, u0, v0, S, w, h):
    """Rasterizes the vintage base map for the map-unit rectangle starting at (u0, v0) at
    S pixels per unit into a w x h RGB image."""
    gd = geo()
    ss = 2
    g = (S / 150.0) ** 0.5               # stroke scale: grows slower than the map
    u1, v1 = u0 + w / S, v0 + h / S
    mu, mv = 0.03 * (u1 - u0) + 0.2, 0.03 * (v1 - v0) + 0.2

    def vis(b):
        return not (b[2] < u0 - mu or b[0] > u1 + mu or b[3] < v0 - mv or b[1] > v1 + mv)

    def tr(a):
        return ((a - (u0, v0)) * (S * ss)).ravel().tolist()

    def mask(fn):
        im = Image.new("L", (w * ss, h * ss), 0)
        fn(ImageDraw.Draw(im))
        return im.reduce(ss)

    def lines(chunks, width):
        lw = max(1, int(round(width * ss)))

        def fn(d):
            for c in chunks:
                if vis(c):
                    d.line(tr(c[4]), fill=255, width=lw, joint="curve" if lw > 2 else None)
        return fn

    def d_land(d):
        for poly in gd["land"]:
            if vis(poly[0][0]):
                d.polygon(tr(poly[0][1]), fill=255)
        for poly in gd["land"]:
            for b, hole in poly[1:]:
                if vis(b):
                    d.polygon(tr(hole), fill=0)
        for poly in gd["lakes"]:
            if vis(poly[0][0]):
                d.polygon(tr(poly[0][1]), fill=0)

    land_im = mask(d_land)
    L = np.asarray(land_im, np.float32) / 255.0
    C = np.asarray(mask(lines(gd["coast"], 1.45 * g)), np.float32) / 255.0
    B = np.asarray(mask(lines(gd["borders"], 1.05 * g)), np.float32) / 255.0
    R = np.asarray(mask(lines(gd["rivers"], 1.0 * g)), np.float32) / 255.0

    step = style.get("grat", 2.0)

    def d_grat(d):
        lw = max(1, int(round(0.8 * g * ss)))
        lon = math.floor(u0 / step) * step
        while lon <= u1:
            x = (lon - u0) * S * ss
            d.line([(x, 0), (x, h * ss)], fill=255, width=lw)
            lon += step
        lat = math.floor(-80 / step) * step
        while lat < 80:
            v = -float(merc(lat))
            if v0 - 1 <= v <= v1 + 1:
                y = (v - v0) * S * ss
                d.line([(0, y), (w * ss, y)], fill=255, width=lw)
            lat += step
    Gr = np.asarray(mask(d_grat), np.float32) / 255.0

    # --- textures ---------------------------------------------------------
    n_paper = fbm([(1.6, 1.0), (0.7, 0.7), (0.3, 0.5), (0.13, 0.35), (0.055, 0.25),
                   (0.024, 0.18)], 11, u0, v0, S, w, h)
    n_stain = fbm([(0.9, 1.0), (0.4, 0.6), (0.15, 0.25)], 21, u0, v0, S, w, h)
    n_sea = fbm([(2.2, 1.0), (0.9, 0.6), (0.35, 0.4), (0.12, 0.25), (0.045, 0.15)],
                31, u0, v0, S, w, h)
    rng = np.random.default_rng(int(S * 1000) % 100003)
    grain = rng.normal(0.0, 1.0, (h, w)).astype(np.float32)

    def blur(im, r):
        return np.asarray(im.filter(ImageFilter.GaussianBlur(max(0.6, r))), np.float32) / 255.0

    halo = blur(land_im, 7.0 * g)
    wl1 = blur(land_im, 3.2 * g)
    wl2 = blur(land_im, 8.5 * g)
    inner = 1.0 - blur(land_im, 5.0 * g)

    # --- sea ---------------------------------------------------------------
    u = np.clip(0.5 + n_sea * 1.6, 0, 1)[..., None]
    sea = SEA_B + (SEA_A - SEA_B) * (0.35 + 0.65 * u)
    sea += (SHALLOW - SEA_A) * (np.clip(halo * 1.6, 0, 1) ** 1.3)[..., None] * 0.9

    def isoline(b, c, width):
        gy, gx = np.gradient(b)
        gm = np.sqrt(gx * gx + gy * gy) + 1e-5
        return np.clip(1.0 - np.abs(b - c) / (gm * width), 0, 1)

    wide = blur(land_im, 20.0 * g)
    wl = (0.30 * isoline(wl1, 0.13, 0.75 * g) * np.clip((0.42 - wl2) / 0.12, 0, 1)
          + 0.17 * isoline(wl2, 0.11, 0.75 * g) * np.clip((0.40 - wide) / 0.12, 0, 1))
    sea += (WATERLINE - sea) * (wl * (1 - L))[..., None]
    sea += grain[..., None] * 1.3

    # --- land --------------------------------------------------------------
    land = PAPER * (1.0 + 0.085 * n_paper)[..., None]
    stain = np.clip(0.5 + n_stain * 1.4, 0, 1)
    stain = stain * stain * (3 - 2 * stain)
    land += (PAPER_DARK - land) * (0.42 * stain)[..., None]
    land += (EDGE - land) * (0.55 * np.clip(inner, 0, 1) ** 1.4)[..., None]
    if style.get("focus") == "turkey":
        T = np.asarray(mask(lambda d: [d.polygon(tr(p[0][1]), fill=255)
                                       for p in gd["turkey"] if vis(p[0][0])]),
                       np.float32) / 255.0
        T = np.minimum(T, L)
        other = (L - T).clip(0, 1)[..., None]
        grey = land.mean(axis=2, keepdims=True)
        dim = (land * 0.62 + grey * 0.38) * 0.80
        land = land + (dim - land) * other
        land += (np.array([12, 4, -10], np.float32) * T[..., None])
    land += grain[..., None] * 2.2

    img = sea + (land - sea) * L[..., None]
    img += (RIVER - img) * (0.55 * R * L)[..., None]
    gcol = np.where(L[..., None] > 0.5, np.float32(60), np.float32(205))
    img += (gcol - img) * (0.075 * Gr)[..., None]
    img += (BORDER - img) * (0.42 * B * L)[..., None]
    img += (COAST - img) * (0.88 * C)[..., None]
    return Image.fromarray(np.clip(img + 0.5, 0, 255).astype(np.uint8), "RGB")


STEP = 2 ** 0.5


class BaseMap:
    """Pyramid of pre-rendered base-map levels (spaced by sqrt(2) in scale) covering the
    camera path; each frame crops/resamples one level and cross-fades into the next."""

    def __init__(self, cam_fn, dur, style):
        self.style = style
        cams = [cam_fn(i / FPS) for i in range(int(round(dur * FPS)) + 1)]
        self.smax = max(c.s for c in cams)
        self.regions = {}
        for c in cams:
            for k, _ in self.levels(c.s):
                self._add(k, c)
        self.cache = {}

    def _add(self, k, c):
        r = c.rect(pad=24)
        o = self.regions.get(k)
        self.regions[k] = r if o is None else (min(o[0], r[0]), min(o[1], r[1]),
                                               max(o[2], r[2]), max(o[3], r[3]))

    def levels(self, s):
        lv = math.log(self.smax / s, STEP)
        k = int(math.floor(lv + 1e-6))
        f = max(0.0, lv - k)
        wgt = smooth((f - 0.5) / 0.5)
        out = [(k, 1.0 - wgt)]
        if wgt > 1e-3:
            out.append((k + 1, wgt))
        return out

    def level(self, k):
        if k not in self.cache:
            S = self.smax / STEP ** k
            u0, v0, u1, v1 = self.regions[k]
            w, h = int(math.ceil((u1 - u0) * S)) + 2, int(math.ceil((v1 - v0) * S)) + 2
            self.cache[k] = (render_base(self.style, u0, v0, S, w, h), u0, v0, S)
        return self.cache[k]

    def frame(self, cam):
        img = None
        for k, wgt in self.levels(cam.s):
            if k not in self.regions:
                self._add(k, cam)
            im, u0, v0, S = self.level(k)
            r0, r1 = cam.rect()[:2], cam.rect()[2:]
            box = ((r0[0] - u0) * S, (r0[1] - v0) * S, (r1[0] - u0) * S, (r1[1] - v0) * S)
            box = (max(0.0, box[0]), max(0.0, box[1]), min(im.width, box[2]), min(im.height, box[3]))
            r = im.resize((W, H), Image.BILINEAR, box=box)
            img = r if img is None else Image.blend(img, r, wgt)
        return img


@lru_cache(maxsize=1)
def vignette():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H * 0.48) / (H * 0.66)) ** 2)
    v = np.clip((r - 0.55) / 0.75, 0, 1)
    v = 1 - 0.42 * v * v * (3 - 2 * v)
    a = (np.repeat(v[..., None], 3, axis=2) * 255 + 0.5).astype(np.uint8)
    return Image.fromarray(a, "RGB")


# ---------------------------------------------------------------------------
# text
# ---------------------------------------------------------------------------

@lru_cache(maxsize=None)
def font(face, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, FONTS[face]), size)


@lru_cache(maxsize=2048)
def text_img(text, face, size, color, tracking=0, shadow=1.0, alpha=255):
    """RGBA text with a soft drop shadow. Returns (img, pad, ink width, ascent)."""
    f = font(face, size)
    asc, desc = f.getmetrics()
    widths = [f.getlength(c) for c in text] if tracking else None
    tw = (sum(widths) + tracking * (len(text) - 1)) if tracking else f.getlength(text)
    pad = int(size * 0.35) + 8
    im = Image.new("RGBA", (int(math.ceil(tw)) + 2 * pad, asc + desc + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    col = tuple(color[:3]) + (alpha,)
    if tracking:
        x = pad
        for c, cw in zip(text, widths):
            d.text((x, pad), c, font=f, fill=col)
            x += cw + tracking
    else:
        d.text((pad, pad), text, font=f, fill=col)
    if shadow:
        a = im.getchannel("A")
        s1 = a.filter(ImageFilter.GaussianBlur(size * 0.05 + 1.2)).point(lambda v: int(min(255, v * 0.95 * shadow)))
        s2 = a.filter(ImageFilter.GaussianBlur(size * 0.22 + 3)).point(lambda v: int(min(255, v * 0.55 * shadow)))
        sh = ImageChops.lighter(s1, s2)
        base = Image.new("RGBA", im.size, (8, 10, 12, 0))
        base.putalpha(sh)
        base = ImageChops.offset(base, 1, 2)
        im = Image.alpha_composite(base, im)
    return im, pad, tw, asc


def comp(cv, layer, x, y):
    x, y = int(round(x)), int(round(y))
    sx, sy = max(0, -x), max(0, -y)
    dx, dy = max(0, x), max(0, y)
    w = min(layer.width - sx, cv.width - dx)
    h = min(layer.height - sy, cv.height - dy)
    if w > 0 and h > 0:
        cv.alpha_composite(layer, (dx, dy), (sx, sy, sx + w, sy + h))


def with_alpha(layer, a):
    if a >= 0.999:
        return layer
    out = layer.copy()
    out.putalpha(layer.getchannel("A").point(lambda v: int(v * a + 0.5)))
    return out


def comp_sub(cv, layer, x, y, alpha=1.0):
    """Sub-pixel accurate composite (for labels that move with the camera)."""
    if alpha <= 0.004:
        return
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    im = with_alpha(layer, alpha)
    if fx > 0.02 or fy > 0.02:
        im = im.transform((im.width + 1, im.height + 1), Image.AFFINE,
                          (1, 0, -fx, 0, 1, -fy), resample=Image.BILINEAR)
    comp(cv, im, ix, iy)


def draw_text(cv, text, face, size, color, x, y, alpha=1.0, align="left", tracking=0,
              shadow=1.0, sub=False):
    """(x, y): left/center/right edge and the top (ascender line) of the text."""
    if alpha <= 0.004:
        return
    im, pad, tw, _ = text_img(text, face, size, tuple(color), tracking, shadow)
    if align == "center":
        x -= tw / 2
    elif align == "right":
        x -= tw
    if sub:
        comp_sub(cv, im, x - pad, y - pad, alpha)
    else:
        comp(cv, with_alpha(im, alpha), x - pad, y - pad)


@lru_cache(maxsize=64)
def rotated_text(text, face, size, color, tracking, angle, alpha):
    im, pad, tw, asc = text_img(text, face, size, tuple(color), tracking, 0.6, alpha)
    return im.rotate(angle, resample=Image.BICUBIC, expand=True)


@lru_cache(maxsize=128)
def soft_box(w, h, r, blur, a):
    pad = int(blur * 3)
    im = Image.new("L", (w + 2 * pad, h + 2 * pad), 0)
    ImageDraw.Draw(im).rounded_rectangle([pad, pad, pad + w, pad + h], r, fill=int(255 * a))
    im = im.filter(ImageFilter.GaussianBlur(blur))
    out = Image.new("RGBA", im.size, INK + (0,))
    out.putalpha(im)
    return out, pad


@lru_cache(maxsize=1)
def corner_shade():
    w, h = 1150, 420
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.sqrt((xx / w) ** 2 + (yy / h) ** 2)
    a = np.clip(1 - r, 0, 1) ** 1.5 * 0.62
    im = Image.new("RGBA", (w, h), INK + (0,))
    im.putalpha(Image.fromarray((a * 255).astype(np.uint8)))
    return im


# ---------------------------------------------------------------------------
# vector overlay layer (2x supersampled, auto-cropped, optional soft shadow)
# ---------------------------------------------------------------------------

class Layer:
    SS = 2

    def __init__(self):
        self.ops, self.sops = [], []
        self.bb = [1e9, 1e9, -1e9, -1e9]

    def _ext(self, xs, ys, pad):
        b = self.bb
        b[0], b[1] = min(b[0], float(np.min(xs)) - pad), min(b[1], float(np.min(ys)) - pad)
        b[2], b[3] = max(b[2], float(np.max(xs)) + pad), max(b[3], float(np.max(ys)) + pad)

    def line(self, pts, color, width, shadow=False, caps=True):
        pts = np.asarray(pts, dtype=np.float64)
        if len(pts) < 2 or width <= 0 or color[3] <= 0:
            return
        self._ext(pts[:, 0], pts[:, 1], width + 12)
        self.ops.append(("line", pts, color, width, caps))
        if shadow:
            self.sops.append(("line", pts, width, caps))

    def poly(self, pts, fill=None, outline=None, width=0.0, shadow=False):
        pts = np.asarray(pts, dtype=np.float64)
        if len(pts) < 3:
            return
        self._ext(pts[:, 0], pts[:, 1], width + 12)
        self.ops.append(("poly", pts, fill, outline, width))
        if shadow:
            self.sops.append(("poly", pts))

    def circle(self, x, y, r, fill=None, outline=None, width=0.0, shadow=False, ry=None):
        ry = r if ry is None else ry
        if r <= 0.05:
            return
        self._ext([x - r, x + r], [y - ry, y + ry], width + 12)
        self.ops.append(("ell", x, y, r, ry, fill, outline, width))
        if shadow:
            self.sops.append(("ell", x, y, r, ry))

    def render(self, cv, shadow_alpha=0.5, shadow_off=(3, 4), shadow_blur=3.0):
        if not self.ops:
            return
        sp = int(shadow_blur * 3) + 6
        x0 = max(0, int(math.floor(self.bb[0])) - sp)
        y0 = max(0, int(math.floor(self.bb[1])) - sp)
        x1 = min(W, int(math.ceil(self.bb[2])) + sp)
        y1 = min(H, int(math.ceil(self.bb[3])) + sp)
        if x1 <= x0 or y1 <= y0:
            return
        if self.sops:
            m = Image.new("L", (x1 - x0, y1 - y0), 0)
            d = ImageDraw.Draw(m)
            ox, oy = x0 - shadow_off[0], y0 - shadow_off[1]
            for op in self.sops:
                if op[0] == "line":
                    p = (op[1] - (ox, oy))
                    wd = max(1, int(round(op[2])))
                    d.line(p.ravel().tolist(), fill=255, width=wd, joint="curve")
                elif op[0] == "poly":
                    d.polygon((op[1] - (ox, oy)).ravel().tolist(), fill=255)
                else:
                    _, x, y, r, ry = op
                    d.ellipse([x - r - ox, y - ry - oy, x + r - ox, y + ry - oy], fill=255)
            m = m.filter(ImageFilter.GaussianBlur(shadow_blur))
            m = m.point(lambda v: int(v * shadow_alpha))
            sh = Image.new("RGBA", m.size, (6, 8, 10, 0))
            sh.putalpha(m)
            cv.alpha_composite(sh, (x0, y0))
        s = self.SS
        im = Image.new("RGBA", ((x1 - x0) * s, (y1 - y0) * s), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        off = np.array([x0, y0], np.float64)
        for op in self.ops:
            if op[0] == "line":
                _, pts, color, width, caps = op
                p = (pts - off) * s
                wd = max(1, int(round(width * s)))
                d.line(p.ravel().tolist(), fill=color, width=wd, joint="curve" if wd > 2 else None)
                if caps and wd > 2:
                    r = wd / 2.0
                    for q in (p[0], p[-1]):
                        d.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=color)
            elif op[0] == "poly":
                _, pts, fill, outline, width = op
                p = ((pts - off) * s).ravel().tolist()
                if outline is not None and width > 0:
                    d.polygon(p, fill=fill, outline=outline, width=max(1, int(round(width * s))))
                else:
                    d.polygon(p, fill=fill)
            else:
                _, x, y, r, ry, fill, outline, width = op
                bb = [(x - r - x0) * s, (y - ry - y0) * s, (x + r - x0) * s, (y + ry - y0) * s]
                d.ellipse(bb, fill=fill, outline=outline,
                          width=max(1, int(round(width * s))) if outline is not None else 0)
        cv.alpha_composite(im.reduce(s), (x0, y0))


# ---------------------------------------------------------------------------
# geometry helpers for routes / arrows
# ---------------------------------------------------------------------------

def catmull(pts, n=24, alpha=0.5):
    """Centripetal Catmull-Rom spline through pts (map units)."""
    P = np.asarray(pts, dtype=np.float64)
    if len(P) < 3:
        return np.vstack([P[0] + (P[-1] - P[0]) * u for u in np.linspace(0, 1, n)])
    P = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        t0 = 0.0
        t1 = t0 + max(np.linalg.norm(p1 - p0) ** alpha, 1e-6)
        t2 = t1 + max(np.linalg.norm(p2 - p1) ** alpha, 1e-6)
        t3 = t2 + max(np.linalg.norm(p3 - p2) ** alpha, 1e-6)
        t = np.linspace(t1, t2, n, endpoint=False)[:, None]
        a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
        a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
        a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
        b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
        b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
        out.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
    out.append(P[-2][None])
    return np.vstack(out)


def arc_curve(a, b, bend=0.12, n=40):
    """Gently bent segment a -> b (quadratic Bézier), map units."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = b - a
    m = (a + b) / 2 + np.array([-d[1], d[0]]) * bend
    u = np.linspace(0, 1, n)[:, None]
    return (1 - u) ** 2 * a + 2 * (1 - u) * u * m + u * u * b


def cumlen(p):
    return np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(p, axis=0).T))])


def upto(p, cl, L):
    """Polyline prefix of length L (cl = cumlen(p))."""
    if L <= 0:
        return p[:1]
    if L >= cl[-1]:
        return p
    i = int(np.searchsorted(cl, L))
    u = (L - cl[i - 1]) / max(cl[i] - cl[i - 1], 1e-12)
    return np.vstack([p[:i], p[i - 1] + (p[i] - p[i - 1]) * u])


def point_at(p, cl, L):
    L = clamp(L, 0, cl[-1])
    i = int(np.clip(np.searchsorted(cl, L), 1, len(p) - 1))
    u = (L - cl[i - 1]) / max(cl[i] - cl[i - 1], 1e-12)
    q = p[i - 1] + (p[i] - p[i - 1]) * u
    d = p[i] - p[i - 1]
    return q, math.atan2(d[1], d[0])


def dashes(p, cl, period, on, phase=0.0):
    """Split a polyline into dash pieces (lengths in the same units as cl)."""
    out = []
    s = -phase % period - period
    while s < cl[-1]:
        a, b = max(s, 0.0), min(s + on, cl[-1])
        if b > a:
            seg = upto(p, cl, b)
            i = int(np.searchsorted(cl, a))
            q, _ = point_at(p, cl, a)
            piece = np.vstack([q[None], seg[i:]]) if i < len(seg) else seg[-2:]
            if len(piece) >= 2:
                out.append(piece)
        s += period
    return out


def arrow_poly(p, w0, w1, head_w, head_l):
    """Tapered arrow polygon along screen-space centerline p (tail -> tip)."""
    cl = cumlen(p)
    Lt = cl[-1]
    if Lt < 2:
        return None
    k = clamp(Lt / (head_l * 1.6))
    hl, hw = head_l * k, head_w * (0.35 + 0.65 * k)
    neck = Lt - hl
    body = upto(p, cl, neck)
    if len(body) < 2:
        body = np.vstack([p[0], p[0] + (p[-1] - p[0]) * 0.01])
    bl = cumlen(body)
    tg = np.gradient(body, axis=0)
    tg /= np.maximum(np.hypot(tg[:, 0], tg[:, 1]), 1e-9)[:, None]
    nm = np.stack([-tg[:, 1], tg[:, 0]], axis=1)
    uu = bl / max(bl[-1], 1e-9)
    wd = (w0 + (w1 - w0) * uu ** 0.6) * (0.5 + 0.5 * k)
    left = body + nm * (wd / 2)[:, None]
    right = body - nm * (wd / 2)[:, None]
    tip = p[-1]
    dv = tip - body[-1]
    dv = dv / max(np.hypot(*dv), 1e-9)
    hn = np.array([-dv[1], dv[0]])
    nk = body[-1]
    head = [nk + hn * hw / 2, tip, nk - hn * hw / 2]
    return np.vstack([left, head, right[::-1]])


def rot(pts, ang, x, y, sc=1.0):
    c, s = math.cos(ang), math.sin(ang)
    p = np.asarray(pts, dtype=np.float64) * sc
    return np.stack([p[:, 0] * c - p[:, 1] * s + x, p[:, 0] * s + p[:, 1] * c + y], axis=1)


# ---------------------------------------------------------------------------
# reusable map graphics
# ---------------------------------------------------------------------------

def pin_dot(L, x, y, age, size=1.0, pulse=True, color=RED):
    """Red dot with gold ring: pops in (age = seconds since appearance) and pulses."""
    if age <= 0:
        return
    k = ease_back(age / 0.38) * size
    if pulse:
        for j in range(2):
            a = age - 0.18 - j * 0.8
            if a <= 0:
                continue
            ph = (a % 1.6) / 1.6
            r = (10 + 30 * ease_out(ph)) * size
            al = (1 - ph) ** 1.6 * 0.85
            L.circle(x, y, r, outline=rgba(GOLD, al), width=2.2 * size)
    r = 8.5 * k
    L.circle(x, y, r + 3.4 * k, fill=rgba(GOLD), shadow=True)
    L.circle(x, y, r, fill=rgba(color))
    L.circle(x - r * 0.28, y - r * 0.3, r * 0.32, fill=(255, 255, 255, 80))


def pin_drop(L, x, y, age, size=1.0):
    """Teardrop map pin that drops in with a bounce, then pulses at its foot."""
    if age <= 0:
        return
    p = clamp(age / 0.6)
    fall = (1 - bounce(p)) * 140
    R = 17 * size
    sh = 0.35 + 0.65 * (1 - fall / 140)
    L.circle(x, y + 1, R * 0.95 * sh, ry=R * 0.32 * sh, fill=(10, 8, 6, int(110 * sh)))
    if age > 0.45:
        for j in range(2):
            a = age - 0.45 - j * 0.8
            if a <= 0:
                continue
            ph = (a % 1.6) / 1.6
            r = (8 + 46 * ease_out(ph)) * size
            L.circle(x, y, r, ry=r * 0.92, outline=rgba(GOLD, (1 - ph) ** 1.5 * 0.9),
                     width=2.6 * size)
    cy = y - fall - R * 2.05
    ang = np.linspace(math.radians(140), math.radians(400), 40)
    head = np.stack([x + R * np.cos(ang), cy + R * np.sin(ang)], axis=1)
    shape = np.vstack([head, [[x, y - fall]]])
    L.poly(shape, fill=rgba(RED), outline=rgba(GOLD), width=2.4 * size, shadow=True)
    L.circle(x, cy, R * 0.42, fill=rgba(CREAM))
    L.circle(x, cy, R * 0.2, fill=rgba(RED_DARK))


@lru_cache(maxsize=256)
def label_sprite(name, sub, side, name_size=25, sub_size=29, plate=0.5, name_color=CREAM):
    """City label: caps name (Montserrat) + optional italic sub-label (Playfair).
    Returns (img, ax, ay): img position = pin position - (ax, ay)."""
    gap = 20
    n_im, n_pad, n_w, n_asc = text_img(tr_upper(name), "sans-semibold", name_size, name_color, 3,
                                       1.15)
    parts = [(n_im, n_pad, n_w, name_size * 1.05)]
    if sub:
        s_im, s_pad, s_w, _ = text_img(sub, "serif-italic", sub_size, GOLD, 0, 1.15)
        parts.append((s_im, s_pad, s_w, sub_size * 1.25))
    tot_h = sum(p[3] for p in parts)
    max_w = max(p[2] for p in parts)
    P = 30
    cw, ch = int(max_w + 2 * P + 60), int(tot_h + 2 * P + 60)
    cv = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    y = P + 30
    for im, pad, tw, lh in parts:
        if side in ("r", "rt", "rb"):
            x = P
        elif side in ("l", "lt", "lb"):
            x = P + max_w - tw
        else:
            x = P + (max_w - tw) / 2
        # name: shift up a bit so caps sit visually centered in their line box
        cv.alpha_composite(im, (int(round(x - pad)) + 30, int(round(y - pad - lh * 0.12))))
        y += lh
    bx0, by0 = P + 30, P + 30          # text block top-left inside canvas
    bw, bh = max_w, tot_h
    if plate:
        m = Image.new("L", cv.size, 0)
        ImageDraw.Draw(m).rounded_rectangle(
            [bx0 - 12, by0 - 9, bx0 + bw + 12, by0 + bh + 2], 7, fill=int(255 * plate))
        m = m.filter(ImageFilter.GaussianBlur(2.5))
        pl = Image.new("RGBA", cv.size, INK + (0,))
        pl.putalpha(m)
        cv = Image.alpha_composite(pl, cv)
    if side == "r":
        ax, ay = bx0 - gap, by0 + bh / 2
    elif side == "l":
        ax, ay = bx0 + bw + gap, by0 + bh / 2
    elif side == "t":
        ax, ay = bx0 + bw / 2, by0 + bh + gap * 0.6
    elif side == "b":
        ax, ay = bx0 + bw / 2, by0 - gap * 0.7
    elif side == "rt":
        ax, ay = bx0 - gap * 0.7, by0 + bh + gap * 0.2
    elif side == "lt":
        ax, ay = bx0 + bw + gap * 0.7, by0 + bh + gap * 0.2
    elif side == "rb":
        ax, ay = bx0 - gap * 0.7, by0 - gap * 0.3
    else:  # "lb"
        ax, ay = bx0 + bw + gap * 0.7, by0 - gap * 0.3
    return cv, ax, ay


def city_label(cv, x, y, age, name, sub=None, side="r", dx=0.0, dy=0.0, alpha=1.0, **kw):
    if age <= 0 or alpha <= 0:
        return
    im, ax, ay = label_sprite(name, sub, side, **kw)
    p = ease_out(age / 0.5)
    slide = (1 - p) * 14
    sx = {"r": -slide, "rt": -slide, "rb": -slide, "l": slide, "lt": slide, "lb": slide}.get(side, 0)
    sy = {"t": slide, "b": -slide}.get(side, 0)
    comp_sub(cv, im, x - ax + dx + sx, y - ay + dy + sy, p * alpha)


@lru_cache(maxsize=16)
def card_img(title, caption=None, title_size=58, face="serif-bold"):
    """Dark label card with gold hairline and red accent bar."""
    t_im, t_pad, t_w, t_asc = text_img(title, face, title_size, CREAM, 0, 0.6)
    padx, pady = 34, 22
    cap = None
    if caption:
        cap = (text_img(caption, "sans", 27, (226, 214, 192), 1, 0.4) if face == "serif-bold"
               else text_img(caption, "sans-medium", 20, GOLD, 4, 0.4))
    cw = int(max(t_w, cap[2] if cap else 0) + 2 * padx + 14)
    th = int(title_size * 1.22)
    ch = int(pady * 2 + th + (44 if cap else 0))
    shadow_pad = 30
    out = Image.new("RGBA", (cw + 2 * shadow_pad, ch + 2 * shadow_pad), (0, 0, 0, 0))
    sh, sp = soft_box(cw, ch, 10, 12, 0.55)
    out.alpha_composite(sh, (shadow_pad - sp + 4, shadow_pad - sp + 8))
    body = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    d = ImageDraw.Draw(body)
    d.rounded_rectangle([0, 0, cw - 1, ch - 1], 8, fill=(16, 22, 28, 228), outline=GOLD + (170,), width=2)
    d.rectangle([0, 10, 6, ch - 11], fill=RED + (255,))
    body.alpha_composite(t_im, (padx + 6 - t_pad, pady - t_pad - int(title_size * 0.08)))
    if cap:
        body.alpha_composite(cap[0], (padx + 8 - cap[1], pady + th - cap[1] + 2))
    out.alpha_composite(body, (shadow_pad, shadow_pad))
    return out, shadow_pad, cw, ch


def draw_card(cv, x, y, age, title, caption=None, title_size=58, face="serif-bold",
              align="left"):
    """(x, y): left edge (or center / right edge) and vertical center of the card body."""
    if age <= 0:
        return
    im, sp, cw, ch = card_img(title, caption, title_size, face)
    if align == "center":
        x -= cw / 2
    elif align == "right":
        x -= cw
    p = ease_out(age / 0.55)
    wv = int(im.width * clamp(0.15 + 0.85 * p))
    dx = (1 - p) * 18
    if align == "right":
        dx = -dx + (im.width - wv)
        if wv < im.width:
            im = im.crop((im.width - wv, 0, im.width, im.height))
    elif wv < im.width:
        im = im.crop((0, 0, wv, im.height))
    comp_sub(cv, im, x - sp + dx, y - ch / 2 - sp, smooth(age / 0.35))


def title_block(cv, t, t0, kicker, title, pos="tl"):
    """Scene title: red bar, letter-spaced kicker, big serif title. pos: 'tl' top-left or
    'bl' bottom-left (kept above the subtitle band, bottom edge ~y=915)."""
    p = t - t0
    if p <= 0:
        return
    if pos == "bl":
        sh = corner_shade().transpose(Image.FLIP_TOP_BOTTOM)
        comp(cv, with_alpha(sh, smooth(p / 0.6)), 0, H - sh.height)
        x, y = 96, 772
    else:
        comp(cv, with_alpha(corner_shade(), smooth(p / 0.6)), 0, 0)
        x, y = 96, 66
    bw = int(70 * ease_out(p / 0.7))
    if bw > 0:
        bar = Image.new("RGBA", (bw, 5), RED + (255,))
        comp(cv, bar, x, y)
    a1 = ease_out((p - 0.12) / 0.6)
    draw_text(cv, tr_upper(kicker), "sans-medium", 24, GOLD, x + (1 - a1) * -20, y + 24, a1, tracking=6)
    a2 = ease_out((p - 0.25) / 0.7)
    draw_text(cv, title, "serif-bold", 76, CREAM, x - 4 + (1 - a2) * -26, y + 54, a2)


def caption(cv, t, t0, text, x, y, size=54, sub=None, align="center"):
    """Quote / caption card. (x, y): anchor (center/left/right edge) and vertical center."""
    draw_card(cv, x, y, t - t0, text, sub, size, "serif-italic", align)


def sea_label(cv, cam, lat, lon, text, alpha, size=34, angle=0.0, tracking=9, along=None):
    """Italic water label; `along` = ((lat, lon), (lat, lon)) orients it along a channel."""
    if alpha <= 0.004:
        return
    if along is not None:
        d = G(*along[1]) - G(*along[0])
        angle = round(-math.degrees(math.atan2(d[1], d[0])), 1)
    x, y = cam.at(lat, lon)
    alpha *= (1 - smooth((y - 860) / 45)) * smooth((y - 30) / 40)
    if alpha <= 0.004:
        return
    im = rotated_text(text, "serif-italic", size, (200, 222, 222), tracking, angle, 200)
    comp_sub(cv, im, x - im.width / 2, y - im.height / 2, alpha)


def land_label(cv, cam, lat, lon, text, alpha, size=26, tracking=12):
    if alpha <= 0.004:
        return
    x, y = cam.at(lat, lon)
    alpha *= (1 - smooth((y - 860) / 45)) * smooth((y - 30) / 40)
    if alpha <= 0.004:
        return
    im = rotated_text(text, "sans-medium", size, (96, 70, 46), tracking, 0.0, 190)
    comp_sub(cv, im, x - im.width / 2, y - im.height / 2, alpha)


def draw_route(L, cam, path, cl, Lnow, width=6.0, color=RED, dashed=None, outline=True):
    """Progressively drawn route; path in map units, Lnow in map units."""
    if Lnow <= 0:
        return None
    part = upto(path, cl, Lnow)
    sp = cam.xy(part)
    if dashed:
        pcl = cumlen(part) * cam.s
        pieces = dashes(sp, pcl, dashed[0] * cam.s, dashed[1] * cam.s)
    else:
        pieces = [sp]
    for pc in pieces:
        if outline:
            L.line(pc, rgba(RED_DARK, 0.55), width + 3.5, shadow=True)
    for pc in pieces:
        L.line(pc, rgba(color), width)
    return sp


def arrowhead(L, x, y, ang, size=20, color=RED, alpha=1.0):
    pts = rot([(size * 0.55, 0), (-size * 0.6, -size * 0.55), (-size * 0.32, 0),
               (-size * 0.6, size * 0.55)], ang, x, y)
    L.poly(pts, fill=rgba(color, alpha), outline=rgba(RED_DARK, alpha * 0.8), width=1.2,
           shadow=True)


def big_arrow(L, cam, path, cl, prog, w0=10, w1=30, head_w=62, head_l=50, color=RED,
              alpha=0.94, outline=RED_DARK):
    if prog <= 0:
        return
    sp = cam.xy(upto(path, cl, cl[-1] * prog))
    poly = arrow_poly(sp, w0, w1, head_w, head_l)
    if poly is None:
        return
    L.poly(poly, fill=rgba(color, alpha), outline=rgba(outline, min(1, alpha + 0.05)),
           width=2.0, shadow=True)


def front_line(L, pts_screen, alpha, color=ALLY, teeth_side=1.0, width=5.0):
    """Military front line with triangular teeth (teeth_side flips which side)."""
    if alpha <= 0.01:
        return
    p = pts_screen
    cl = cumlen(p)
    L.line(p, rgba((24, 34, 46), alpha * 0.6), width + 3, shadow=True)
    L.line(p, rgba(color, alpha), width)
    step = 26.0
    s = step / 2
    while s < cl[-1] - 6:
        q, ang = point_at(p, cl, s)
        n = np.array([-math.sin(ang), math.cos(ang)]) * teeth_side
        d = np.array([math.cos(ang), math.sin(ang)])
        tri = [q - d * 6, q + d * 6, q + n * 10]
        L.poly(tri, fill=rgba(color, alpha))
        s += step


def warship(L, x, y, ang, sc=1.0, alpha=1.0):
    """Top-down battleship silhouette, bow pointing along `ang`."""
    if alpha <= 0.01:
        return
    hull = [(19, 0), (12, -4.4), (-12, -4.6), (-17, -3.2), (-18, 0), (-17, 3.2), (-12, 4.6),
            (12, 4.4)]
    L.poly(rot(hull, ang, x, y, sc), fill=rgba((150, 164, 180), alpha),
           outline=rgba((14, 20, 28), alpha), width=1.4, shadow=True)
    L.poly(rot([(7, -2.3), (-7, -2.6), (-7, 2.6), (7, 2.3)], ang, x, y, sc),
           fill=rgba((214, 222, 230), alpha))
    for px in (12.5, -12.0):
        q = rot([(px, 0)], ang, x, y, sc)[0]
        L.circle(q[0], q[1], 2.3 * sc, fill=rgba((34, 42, 52), alpha))
    for px in (2.5, -2.0):
        q = rot([(px, 0)], ang, x, y, sc)[0]
        L.circle(q[0], q[1], 1.5 * sc, fill=rgba((28, 30, 34), alpha))


def steamer(L, x, y, sc=1.0, alpha=1.0, flip=False, bob=0.0):
    """Small side-view steamship icon (Bandırma Vapuru), centered at the waterline."""
    if alpha <= 0.01:
        return
    f = -1 if flip else 1

    def T(pts):
        return np.array([(x + f * px * sc, y + (py + bob) * sc) for px, py in pts])
    L.poly(T([(-24, -3), (24, -5), (18, 7), (-19, 7)]), fill=rgba((24, 22, 24), alpha),
           outline=rgba(CREAM, alpha * 0.9), width=1.2, shadow=True)
    L.poly(T([(-12, -3.4), (10, -4.3), (10, -10), (-12, -10)]), fill=rgba(CREAM, alpha))
    L.poly(T([(0, -10), (6, -10), (5.5, -21), (0.5, -21)]), fill=rgba(RED, alpha))
    L.poly(T([(0.5, -21), (5.5, -21), (5.4, -24), (0.6, -24)]), fill=rgba((24, 22, 24), alpha))
    L.line(T([(-17, -4), (-17, -26)]), rgba((24, 22, 24), alpha), 1.4, caps=False)
    L.line(T([(17, -5), (17, -24)]), rgba((24, 22, 24), alpha), 1.4, caps=False)
    L.poly(T([(-16.6, -26), (-9, -24), (-16.6, -21.5)]), fill=rgba(RED, alpha))


def burst(L, x, y, age, size=1.0):
    """Explosion flash."""
    if age <= 0 or age > 1.0:
        return
    p = age / 1.0
    r = (6 + 34 * ease_out(p)) * size
    L.circle(x, y, r * 0.75, fill=(255, 196, 110, int(200 * (1 - p) ** 2)))
    L.circle(x, y, r * 0.38, fill=(255, 246, 214, int(255 * (1 - p) ** 3)))
    L.circle(x, y, r, outline=(255, 170, 80, int(220 * (1 - p) ** 1.5)), width=3 * size)
    for k in range(8):
        a = k * math.pi / 4 + 0.3
        r0, r1 = r * 0.9, r * (1.25 + 0.2 * (k % 2))
        L.line([(x + r0 * math.cos(a), y + r0 * math.sin(a)),
                (x + r1 * math.cos(a), y + r1 * math.sin(a))],
               (255, 210, 140, int(230 * (1 - p) ** 1.6)), 2.2 * size)


# ---------------------------------------------------------------------------
# Scene 1: Selanik (1881)
# ---------------------------------------------------------------------------

SELANIK = (40.64, 22.94)
SEL_DUR = 5.0
SEL_TARGET_XY = (760.0, 468.0)


def cam_selanik(t):
    T = G(*SELANIK)
    s0, c0 = W / 27.5, G(40.15, 28.6)
    s1 = W / 5.4
    off0 = (T - c0) * s0
    off1 = np.array([SEL_TARGET_XY[0] - W / 2, SEL_TARGET_XY[1] - H / 2])
    e = smoother((t - 0.55) / 2.6)
    s = s0 * (s1 / s0) ** e
    off = off0 + (off1 - off0) * e
    s *= 1 + 0.012 * t                      # slow push-in about the target
    c = T - off / s
    return Cam(c[0], c[1], s)


def draw_selanik(cv, cam, t):
    wide = 1 - smooth((t - 0.75) / 0.9)
    sea_label(cv, cam, 43.15, 34.4, "KARADENİZ", wide * 0.9, 36)
    sea_label(cv, cam, 39.45, 24.85, "EGE DENİZİ", wide * 0.9, 26)
    land_label(cv, cam, 39.15, 33.6, "ANADOLU", wide * 0.85, 30, 16)
    land_label(cv, cam, 42.95, 23.9, "BALKANLAR", wide * 0.8, 24, 12)
    close = smooth((t - 3.0) / 0.8)
    sea_label(cv, cam, 39.78, 24.55, "EGE DENİZİ", close * 0.85, 28)

    L = Layer()
    ix, iy = cam.at(41.01, 28.98)
    pin_dot(L, ix, iy, (t - 0.2) * wide if wide > 0.01 else 0, 0.75, pulse=False)
    sx, sy = cam.at(*SELANIK)
    if t < 2.9:
        # small locator dot during the approach
        pin_dot(L, sx, sy, (t - 0.35), 0.62, pulse=False)
    pin_drop(L, sx, sy, t - 2.85, 1.0)
    L.render(cv)
    city_label(cv, ix, iy, (t - 0.3), "İstanbul", None, "r", alpha=wide)

    age = t - 3.3
    if age > 0:
        # leader line from pin head to the card
        x0, y0 = sx + 22, sy - 36
        x1 = x0 + 62 * ease_out(age / 0.4)
        ld = Layer()
        ld.line([(x0, y0), (x1, y0)], rgba(INK, 0.85), 2.2)
        ld.circle(x0, y0, 3.2, fill=rgba(INK, 0.9))
        ld.render(cv)
        draw_card(cv, x0 + 62, y0, age - 0.12, "Selanik · 1881", "Mustafa Kemal burada doğdu")


# ---------------------------------------------------------------------------
# Scene 2: Çanakkale (1915)
# ---------------------------------------------------------------------------

CAN_DUR = 6.0
CAN_KEYS = [(0.0, 39.98, 25.98, 5.8), (2.6, 40.18, 26.33, 1.66), (6.0, 40.185, 26.335, 1.6)]
# Allied column: Aegean -> strait mouth -> up the channel, stopping before the mine line
FLEET_PATH = catmull(GP([(39.80, 25.55), (39.90, 25.85), (39.99, 26.10), (40.035, 26.215),
                         (40.060, 26.265), (40.080, 26.298)]), 30)
FLEET_CL = cumlen(FLEET_PATH)
FLEET_STOP = 1.0            # fraction of the path where the lead ship stops
# Turkish defence (forts + mine line) across the channel below the Narrows (Kepez / Erenköy)
DEF_LINE = GP([(40.128, 26.312), (40.110, 26.344), (40.092, 26.378)])
MINES = [(40.106, 26.313), (40.100, 26.326), (40.094, 26.339), (40.088, 26.352)]
LAND_ARI = catmull(GP([(40.17, 25.98), (40.215, 26.15), (40.238, 26.258)]), 30)
LAND_SUVLA = catmull(GP([(40.37, 26.02), (40.335, 26.14), (40.305, 26.215)]), 30)
RIDGE = catmull(GP([(40.200, 26.296), (40.228, 26.302), (40.256, 26.306), (40.282, 26.296),
                    (40.306, 26.268)]), 30)


def cam_canakkale(t):
    return key_cam(CAN_KEYS, t, drift=0.008)


def draw_canakkale(cv, cam, t):
    sea_label(cv, cam, 39.70, 25.30, "EGE DENİZİ", (1 - smooth((t - 1.0) / 0.8)) * 0.85, 30)
    sea_label(cv, cam, 40.345, 26.632, "ÇANAKKALE BOĞAZI", smooth((t - 2.2) / 0.8) * 0.85, 21,
              tracking=5, along=((40.26, 26.508), (40.34, 26.627)))
    sea_label(cv, cam, 40.47, 26.40, "SAROS KÖRFEZİ", smooth((t - 2.4) / 0.8) * 0.7, 22,
              tracking=6)

    low, mid, top = Layer(), Layer(), Layer()
    # Allied approach arrow (translucent) under the ships
    big_arrow(low, cam, FLEET_PATH, FLEET_CL, 0.80 * ease_in_out((t - 0.3) / 2.0),
              w0=8, w1=26, head_w=56, head_l=44, color=ALLY, alpha=0.62, outline=ALLY_LIGHT)

    # ships: column moving in, decelerating to a stop in front of the defence line
    lead = FLEET_CL[-1] * FLEET_STOP * (1 - (1 - clamp((t - 0.7) / 2.4)) ** 2.2)
    spacing = 0.055
    ship_sc = 1.5 * clamp((cam.s / (W / 1.66)) ** 0.6, 0.45, 1.0)
    for i in range(5):
        Ls = lead - i * spacing
        if Ls <= 0:
            continue
        q, ang = point_at(FLEET_PATH, FLEET_CL, Ls)
        x, y = cam.xy(q)
        a = smooth(Ls / 0.04)
        sink = 0.0
        if i in (0, 2):
            sink = smooth((t - (3.15 if i == 0 else 3.45)) / 0.9)
        # wake
        tail = cam.xy(upto(FLEET_PATH, FLEET_CL, Ls)[-12:])
        if len(tail) >= 2:
            low.line(tail, (226, 236, 236, int(60 * a * (1 - sink))), 2.4, caps=False)
        warship(mid, x, y + sink * 3, ang, ship_sc * (1 - 0.25 * sink), a * (1 - sink))
    # defence line (mines + batteries) across the strait
    pd = smooth((t - 1.55) / 0.8)
    if pd > 0:
        dl = catmull(DEF_LINE, 12)
        dcl = cumlen(dl)
        sp = cam.xy(upto(dl, dcl, dcl[-1] * pd))
        mid.line(sp, rgba(RED_DARK, 0.7), 10.5, shadow=True)
        mid.line(sp, rgba(RED), 7.0)
        # mine row just south of the line
        for k, (la, lo) in enumerate(MINES):
            if (k + 0.5) / len(MINES) > pd:
                break
            mx, my = cam.at(la, lo)
            for j in range(4):
                a = j * math.pi / 4
                top.line([(mx - 6 * math.cos(a), my - 6 * math.sin(a)),
                          (mx + 6 * math.cos(a), my + 6 * math.sin(a))], rgba((24, 20, 18)), 1.4)
            top.circle(mx, my, 4.2, fill=rgba((30, 24, 22)), outline=rgba(GOLD, 0.95), width=1.3)
    # explosions at the stopped ships
    for i, t0 in ((0, 3.05), (2, 3.35), (1, 3.7)):
        Ls = FLEET_CL[-1] * FLEET_STOP - i * spacing
        q, _ = point_at(FLEET_PATH, FLEET_CL, Ls)
        x, y = cam.xy(q)
        burst(top, x + 4, y - 3, t - t0, 1.0)
    # landings (25 April / 6 August 1915)
    big_arrow(low, cam, LAND_ARI, cumlen(LAND_ARI), ease_in_out((t - 3.2) / 0.9),
              w0=6, w1=18, head_w=38, head_l=30, color=ALLY, alpha=0.85, outline=ALLY_LIGHT)
    big_arrow(low, cam, LAND_SUVLA, cumlen(LAND_SUVLA), ease_in_out((t - 3.55) / 0.9),
              w0=6, w1=18, head_w=38, head_l=30, color=ALLY, alpha=0.85, outline=ALLY_LIGHT)
    pr = smooth((t - 4.0) / 0.7)
    if pr > 0:
        rcl = cumlen(RIDGE)
        front_line(mid, cam.xy(upto(RIDGE, rcl, rcl[-1] * pr)), 1.0, color=RED,
                   teeth_side=-1.0, width=4.5)

    pins = [("Arıburnu", 40.24, 26.275, 3.7, "l", -4, -30),
            ("Conkbayırı", 40.235, 26.32, 4.15, "r", 6, 26),
            ("Anafartalar", 40.29, 26.37, 4.5, "t", 0, -4)]
    for name, la, lo, t0, *_ in pins:
        x, y = cam.at(la, lo)
        pin_dot(top, x, y, t - t0, 0.9)
    low.render(cv)
    mid.render(cv)
    top.render(cv)
    if 0.9 < t < 3.9:
        q, _ = point_at(FLEET_PATH, FLEET_CL, max(lead - 3.5 * spacing, 0.02))
        x, y = cam.xy(q)
        draw_text(cv, "İTİLAF DONANMASI", "sans-semibold", 20, ALLY_LIGHT, x - 30, y + 14,
                  smooth((t - 1.0) / 0.5) * (1 - smooth((t - 3.3) / 0.5)), align="right",
                  tracking=4, sub=True)
    for name, la, lo, t0, side, dx, dy in pins:
        x, y = cam.at(la, lo)
        city_label(cv, x, y, t - t0 - 0.1, name, None, side, dx, dy)

    title_block(cv, t, 0.3, "Gelibolu Yarımadası", "Çanakkale · 1915")
    caption(cv, t, 4.75, "“Çanakkale geçilmez!”", 1790, 790, size=56, align="right")


# ---------------------------------------------------------------------------
# Scene 3: Millî Mücadele (1919)
# ---------------------------------------------------------------------------

MM_DUR = 7.0
MM_STOPS = [
    # name, lat, lon, arrival time, sub-label, label side, dx, dy
    ("İstanbul", 41.01, 28.98, 0.25, "16 Mayıs 1919", "l", 0, 0),
    ("Samsun", 41.29, 36.33, 2.05, "19 Mayıs 1919", "r", 0, -6),
    ("Havza", 40.97, 35.66, 2.45, None, "l", 0, -4),
    ("Amasya", 40.65, 35.83, 2.85, "Amasya Genelgesi", "lb", -4, 2),
    ("Erzurum", 39.90, 41.27, 4.0, "Erzurum Kongresi", "b", 0, 0),
    ("Sivas", 39.75, 37.02, 4.8, "Sivas Kongresi", "b", 0, 0),
    ("Ankara", 39.93, 32.86, 5.8, "27 Aralık 1919", "b", 0, 0),
]
MM_SEA = GP([(41.01, 28.98), (41.09, 29.055), (41.215, 29.12), (41.33, 29.55), (41.47, 30.6),
             (41.70, 31.65), (42.08, 32.75), (42.24, 33.9), (42.27, 35.0), (42.02, 35.6),
             (41.82, 36.10), (41.53, 36.23), (41.29, 36.33)])
MM_CAM = [(0.0, 41.05, 31.2, 10.6), (1.2, 41.0, 32.9, 10.6), (2.3, 40.8, 34.7, 10.4),
          (3.1, 40.55, 36.3, 10.8), (4.1, 40.3, 37.7, 12.2), (5.1, 40.45, 36.2, 14.2),
          (6.1, 40.62, 34.9, 16.0), (7.0, 40.62, 34.85, 15.8)]


@lru_cache(maxsize=1)
def mm_paths():
    sea = catmull(MM_SEA, 16)
    legs = [("sea", sea, MM_STOPS[0][3] + 0.2, MM_STOPS[1][3])]
    bends = {"Havza": 0.12, "Amasya": 0.12, "Erzurum": -0.11, "Sivas": -0.12, "Ankara": -0.06}
    for a, b in zip(MM_STOPS[1:], MM_STOPS[2:]):
        bend = bends[b[0]]
        p = arc_curve(G(a[1], a[2]), G(b[1], b[2]), bend, 48)
        legs.append((b[0], p, a[3], b[3]))
    return [(name, p, cumlen(p), t0, t1) for name, p, t0, t1 in legs]


def cam_milli(t):
    return key_cam(MM_CAM, t, drift=0.004)


def draw_milli(cv, cam, t):
    sea_label(cv, cam, 42.85, 35.6, "KARADENİZ", 0.85, 34)
    land_label(cv, cam, 38.75, 36.0, "ANADOLU", 0.75, 30, 18)

    L, top = Layer(), Layer()
    head = None
    for name, p, cl, t0, t1 in mm_paths():
        if t <= t0:
            continue
        u = clamp((t - t0) / (t1 - t0))
        u = 0.35 * u + 0.65 * ease_in_out(u)
        dashed = (0.13, 0.08) if name == "sea" else None
        sp = draw_route(L, cam, p, cl, cl[-1] * u, 5.5, dashed=dashed)
        if u < 1 and sp is not None:
            q, ang = point_at(p, cl, cl[-1] * u)
            head = (cam.xy(q), ang, name)
    if head is not None and head[2] != "sea":
        (hx, hy), ang, _ = head
        arrowhead(top, hx, hy, ang, 22)
    # Bandırma vapuru on the sea leg
    name, p, cl, t0, t1 = mm_paths()[0]
    if t0 < t < t1 + 0.4:
        u = clamp((t - t0) / (t1 - t0))
        u = 0.35 * u + 0.65 * ease_in_out(u)
        q, ang = point_at(p, cl, cl[-1] * u)
        x, y = cam.xy(q)
        a = smooth((t - t0) / 0.3) * (1 - smooth((t - t1) / 0.4))
        steamer(top, x, y - 4, 1.35, a, flip=math.cos(ang) < 0, bob=math.sin(t * 5.0) * 0.8)
    for nm, la, lo, ta, *_ in MM_STOPS:
        x, y = cam.at(la, lo)
        pin_dot(top, x, y, t - ta, 0.95 if nm in ("Havza",) else 1.05)
    L.render(cv)
    top.render(cv)
    if t0 < t < t1 + 0.4:
        q, _ = point_at(p, cl, cl[-1] * (0.35 * clamp((t - t0) / (t1 - t0))
                                          + 0.65 * ease_in_out((t - t0) / (t1 - t0))))
        x, y = cam.xy(q)
        a = smooth((t - t0 - 0.2) / 0.4) * (1 - smooth((t - t1 + 0.3) / 0.4))
        draw_text(cv, "Bandırma Vapuru", "serif-italic", 26, CREAM, x, y - 82, a,
                  align="center", sub=True)
    for nm, la, lo, ta, sub, side, dx, dy in MM_STOPS:
        x, y = cam.at(la, lo)
        city_label(cv, x, y, t - ta - 0.08, nm, sub, side, dx, dy)
    title_block(cv, t, 0.15, "1919 – 1922", "Millî Mücadele", pos="bl")


# ---------------------------------------------------------------------------
# Scene 4: Sakarya → Büyük Taarruz (1921–1922)
# ---------------------------------------------------------------------------

BT_DUR = 6.0
BT_CAM = [(0.0, 39.3, 31.55, 6.6), (1.7, 39.05, 30.85, 7.4), (3.2, 38.95, 29.8, 8.5),
          (6.0, 38.95, 29.45, 8.75)]
BT_MAIN = catmull(GP([(38.70, 30.62), (38.86, 30.06), (38.70, 29.40), (38.52, 28.40),
                      (38.44, 27.36)]), 30)
BT_NORTH = catmull(GP([(39.20, 30.75), (39.55, 30.25), (39.90, 29.62), (40.08, 29.24)]), 30)
BT_SOUTH = catmull(GP([(38.55, 30.34), (38.28, 29.72), (38.00, 28.78), (37.88, 28.08)]), 30)
BT_FRONTS = [
    (0.0, [(40.32, 29.80), (39.85, 30.33), (39.32, 30.40), (38.97, 30.30), (38.64, 30.25),
           (38.30, 29.95), (37.95, 29.58)]),
    (2.3, [(40.32, 29.80), (39.85, 30.33), (39.32, 30.40), (38.97, 30.30), (38.64, 30.25),
           (38.30, 29.95), (37.95, 29.58)]),
    (3.4, [(40.33, 28.75), (39.86, 28.85), (39.32, 28.55), (38.92, 28.15), (38.58, 27.95),
           (38.22, 27.85), (37.90, 27.70)]),
    (4.4, [(40.36, 28.10), (39.88, 27.95), (39.35, 27.60), (38.88, 27.25), (38.52, 27.06),
           (38.15, 27.10), (37.82, 27.20)]),
]
BT_PLACES = [
    # name, lat, lon, time, sub, side, dx, dy
    ("Kocatepe", 38.75, 30.54, 1.55, "26 Ağustos 1922", "r", 4, 6),
    ("Dumlupınar", 38.85, 30.0, 3.0, "30 Ağustos 1922", "t", 0, -6),
    ("İzmir", 38.42, 27.14, 4.6, "9 Eylül 1922", "b", 0, 0),
]
SAKARYA = (39.58, 32.15)


def cam_taarruz(t):
    return key_cam(BT_CAM, t, drift=0.006)


def front_at(t):
    ks = BT_FRONTS
    if t <= ks[0][0]:
        pts = ks[0][1]
    elif t >= ks[-1][0]:
        pts = ks[-1][1]
    else:
        i = max(j for j in range(len(ks) - 1) if ks[j][0] <= t)
        u = smooth((t - ks[i][0]) / (ks[i + 1][0] - ks[i][0]))
        pts = [(lerp(a[0], b[0], u), lerp(a[1], b[1], u)) for a, b in zip(ks[i][1], ks[i + 1][1])]
    return catmull(GP(pts), 10)


def draw_taarruz(cv, cam, t):
    land_label(cv, cam, 38.0, 31.6, "ANADOLU", 0.7, 28, 18)

    low, mid, top = Layer(), Layer(), Layer()
    fa = smooth((t - 0.6) / 0.6) * (1 - smooth((t - 4.4) / 0.5))
    fp = cam.xy(front_at(t))
    front_line(low, fp, fa, ALLY, teeth_side=-1.0, width=5.0)
    big_arrow(mid, cam, BT_NORTH, cumlen(BT_NORTH), ease_in_out((t - 2.55) / 2.0),
              w0=6, w1=19, head_w=42, head_l=34)
    big_arrow(mid, cam, BT_SOUTH, cumlen(BT_SOUTH), ease_in_out((t - 2.7) / 2.0),
              w0=6, w1=19, head_w=42, head_l=34)
    big_arrow(mid, cam, BT_MAIN, cumlen(BT_MAIN), ease_in_out((t - 2.15) / 2.45),
              w0=9, w1=30, head_w=64, head_l=50)
    sx, sy = cam.at(*SAKARYA)
    pin_drop(top, sx, sy, t - 0.25, 0.9)
    for nm, la, lo, t0, *_ in BT_PLACES:
        x, y = cam.at(la, lo)
        pin_dot(top, x, y, t - t0, 1.05)
    low.render(cv)
    mid.render(cv)
    top.render(cv)

    if fa > 0.01:
        q = fp[len(fp) // 2]
        city_label(cv, q[0], q[1], t - 0.9, "Yunan cephesi", None, "l", -4, 0,
                   fa * (1 - smooth((t - 2.6) / 0.5)), name_size=20, name_color=ALLY_LIGHT)
    age = t - 0.75
    card_a = 1 - smooth((t - 2.25) / 0.45)
    if age > 0 and card_a > 0.01:
        x0, y0 = sx - 20, sy - 34
        ld = Layer()
        ld.line([(x0, y0), (x0 - 46 * ease_out(age / 0.4), y0)], rgba(INK, 0.85 * card_a), 2.2)
        ld.circle(x0, y0, 3.2, fill=rgba(INK, 0.9 * card_a))
        ld.render(cv)
        if card_a > 0.999:
            draw_card(cv, x0 - 46, y0, age - 0.1, "Sakarya · 1921", None, 44, align="right")
        else:
            im, sp, cw, ch = card_img("Sakarya · 1921", None, 44, "serif-bold")
            comp_sub(cv, im, x0 - 46 - cw - sp, y0 - ch / 2 - sp, card_a)
    city_label(cv, sx, sy, t - 2.45, "Sakarya", "1921", "r", 2, -14)
    for nm, la, lo, t0, sub, side, dx, dy in BT_PLACES:
        x, y = cam.at(la, lo)
        city_label(cv, x, y, t - t0 - 0.08, nm, sub, side, dx, dy)
    title_block(cv, t, 0.15, "1921 – 1922", "Büyük Taarruz")
    caption(cv, t, 4.15, "“Ordular! İlk hedefiniz Akdeniz’dir. İleri!”", 1850, 150, size=44,
            sub="MUSTAFA KEMAL PAŞA · 1 EYLÜL 1922", align="right")


# ---------------------------------------------------------------------------
# scene registry & frame assembly
# ---------------------------------------------------------------------------

_SCENES = {
    "selanik": (SEL_DUR, cam_selanik, draw_selanik, {"grat": 2.0}),
    "canakkale": (CAN_DUR, cam_canakkale, draw_canakkale, {"grat": 0.25}),
    "milli_mucadele": (MM_DUR, cam_milli, draw_milli, {"grat": 2.0, "focus": "turkey"}),
    "buyuk_taarruz": (BT_DUR, cam_taarruz, draw_taarruz, {"grat": 1.0, "focus": "turkey"}),
}


@lru_cache(maxsize=2)
def _basemap(name):
    dur, cam_fn, _, style = _SCENES[name]
    return BaseMap(cam_fn, dur, style)


def render_scene(name, t):
    dur, cam_fn, draw_fn, _ = _SCENES[name]
    t = clamp(float(t), 0.0, dur)
    cam = cam_fn(t)
    img = _basemap(name).frame(cam)
    img = ImageChops.multiply(img, vignette())
    cv = img.convert("RGBA")
    draw_fn(cv, cam, t)
    return cv.convert("RGB")


def render_selanik(t):
    return render_scene("selanik", t)


def render_canakkale(t):
    return render_scene("canakkale", t)


def render_milli_mucadele(t):
    return render_scene("milli_mucadele", t)


def render_buyuk_taarruz(t):
    return render_scene("buyuk_taarruz", t)


MAP_SCENES = {
    "selanik": (SEL_DUR, render_selanik),
    "canakkale": (CAN_DUR, render_canakkale),
    "milli_mucadele": (MM_DUR, render_milli_mucadele),
    "buyuk_taarruz": (BT_DUR, render_buyuk_taarruz),
}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _frame_bytes(job):
    name, i = job
    return MAP_SCENES[name][1](i / FPS).tobytes()


def _preview(name, out_dir, jobs):
    from multiprocessing import Pool
    dur = MAP_SCENES[name][0]
    n = int(round(dur * FPS))
    path = os.path.join(out_dir, f"{name}.mp4")
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium",
           "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    t0 = time.time()
    with Pool(jobs) as pool:
        for fr in pool.imap(_frame_bytes, [(name, i) for i in range(n)], chunksize=4):
            proc.stdin.write(fr)
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("ffmpeg failed")
    print(f"{path}  ({n} frames, {time.time() - t0:.1f} s)")


def main():
    ap = argparse.ArgumentParser(description="Animated map scenes")
    ap.add_argument("--stills", action="store_true", help="write a few PNG stills per scene")
    ap.add_argument("--scene", help="limit --stills to one scene")
    ap.add_argument("--times", help="comma-separated times for --stills (seconds)")
    ap.add_argument("--preview", help="scene name (or 'all') to render as mp4")
    ap.add_argument("--bench", help="scene name to time on one core")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    if args.stills:
        names = [args.scene] if args.scene else list(MAP_SCENES)
        for name in names:
            dur, fn = MAP_SCENES[name]
            ts = ([float(x) for x in args.times.split(",")] if args.times else
                  [0.0, dur * 0.3, dur * 0.55, dur * 0.8, dur - 1.0 / FPS])
            for t in ts:
                p = os.path.join(args.out, f"{name}_{t:05.2f}.png")
                fn(t).save(p)
                print(p)
    if args.preview:
        names = list(MAP_SCENES) if args.preview == "all" else [args.preview]
        for name in names:
            _preview(name, args.out, args.jobs)
    if args.bench:
        dur, fn = MAP_SCENES[args.bench]
        t0 = time.time()
        fn(0.0)
        print(f"first frame (incl. base-map pre-render of needed levels): {time.time() - t0:.2f} s")
        n = int(round(dur * FPS))
        idx = list(range(0, n, 3))
        for i in idx:                       # warm all pyramid levels
            fn(i / FPS)
        t0 = time.time()
        for i in idx:
            fn(i / FPS)
        print(f"{args.bench}: {(time.time() - t0) / len(idx) * 1000:.0f} ms/frame (warm, {len(idx)} frames)")


if __name__ == "__main__":
    main()
