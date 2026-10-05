#!/usr/bin/env python3
"""Mustafa Kemal Atatürk'ün hayatını anlatan 1 dakikalık video üretici.

Görüntüler (tipografi + çizimler) ve müzik tamamen bu betikle üretilir;
dışarıdan fotoğraf, video ya da ses dosyası kullanılmaz.

Kullanım:
    python3 generate.py                    # ataturk-hayati.mp4 üretir
    python3 generate.py --stills 2,15,40   # verilen saniyelerden PNG kareler

Gereksinimler: Python 3, numpy, Pillow ve libx264/aac destekli ffmpeg.
"""

import argparse
import math
import os
import subprocess
import sys
import wave
from functools import lru_cache
from multiprocessing import Pool

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1920, 1080, 30
DURATION = 60.0
NFRAMES = int(DURATION * FPS)
HERE = os.path.dirname(os.path.abspath(__file__))

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
GOLD = (214, 178, 106)
CREAM = (244, 236, 222)
MUTED = (186, 172, 152)
WHITE = (255, 255, 255)
DARK = (28, 12, 14)

# (süre, sahne, zaman çizelgesindeki yıl)
SCENES = [
    (4.5, "title", None),
    (4.5, "birth", 1881),
    (4.5, "school", 1905),
    (5.0, "canakkale", 1915),
    (5.0, "samsun", 1919),
    (4.5, "meclis", 1920),
    (5.0, "zafer", 1922),
    (5.0, "cumhuriyet", 1923),
    (5.5, "devrimler", 1928),
    (4.5, "soyadi", 1934),
    (5.0, "veda", 1938),
    (7.0, "final", None),
]
STARTS = np.cumsum([0.0] + [s[0] for s in SCENES[:-1]]).tolist()
assert abs(STARTS[-1] + SCENES[-1][0] - DURATION) < 1e-9


# --------------------------------------------------------------------------
# Yardımcılar
# --------------------------------------------------------------------------

def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease_out(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def smooth(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def lerp(a, b, u):
    return a + (b - a) * u


@lru_cache(maxsize=None)
def font(face, size):
    return ImageFont.truetype(os.path.join(HERE, "fonts", FONTS[face]), size)


def comp(cv, layer, x, y):
    """Katmanı tuvale (taşan kısımları kırparak) alfa ile bindirir."""
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


def mul_alpha(layer, mask):
    """Katmanın alfa kanalını 0..1 aralığındaki numpy maskesiyle çarpar."""
    a = np.asarray(layer.getchannel("A"), dtype=np.float32) * mask
    layer.putalpha(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)))
    return layer


@lru_cache(maxsize=2048)
def text_img(text, face, size, color, tracking=0):
    f = font(face, size)
    asc, desc = f.getmetrics()
    if tracking:
        widths = [f.getlength(c) for c in text]
        tw = sum(widths) + tracking * (len(text) - 1)
    else:
        tw = f.getlength(text)
    pad = int(size * 0.3) + 6
    im = Image.new("RGBA", (int(tw) + 2 * pad, asc + desc + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if tracking:
        x = pad
        for c, w in zip(text, widths):
            d.text((x, pad), c, font=f, fill=color + (255,))
            x += w + tracking
    else:
        d.text((pad, pad), text, font=f, fill=color + (255,))
    shadow = Image.new("RGBA", im.size, (0, 0, 0, 0))
    blur = im.getchannel("A").filter(ImageFilter.GaussianBlur(size * 0.1 + 2))
    shadow.putalpha(blur.point(lambda v: int(v * 0.7)))
    return Image.alpha_composite(shadow, im), pad, tw


def draw_text(cv, text, face, size, color, x, y, alpha=1.0, align="left", tracking=0):
    """y, metnin üst (ascender) çizgisidir."""
    if alpha <= 0.004:
        return
    im, pad, tw = text_img(text, face, size, color, tracking)
    if align == "center":
        x -= tw / 2
    elif align == "right":
        x -= tw
    comp(cv, with_alpha(im, alpha), x - pad, y - pad)


def wrap(text, face, size, max_w):
    f = font(face, size)
    lines, cur = [], ""
    for word in text.split():
        cand = (cur + " " + word).strip()
        if cur and f.getlength(cand) > max_w:
            lines.append(cur)
            cur = word
        else:
            cur = cand
    if cur:
        lines.append(cur)
    return lines


@lru_cache(maxsize=64)
def rect_img(w, h, color):
    return Image.new("RGBA", (w, h), color + (255,))


class SS:
    """Kenar yumuşatma için büyütülmüş (süper örneklenmiş) çizim tuvali."""

    def __init__(self, w, h, s=3):
        self.w, self.h, self.s = w, h, s
        self.im = Image.new("RGBA", (w * s, h * s), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def p(self, pts):
        return [(x * self.s, y * self.s) for x, y in pts]

    def bb(self, x0, y0, x1, y1):
        s = self.s
        return [x0 * s, y0 * s, x1 * s, y1 * s]

    def line(self, pts, color, w=2):
        self.d.line(self.p(pts), fill=color, width=max(1, round(w * self.s)), joint="curve")

    def poly(self, pts, fill=None, outline=None, w=2):
        self.d.polygon(self.p(pts), fill=fill, outline=outline, width=max(1, round(w * self.s)))

    def rect(self, x0, y0, x1, y1, fill=None, outline=None, w=2):
        self.d.rectangle(self.bb(x0, y0, x1, y1), fill=fill, outline=outline,
                         width=max(1, round(w * self.s)))

    def circle(self, cx, cy, r, fill=None, outline=None, w=2):
        self.d.ellipse(self.bb(cx - r, cy - r, cx + r, cy + r), fill=fill, outline=outline,
                       width=max(1, round(w * self.s)))

    def chord(self, x0, y0, x1, y1, a0, a1, fill=None, outline=None, w=2):
        self.d.chord(self.bb(x0, y0, x1, y1), a0, a1, fill=fill, outline=outline,
                     width=max(1, round(w * self.s)))

    def glow(self, cx, cy, r, color, strength=0.55):
        g = glow_img(int(r * self.s), color, strength)
        comp(self.im, g, cx * self.s - g.width / 2, cy * self.s - g.height / 2)

    def done(self):
        return self.im.resize((self.w, self.h), Image.LANCZOS)


def star_pts(cx, cy, R, rot_deg=180.0):
    pts = []
    for k in range(10):
        r = R if k % 2 == 0 else R * 0.381966
        a = math.radians(rot_deg + k * 36)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def crescent_star(ss, ox, oy, G, fg, bg):
    """Türk bayrağı ölçülerinde ay-yıldız (ox, oy: bayrağın sol üst köşesi)."""
    ss.circle(ox + 0.5 * G, oy + 0.5 * G, 0.25 * G, fill=fg)
    ss.circle(ox + 0.5625 * G, oy + 0.5 * G, 0.2 * G, fill=bg)
    ss.poly(star_pts(ox + 0.8208 * G, oy + 0.5 * G, 0.125 * G), fill=fg, w=0)


@lru_cache(maxsize=8)
def glow_img(r, color, strength=0.55, spread=1.0):
    size = int(r * 2 + r * 3 * spread)
    im = Image.new("RGBA", (size, size), color + (0,))
    a = Image.new("L", (size, size), 0)
    ImageDraw.Draw(a).ellipse([size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r],
                              fill=int(255 * strength))
    im.putalpha(a.filter(ImageFilter.GaussianBlur(r * 0.45 * spread)))
    return im


@lru_cache(maxsize=8)
def edge_mask(w, h, side=120, bottom=90, top=0):
    x = np.arange(w, dtype=np.float32)
    y = np.arange(h, dtype=np.float32)
    mx = np.clip(np.minimum(x, w - 1 - x) / side, 0, 1) if side else np.ones(w)
    my = np.clip((h - 1 - y) / bottom, 0, 1) if bottom else np.ones(h)
    if top:
        my = my * np.clip(y / top, 0, 1)
    mx = mx * mx * (3 - 2 * mx)
    my = my * my * (3 - 2 * my)
    return (my[:, None] * mx[None, :]).astype(np.float32)


# --------------------------------------------------------------------------
# Arka plan, toz, vinyet
# --------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _radial():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    return np.sqrt(((xx - W * 0.5) / (W * 0.62)) ** 2 + ((yy - H * 0.45) / (H * 0.75)) ** 2)


@lru_cache(maxsize=2)
def background(kind):
    """Radyal degrade + yumuşak vinyet; bantlaşmayı önlemek için titreşimli (dither)."""
    d = _radial()
    u = (np.clip(d, 0, 1.4) / 1.4)[..., None]
    u = u * u * (3 - 2 * u)
    if kind == "warm":
        c0, c1 = np.array([66, 15, 20]), np.array([9, 6, 7])
    else:
        c0, c1 = np.array([36, 33, 33]), np.array([7, 7, 8])
    img = c0 * (1 - u) + c1 * u
    v = d[..., None]
    v = np.clip((v - 0.3) / 1.1, 0, 1)
    img *= 1 - 0.55 * v * v * (3 - 2 * v)
    noise = np.random.default_rng(3).normal(0, 1.6, (H, W, 1))
    img = np.clip(img + noise + 0.5, 0, 255).astype(np.uint8)
    return Image.fromarray(img, "RGB").convert("RGBA")


_rng = np.random.default_rng(7)
NP = 90
P_X = _rng.uniform(0, W, NP)
P_Y = _rng.uniform(0, H, NP)
P_V = _rng.uniform(6, 26, NP)
P_R = _rng.uniform(0.6, 1.6, NP)
P_A = _rng.uniform(35, 120, NP)
P_PH = _rng.uniform(0, 2 * math.pi, NP)


def dust(cv, t):
    layer = Image.new("RGBA", (W // 2, H // 2), GOLD + (0,))
    d = ImageDraw.Draw(layer)
    xs = (P_X + 18 * np.sin(0.35 * t + P_PH)) / 2
    ys = ((P_Y - P_V * t) % (H + 20) - 10) / 2
    al = P_A * (0.65 + 0.35 * np.sin(1.1 * t + P_PH * 3))
    for x, y, r, a in zip(xs, ys, P_R, al):
        d.ellipse([x - r, y - r, x + r, y + r], fill=GOLD + (int(a),))
    cv.alpha_composite(layer.resize((W, H), Image.BILINEAR))


# --------------------------------------------------------------------------
# Zaman çizelgesi (alt bant)
# --------------------------------------------------------------------------

TL_X0, TL_X1, TL_Y = 170, 1750, 1000
TL_YEARS = sorted({s[2] for s in SCENES if s[2]})


def year_x(y):
    return TL_X0 + (y - 1881) / (1938 - 1881) * (TL_X1 - TL_X0)


@lru_cache(maxsize=1)
def dot_img():
    ss = SS(40, 40, 4)
    ss.circle(20, 20, 13, fill=GOLD + (70,))
    ss.circle(20, 20, 9.5, fill=GOLD + (255,))
    ss.circle(20, 20, 7, fill=RED + (255,))
    return ss.done()


def timeline(cv, year, alpha):
    if alpha <= 0.004:
        return
    top = 930
    layer = Image.new("RGBA", (W, 120), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    y = TL_Y - top
    xd = year_x(year)
    d.line([(TL_X0, y), (TL_X1, y)], fill=GOLD + (70,), width=2)
    d.line([(TL_X0, y), (xd, y)], fill=GOLD + (210,), width=2)
    for yr in TL_YEARS:
        x = year_x(yr)
        d.line([(x, y - 6), (x, y + 6)], fill=GOLD + (200 if yr <= year + 0.01 else 90,), width=2)
    draw_text(layer, "1881", "sans-medium", 18, MUTED, TL_X0 - 14, y + 16,
              0.8 * clamp((xd - TL_X0 - 30) / 60), align="left")
    draw_text(layer, "1938", "sans-medium", 18, MUTED, TL_X1 + 14, y + 16,
              0.8 * clamp((TL_X1 - xd - 30) / 60), align="right")
    dot = dot_img()
    comp(layer, dot, xd - 20, y - 20)
    draw_text(layer, str(int(round(year))), "sans-semibold", 22, GOLD, xd, y - 50, 1.0,
              align="center", tracking=2)
    comp(cv, with_alpha(layer, alpha), 0, top)


# --------------------------------------------------------------------------
# Metin bloğu (sol taraf)
# --------------------------------------------------------------------------

TX = 170
TEXT_W = 800


def text_block(cv, t, A, label=None, year=None, head=(), body=(), center_y=500):
    """body: (metin, stil) listesi; stil 'sans' ya da 'quote'."""
    items = []  # (tür, içerik, yükseklik)
    items.append(("bar", None, 30))
    if label:
        items.append(("label", label, 50))
    if year:
        items.append(("year", year, 186))
    for h_line in head:
        items.append(("head", h_line, 74))
    if body:
        items.append(("gap", None, 22))
    for text, style in body:
        if style == "quote":
            for ln in wrap(text, "serif-italic", 40, TEXT_W):
                items.append(("quote", ln, 58))
        else:
            for ln in wrap(text, "sans-light", 33, TEXT_W):
                items.append(("body", ln, 50))
        items.append(("gap", None, 10))
    total = sum(i[2] for i in items)
    y = center_y - total / 2
    k = 0
    for kind, content, h in items:
        if kind == "gap":
            y += h
            continue
        start = 0.05 + 0.13 * k
        k += 1
        p = ease_out((t - start) / 0.8)
        a, dy = p * A, (1 - p) * 26
        if kind == "bar":
            bw = int(70 * ease_out((t - 0.05) / 0.9))
            if bw > 0:
                comp(cv, with_alpha(rect_img(bw, 5, RED), A), TX, y)
        elif kind == "label":
            draw_text(cv, content, "sans-medium", 26, GOLD, TX, y + dy, a, tracking=6)
        elif kind == "year":
            draw_text(cv, content, "serif-bold", 150, CREAM, TX - 8, y - 14 + dy, a)
        elif kind == "head":
            draw_text(cv, content, "serif-bold", 56, CREAM, TX, y + dy, a)
        elif kind == "quote":
            draw_text(cv, content, "serif-italic", 40, GOLD, TX, y + dy, a)
        elif kind == "body":
            draw_text(cv, content, "sans-light", 33, CREAM, TX, y + dy, a)
        y += h


IX, IY = 1370, 470


def reveal(img, p, mode):
    if mode == "fade" or p >= 0.999:
        return img
    w, h = img.size
    out = img.copy()
    if mode == "up":
        soft = h * 0.25
        e = h - p * (h + soft)
        col = np.clip((np.arange(h, dtype=np.float32) - e) / soft, 0, 1)
        return mul_alpha(out, np.repeat(col[:, None], w, axis=1))
    if mode == "radial":
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        r = np.sqrt((xx - w / 2) ** 2 + (yy - h / 2) ** 2)
        rmax = math.hypot(w, h) / 2
        soft = rmax * 0.25
        e = p * (rmax + soft)
        return mul_alpha(out, np.clip((e - r) / soft, 0, 1))
    if mode == "left":
        soft = w * 0.25
        e = p * (w + soft)
        row = np.clip((e - np.arange(w, dtype=np.float32)) / soft, 0, 1)
        return mul_alpha(out, np.repeat(row[None, :], h, axis=0))
    return img


def place_ill(cv, img, t, A, dur, start=0.25, length=1.4, mode="up", zoom=0.035,
              cx=IX, cy=IY):
    p = smooth((t - start) / length)
    if p <= 0 or A <= 0.004:
        return
    im = reveal(img, p, mode)
    s = 1 + zoom * (t / dur)
    if abs(s - 1) > 1e-3:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.BICUBIC)
    comp(cv, with_alpha(im, A * clamp(p * 1.6)), cx - im.width / 2, cy - im.height / 2)


# --------------------------------------------------------------------------
# Çizimler
# --------------------------------------------------------------------------

LINE = GOLD + (255,)
FILL = (96, 18, 24, 190)
FILL_DARK = (40, 12, 15, 235)
LIGHT = (255, 214, 140, 110)


@lru_cache(maxsize=1)
def ill_house():
    """Selanik'teki doğduğu ev (stilize)."""
    ss = SS(640, 600, 3)
    ss.line([(40, 540), (600, 540)], LINE, 3)
    ss.rect(150, 230, 490, 540, fill=FILL, outline=LINE, w=3)
    for y in (333, 436):
        ss.line([(150, y), (490, y)], LINE, 2)
    ss.rect(395, 110, 422, 175, fill=FILL_DARK, outline=LINE, w=2)
    ss.poly([(118, 232), (200, 150), (440, 150), (522, 232)], fill=FILL_DARK, outline=LINE, w=3)
    for row_y in (258, 360):
        for x in (178, 260, 344, 426):
            ss.rect(x, row_y, x + 38, row_y + 58, fill=LIGHT, outline=LINE, w=2)
            ss.line([(x + 19, row_y), (x + 19, row_y + 58)], LINE, 1.2)
            ss.line([(x, row_y + 26), (x + 38, row_y + 26)], LINE, 1.2)
    for x in (178, 426):
        ss.rect(x, 462, x + 38, 520, fill=LIGHT, outline=LINE, w=2)
        ss.line([(x + 19, 462), (x + 19, 520)], LINE, 1.2)
    ss.rect(294, 478, 346, 540, fill=FILL_DARK, outline=LINE, w=2)
    ss.chord(294, 452, 346, 504, 180, 360, fill=FILL_DARK, outline=LINE, w=2)
    # bahçe: iki selvi
    for x, hgt in ((88, 170), (555, 140)):
        ss.poly([(x, 540 - hgt), (x + 20, 540 - hgt * 0.45), (x + 14, 540), (x - 14, 540),
                 (x - 20, 540 - hgt * 0.45)], fill=FILL_DARK, outline=LINE, w=2)
    return ss.done()


def _sabre(s):
    sb = SS(540, 80, s)
    top, bot = [], []
    for k in range(41):
        u = k / 40
        x = 132 + 400 * u
        c = 40 - 26 * u * u
        hw = 7.5 * (1 - u ** 4) + 0.3
        top.append((x, c - hw))
        bot.append((x, c + hw))
    sb.poly(top + bot[::-1], fill=(236, 224, 196, 255), outline=LINE, w=1.5)
    sb.line([(138, 40), (510, 40 - 26 * ((510 - 132) / 400) ** 2)], (180, 160, 120, 255), 1)
    sb.rect(120, 18, 132, 62, fill=GOLD + (255,))
    sb.rect(44, 33, 120, 47, fill=(90, 20, 26, 255), outline=LINE, w=1.5)
    for gx in range(56, 118, 10):
        sb.line([(gx, 34), (gx + 5, 46)], LINE, 1)
    sb.circle(38, 40, 9, fill=GOLD + (255,))
    return sb.im


@lru_cache(maxsize=1)
def ill_sabres():
    """Askerî eğitim: çapraz kılıçlar ve madalyon."""
    s = 3
    ss = SS(640, 640, s)
    ss.circle(320, 320, 268, fill=(70, 14, 18, 120), outline=LINE, w=3)
    ss.circle(320, 320, 252, outline=GOLD + (150,), w=1.2)
    for k in range(48):
        a = math.radians(k * 7.5)
        r0, r1 = 256, 264
        ss.line([(320 + r0 * math.cos(a), 320 + r0 * math.sin(a)),
                 (320 + r1 * math.cos(a), 320 + r1 * math.sin(a))], GOLD + (180,), 1.2)
    blade = _sabre(s)
    for ang, flip in ((-42, False), (42, True)):
        b = blade.transpose(Image.FLIP_TOP_BOTTOM) if flip else blade
        if flip:
            b = b.transpose(Image.FLIP_LEFT_RIGHT)
            r = b.rotate(ang, resample=Image.BICUBIC, expand=True)
        else:
            r = b.rotate(ang, resample=Image.BICUBIC, expand=True)
        comp(ss.im, r, (640 * s - r.width) / 2, (640 * s - r.height) / 2 + 30 * s)
    G = 120
    crescent_star(ss, 320 - 0.598 * G, 128 - 0.5 * G, G, CREAM + (255,), (0, 0, 0, 0))
    # ay-yıldızın iç dairesini (saydam boyandı) madalyon zemini ile doldur
    ss.circle(320 - 0.598 * G + 0.5625 * G, 128, 0.2 * G - 0.5, fill=(70, 14, 18, 120))
    return ss.done()


def draw_waves(ss, t, yh, n=11, color=GOLD, base_alpha=60, only=None, x0=0, x1=None):
    x1 = ss.w if x1 is None else x1
    xs = np.arange(x0, x1 + 6, 6, dtype=np.float64)
    for i in range(n):
        y0 = yh + 12 + 15 * i + 1.7 * i * i
        if only and not only(y0):
            continue
        amp = 1.4 + 0.85 * i
        lam = 46 + 15 * i
        ph = t * (1.3 + 0.12 * i) + i * 1.7
        ys = (y0 + amp * np.sin(2 * np.pi * xs / lam + ph)
              + 0.5 * amp * np.sin(2 * np.pi * xs / (lam * 2.3) - 0.7 * ph))
        a = int(min(235, base_alpha + 17 * i))
        ss.line(list(zip(xs, ys)), color + (a,), 1.1 + 0.17 * i)


def panel_canakkale(t):
    w, h, yh = 700, 520, 250
    ss = SS(w, h, 2)
    ss.glow(350, yh, 150, (230, 90, 50), 0.6)
    ss.chord(350 - 105, yh - 105, 350 + 105, yh + 105, 180, 360, fill=(214, 72, 44, 255))
    ss.chord(350 - 80, yh - 80, 350 + 80, yh + 80, 180, 360, fill=(232, 112, 58, 255))
    ss.d.rectangle([0, yh * 2, w * 2, h * 2], fill=(0, 0, 0, 0))
    # yarımada silüetleri
    ss.poly([(430, yh + 1), (470, yh - 22), (520, yh - 34), (590, yh - 58), (650, yh - 52),
             (700, yh - 64), (700, yh + 1)], fill=FILL_DARK, outline=GOLD + (170,), w=1.6)
    ss.poly([(0, yh - 30), (60, yh - 24), (120, yh - 10), (175, yh + 1), (0, yh + 1)],
            fill=FILL_DARK, outline=GOLD + (170,), w=1.6)
    ss.line([(0, yh), (w, yh)], GOLD + (150,), 1.6)
    for k in range(9):
        y = yh + 12 + 14 * k
        half = (78 - 7 * k) * (0.8 + 0.2 * math.sin(t * 4 + k * 1.3))
        ss.line([(350 - half, y), (350 + half, y)], (236, 128, 64, max(30, 170 - 15 * k)), 3)
    draw_waves(ss, t, yh)
    im = ss.done()
    return mul_alpha(im, edge_mask(w, h, 110, 90))


@lru_cache(maxsize=1)
def ship_img():
    """Bandırma Vapuru (stilize), 2x ölçekte."""
    ss = SS(560, 300, 4)
    ss.line([(112, 30), (116, 236)], LINE, 3)
    ss.line([(466, 22), (462, 222)], LINE, 3)
    for a, b in (((112, 30), (24, 228)), ((466, 22), (540, 214)), ((112, 30), (262, 80)),
                 ((466, 22), (284, 80))):
        ss.line([a, b], GOLD + (150,), 1.1)
    ss.rect(112, 32, 146, 52, fill=RED + (255,))
    ss.poly([(244, 80), (286, 80), (283, 196), (247, 196)], fill=FILL_DARK, outline=LINE, w=2)
    ss.rect(246, 96, 284, 114, fill=RED + (255,))
    ss.rect(150, 192, 404, 232, fill=(110, 22, 28, 255), outline=LINE, w=2)
    ss.rect(330, 160, 402, 192, fill=(110, 22, 28, 255), outline=LINE, w=2)
    for x in range(168, 392, 26):
        ss.rect(x, 202, x + 12, 214, fill=LIGHT)
    ss.poly([(20, 232), (540, 216), (504, 286), (62, 286)], fill=(24, 10, 12, 255),
            outline=LINE, w=2.5)
    ss.line([(42, 252), (522, 238)], RED + (255,), 3)
    for x in range(92, 480, 40):
        ss.circle(x, 266, 4, fill=CREAM + (200,))
    im = ss.im.resize((560 * 2, 300 * 2), Image.LANCZOS)
    return im


def panel_samsun(t, dur):
    w, h, yh = 700, 520, 290
    ss = SS(w, h, 2)
    sx, sy = 120, yh
    ss.glow(sx, sy, 100, (240, 150, 70), 0.5)
    ss.chord(sx - 62, sy - 62, sx + 62, sy + 62, 180, 360, fill=(236, 140, 64, 255))
    ss.d.rectangle([0, yh * 2, w * 2, h * 2], fill=(0, 0, 0, 0))
    ss.line([(0, yh), (w, yh)], GOLD + (150,), 1.6)
    for k in range(7):
        y = yh + 12 + 13 * k
        half = (46 - 5 * k) * (0.8 + 0.2 * math.sin(t * 4 + k))
        ss.line([(sx - half, y), (sx + half, y)], (240, 160, 80, max(30, 150 - 16 * k)), 3)
    water = yh + 52
    draw_waves(ss, t, yh, only=lambda y0: y0 < water - 4)
    # gemi
    ship = ship_img()
    ang = 1.2 * math.sin(t * 1.6)
    bob = 3.5 * math.sin(t * 1.6 + 0.8)
    r = ship.rotate(ang, resample=Image.BICUBIC, expand=True)
    cx = lerp(380, 450, t / dur)
    # gemi görselinde su hattı y=270 (1x); merkez 150
    ox = (cx - 280) * 2 - (r.width - ship.width) / 2
    oy = (water - 270 + bob) * 2 - (r.height - ship.height) / 2
    comp(ss.im, r, ox, oy)
    # duman
    chim_x, chim_y = cx - 280 + 265, water - 270 + 80 + bob
    for k in range(7):
        age = (t * 0.55 + k / 7) % 1.0
        px = chim_x - 150 * age - 10 * math.sin(age * 5 + k)
        py = chim_y - 95 * age ** 0.8
        rad = 8 + 34 * age
        a = int(120 * (1 - age) * clamp(age * 6))
        ss.circle(px, py, rad, fill=(150, 138, 128, a))
    draw_waves(ss, t, yh, only=lambda y0: y0 >= water - 4)
    im = ss.done()
    return mul_alpha(im, edge_mask(w, h, 110, 80))


@lru_cache(maxsize=1)
def ill_meclis():
    """Birinci Meclis binası (stilize)."""
    ss = SS(680, 560, 3)
    ss.line([(20, 510), (660, 510)], LINE, 3)
    for i, (x0, x1) in enumerate(((282, 398), (292, 388), (302, 378))):
        y1 = 510 - i * 10
        ss.rect(x0, y1 - 10, x1, y1, fill=FILL_DARK, outline=LINE, w=1.5)
    ss.rect(70, 270, 610, 482, fill=FILL, outline=LINE, w=3)
    ss.poly([(58, 272), (96, 238), (584, 238), (622, 272)], fill=FILL_DARK, outline=LINE, w=3)
    ss.rect(254, 232, 426, 482, fill=(110, 22, 28, 220), outline=LINE, w=3)
    ss.poly([(242, 234), (340, 182), (438, 234)], fill=FILL_DARK, outline=LINE, w=3)
    ss.line([(70, 372), (610, 372)], LINE, 2)
    for x in (96, 146, 196, 446, 496, 546):
        ss.rect(x, 300, x + 32, 352, fill=LIGHT, outline=LINE, w=1.8)
        ss.chord(x, 284, x + 32, 316, 180, 360, fill=LIGHT, outline=LINE, w=1.8)
        ss.rect(x, 396, x + 32, 452, fill=LIGHT, outline=LINE, w=1.8)
    for x in (276, 370):
        ss.rect(x, 300, x + 34, 352, fill=LIGHT, outline=LINE, w=1.8)
        ss.chord(x, 283, x + 34, 317, 180, 360, fill=LIGHT, outline=LINE, w=1.8)
    ss.rect(312, 410, 368, 482, fill=FILL_DARK, outline=LINE, w=2)
    ss.chord(312, 382, 368, 438, 180, 360, fill=FILL_DARK, outline=LINE, w=2)
    ss.rect(318, 286, 362, 356, fill=LIGHT, outline=LINE, w=1.8)
    ss.chord(318, 264, 362, 308, 180, 360, fill=LIGHT, outline=LINE, w=1.8)
    ss.line([(340, 184), (340, 70)], LINE, 3)
    ss.circle(340, 66, 5, fill=GOLD + (255,))
    return ss.done()


@lru_cache(maxsize=4)
def flag_flat(G):
    s = 4
    ss = SS(int(G * 1.5), G, s)
    ss.rect(0, 0, G * 1.5, G, fill=RED + (255,))
    crescent_star(ss, 0, 0, G, WHITE + (255,), RED + (255,))
    return ss.done()


def wave_flag(flat, t, amp, lam, speed=5.0):
    arr = np.asarray(flat, dtype=np.float32)
    h, w = arr.shape[:2]
    src_arr = np.zeros((h + 2, w, 4), dtype=np.float32)
    src_arr[1:-1] = arr
    pad = int(amp * 1.3) + 2
    xs = np.arange(w, dtype=np.float32)
    k = xs / w
    phase = 2 * np.pi * xs / lam - speed * t
    reach = 0.12 + 0.88 * k
    dy = amp * np.sin(phase) * reach + 0.35 * amp * np.sin(1.7 * phase + 1.3) * reach
    shade = 1 + 0.2 * np.cos(phase) * reach
    Y = np.arange(h + 2 * pad, dtype=np.float32)[:, None]
    src = Y - pad - dy[None, :] + 1
    src = np.clip(src, 0, h + 1)
    y0 = np.floor(src).astype(np.int32)
    y1 = np.minimum(y0 + 1, h + 1)
    f = (src - y0)[..., None]
    xi = np.arange(w)[None, :]
    out = src_arr[y0, xi] * (1 - f) + src_arr[y1, xi] * f
    out[..., :3] *= shade[None, :, None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def panel_meclis(t):
    im = ill_meclis().copy()
    fl = wave_flag(flag_flat(52), t, 4, 60, 4.5)
    comp(im, fl, 342, 68 - (fl.height - 52) / 2)
    return im


def panel_zafer(t):
    w, h, yh = 760, 640, 400
    ss = SS(w, h, 2)
    rise = ease_out(t / 3.2)
    cx, cy = w / 2, yh + 60 - 120 * rise
    ss.glow(cx, cy, 170, (240, 120, 50), 0.55)
    for k in range(30):
        a = math.radians(k * 12 + t * 5)
        wdt = math.radians(1.6)
        r0, r1 = 128, (360 if k % 2 == 0 else 250)
        pts = [(cx + r0 * math.cos(a - wdt), cy + r0 * math.sin(a - wdt)),
               (cx + r1 * math.cos(a), cy + r1 * math.sin(a)),
               (cx + r0 * math.cos(a + wdt), cy + r0 * math.sin(a + wdt))]
        ss.poly(pts, fill=GOLD + (70,), w=0)
    for i, (r, c) in enumerate(((108, (214, 60, 36)), (96, (226, 88, 44)), (82, (236, 118, 54)),
                                (66, (244, 150, 70)), (48, (250, 186, 100)))):
        ss.circle(cx, cy, r, fill=c + (255,))
    ss.d.rectangle([0, yh * 2, w * 2, h * 2], fill=(0, 0, 0, 0))
    ss.poly([(-2, yh - 40), (90, yh - 62), (170, yh - 30), (230, yh - 12), (260, yh + 1),
             (-2, yh + 1)], fill=FILL_DARK, outline=GOLD + (170,), w=1.6)
    ss.poly([(500, yh + 1), (560, yh - 26), (640, yh - 48), (690, yh - 40), (w + 2, yh - 58),
             (w + 2, yh + 1)], fill=FILL_DARK, outline=GOLD + (170,), w=1.6)
    ss.line([(0, yh), (w, yh)], GOLD + (160,), 1.6)
    for k in range(12):
        y = yh + 10 + 13 * k
        half = (120 - 9 * k) * (0.82 + 0.18 * math.sin(t * 3.4 + k * 1.1)) * (0.3 + 0.7 * rise)
        ss.line([(cx - half, y), (cx + half, y)], (240, 140, 64, max(25, 190 - 14 * k)), 3)
    draw_waves(ss, t, yh, n=9, base_alpha=40)
    im = ss.done()
    return mul_alpha(im, edge_mask(w, h, 140, 70, 120))


@lru_cache(maxsize=4)
def emblem_img(D, ring=True):
    s = 4
    pad = 24
    size = D + 2 * pad
    ss = SS(size, size, s)
    c = size / 2
    if ring:
        ss.circle(c, c, D / 2 + 12, outline=GOLD + (230,), w=2)
    ss.circle(c, c, D / 2, fill=RED + (255,))
    G = 0.66 * D / 0.696
    crescent_star(ss, c - 0.598 * G, c - 0.5 * G, G, WHITE + (255,), RED + (255,))
    return ss.done()


@lru_cache(maxsize=1)
def rays_img():
    ss = SS(760, 760, 2)
    c = 380
    for k in range(36):
        a = math.radians(k * 10)
        wdt = math.radians(1.3)
        r0, r1 = 240, (375 if k % 2 == 0 else 320)
        ss.poly([(c + r0 * math.cos(a - wdt), c + r0 * math.sin(a - wdt)),
                 (c + r1 * math.cos(a), c + r1 * math.sin(a)),
                 (c + r0 * math.cos(a + wdt), c + r0 * math.sin(a + wdt))], fill=GOLD + (90,), w=0)
    return ss.done()


_srng = np.random.default_rng(11)
SPARK_A = _srng.uniform(0, 2 * math.pi, 60)
SPARK_D = _srng.uniform(0, 0.9, 60)
SPARK_V = _srng.uniform(0.6, 1.0, 60)


def panel_cumhuriyet(t):
    w = h = 760
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    rays = rays_img().rotate(t * 6, resample=Image.BICUBIC)
    comp(im, with_alpha(rays, smooth((t - 0.5) / 1.2)), 0, 0)
    g = glow_img(230, RED, 0.6)
    comp(im, g, (w - g.width) / 2, (h - g.height) / 2)
    ss = SS(w, h, 2)
    for a0, d0, v in zip(SPARK_A, SPARK_D, SPARK_V):
        u = (t - 0.7 - d0) / 1.8
        if 0 < u < 1:
            r = 220 + 170 * v * ease_out(u)
            x, y = w / 2 + r * math.cos(a0), h / 2 + r * math.sin(a0)
            ss.circle(x, y, 2.6 * (1 - u) + 0.8, fill=(255, 220, 150, int(230 * (1 - u))))
    comp(im, ss.done(), 0, 0)
    em = emblem_img(420)
    s = 0.86 + 0.14 * ease_out(t / 1.4)
    em = em.resize((round(em.width * s), round(em.height * s)), Image.BICUBIC)
    comp(im, em, (w - em.width) / 2, (h - em.height) / 2)
    return im


TR_LETTERS = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ"


def alphabet(cv, t, A):
    cols, cw, ch = 6, 94, 102
    x0, y0 = 1390 - cols * cw / 2, 205
    special = set("ÇĞİÖŞÜ")
    for k, letter in enumerate(TR_LETTERS):
        p = ease_out((t - 0.7 - 0.065 * k) / 0.5)
        if p <= 0:
            continue
        r, c = divmod(k, cols)
        col = GOLD if letter in special else CREAM
        draw_text(cv, letter, "serif", 70, col, x0 + c * cw + cw / 2,
                  y0 + r * ch + (1 - p) * 14, p * A, align="center")
    p = ease_out((t - 2.6) / 0.8)
    draw_text(cv, "1 KASIM 1928 · YENİ TÜRK ALFABESİ", "sans-medium", 20, GOLD, 1390,
              y0 + 5 * ch + 34, p * A, align="center", tracking=4)


def panel_clock(t):
    w = h = 620
    ss = SS(w, h, 2)
    c, R = w / 2, 268
    ss.circle(c, c, R, fill=(22, 20, 20, 225), outline=GOLD + (230,), w=4)
    ss.circle(c, c, R - 14, outline=GOLD + (120,), w=1.2)
    for k in range(60):
        a = math.radians(k * 6 - 90)
        major = k % 5 == 0
        r0, r1 = (R - 50, R - 24) if major else (R - 36, R - 24)
        ss.line([(c + r0 * math.cos(a), c + r0 * math.sin(a)),
                 (c + r1 * math.cos(a), c + r1 * math.sin(a))],
                GOLD + (230 if major else 140,), 4 if major else 1.5)
    f = font("serif", 34 * ss.s)
    for txt, k in (("XII", 0), ("III", 3), ("VI", 6), ("IX", 9)):
        a = math.radians(k * 30 - 90)
        r = R - 86
        ss.d.text(((c + r * math.cos(a)) * ss.s, (c + r * math.sin(a)) * ss.s), txt, font=f,
                  fill=CREAM + (220,), anchor="mm")
    # 08.57'den 09.05'e ilerleyip durur
    m = lerp(8 * 60 + 57, 9 * 60 + 5, smooth((t - 0.4) / 2.2))
    ha = math.radians((m / 60 % 12) * 30 - 90)
    ma = math.radians((m % 60) * 6 - 90)
    ss.line([(c - 22 * math.cos(ha), c - 22 * math.sin(ha)),
             (c + 130 * math.cos(ha), c + 130 * math.sin(ha))], CREAM + (255,), 10)
    ss.line([(c - 28 * math.cos(ma), c - 28 * math.sin(ma)),
             (c + 200 * math.cos(ma), c + 200 * math.sin(ma))], CREAM + (255,), 6)
    ss.circle(c, c, 12, fill=RED + (255,), outline=GOLD + (255,), w=2)
    return ss.done()


# --------------------------------------------------------------------------
# Sahneler
# --------------------------------------------------------------------------

def el(t, start, A, d=0.9, rise=24):
    p = ease_out((t - start) / d)
    return p * A, (1 - p) * rise


def scene_title(cv, t, A, dur):
    cx = W / 2
    a, dy = el(t, 0.15, A, 1.3)
    em = emblem_img(118)
    comp(cv, with_alpha(em, a), cx - em.width / 2, 188 + dy)
    a, dy = el(t, 0.45, A)
    draw_text(cv, "1881 — 1938", "sans-medium", 28, GOLD, cx, 365 + dy, a, "center", 12)
    a, dy = el(t, 0.65, A, 1.1)
    draw_text(cv, "Mustafa Kemal", "serif-bold", 124, CREAM, cx, 405 + dy, a, "center")
    a, dy = el(t, 0.9, A, 1.1)
    draw_text(cv, "ATATÜRK", "sans-semibold", 78, GOLD, cx, 585 + dy, a, "center", 34)
    lw = int(420 * ease_out((t - 1.2) / 1.1))
    if lw > 2:
        comp(cv, with_alpha(rect_img(lw, 2, GOLD), A * 0.8), cx - lw / 2, 712)
    a, dy = el(t, 1.4, A)
    draw_text(cv, "Bir ömür, bir millet, bir cumhuriyet", "serif-italic", 40, MUTED, cx,
              742 + dy, a, "center")


def scene_birth(cv, t, A, dur):
    place_ill(cv, ill_house(), t, A, dur, mode="up")
    text_block(cv, t, A, "SELANİK", "1881", ["Selanik’te Doğdu"], [
        ("Annesi Zübeyde Hanım, babası Ali Rıza Efendi’dir.", "sans"),
        ("Askerî rüştiyede matematik öğretmeni ona “Kemal” adını verdi.", "sans"),
    ])


def scene_school(cv, t, A, dur):
    place_ill(cv, ill_sabres(), t, A, dur, mode="radial")
    text_block(cv, t, A, "MANASTIR · İSTANBUL", "1905", ["Kurmay Yüzbaşı"], [
        ("Manastır Askerî İdadisi ve Harp Okulu’nun ardından Harp Akademisi’ni "
         "kurmay yüzbaşı olarak bitirdi.", "sans"),
    ])


def scene_canakkale(cv, t, A, dur):
    place_ill(cv, panel_canakkale(t), t, A, dur, mode="fade", length=1.2)
    text_block(cv, t, A, "ÇANAKKALE CEPHESİ", "1915", ["Çanakkale Geçilmez"], [
        ("“Ben size taarruzu emretmiyorum, ölmeyi emrediyorum!”", "quote"),
        ("Anafartalar’da cephenin kaderini değiştirdi.", "sans"),
    ])


def scene_samsun(cv, t, A, dur):
    place_ill(cv, panel_samsun(t, dur), t, A, dur, mode="left", length=1.4)
    text_block(cv, t, A, "19 MAYIS 1919 · SAMSUN", "1919", ["Millî Mücadele Başlıyor"], [
        ("Bandırma Vapuru ile Samsun’a çıktı.", "sans"),
        ("Amasya, Erzurum ve Sivas’ta millet tek yürek oldu.", "sans"),
    ])


def scene_meclis(cv, t, A, dur):
    place_ill(cv, panel_meclis(t), t, A, dur, mode="up")
    text_block(cv, t, A, "23 NİSAN 1920 · ANKARA", "1920", ["Büyük Millet Meclisi"], [
        ("“Egemenlik kayıtsız şartsız milletindir.”", "quote"),
        ("Meclisin ilk başkanı seçildi.", "sans"),
    ])


def scene_zafer(cv, t, A, dur):
    place_ill(cv, panel_zafer(t), t, A, dur, mode="fade", length=1.0)
    text_block(cv, t, A, "SAKARYA · BÜYÜK TAARRUZ", "1922", ["Büyük Zafer"], [
        ("Sakarya zaferiyle “Gazi” unvanını aldı.", "sans"),
        ("“Ordular! İlk hedefiniz Akdeniz’dir. İleri!”", "quote"),
    ])


def scene_cumhuriyet(cv, t, A, dur):
    place_ill(cv, panel_cumhuriyet(t), t, A, dur, mode="fade", length=0.9, zoom=0.0)
    text_block(cv, t, A, "29 EKİM 1923 · ANKARA", "1923", ["Cumhuriyet İlan Edildi"], [
        ("Lozan’da bağımsızlık tescillendi; Mustafa Kemal, Türkiye Cumhuriyeti’nin "
         "ilk Cumhurbaşkanı oldu.", "sans"),
    ])


REFORMS = [
    ("1924", "Öğretim birliği (Tevhid-i Tedrisat)"),
    ("1926", "Türk Medeni Kanunu"),
    ("1928", "Harf Devrimi: yeni Türk alfabesi"),
    ("1934", "Kadınlara seçme ve seçilme hakkı"),
]


def scene_devrimler(cv, t, A, dur):
    alphabet(cv, t, A)
    y = 250
    bw = int(70 * ease_out((t - 0.05) / 0.9))
    if bw > 0:
        comp(cv, with_alpha(rect_img(bw, 5, RED), A), TX, y)
    a, dy = el(t, 0.15, A)
    draw_text(cv, "1924 — 1934 · DEVRİMLER", "sans-medium", 26, GOLD, TX, y + 30 + dy, a,
              tracking=6)
    a, dy = el(t, 0.3, A)
    draw_text(cv, "Çağdaşlaşma", "serif-bold", 76, CREAM, TX, y + 80 + dy, a)
    draw_text(cv, "Yolunda", "serif-bold", 76, CREAM, TX, y + 170 + dy, a)
    for k, (yr, txt) in enumerate(REFORMS):
        a, dy = el(t, 0.8 + 0.3 * k, A, 0.7, 18)
        yy = y + 300 + 72 * k + dy
        draw_text(cv, yr, "serif-bold", 38, GOLD, TX, yy - 4, a)
        draw_text(cv, txt, "sans", 30, CREAM, TX + 120, yy + 4, a)


def scene_soyadi(cv, t, A, dur):
    cx = W / 2
    a, dy = el(t, 0.1, A)
    draw_text(cv, "1934 · SOYADI KANUNU", "sans-medium", 28, GOLD, cx, 270 + dy, a, "center", 8)
    word, size, tr = "ATATÜRK", 190, 26
    f = font("serif-bold", size)
    widths = [f.getlength(c) for c in word]
    x = cx - (sum(widths) + tr * (len(word) - 1)) / 2
    for k, (c, wd) in enumerate(zip(word, widths)):
        a, dy = el(t, 0.35 + 0.12 * k, A, 0.7, 46)
        draw_text(cv, c, "serif-bold", size, GOLD, x, 335 - dy, a)
        x += wd + tr
    lw = int(640 * ease_out((t - 1.3) / 1.0))
    if lw > 2:
        comp(cv, with_alpha(rect_img(lw, 2, GOLD), A * 0.8), cx - lw / 2, 618)
    a, dy = el(t, 1.5, A)
    draw_text(cv, "TBMM, 24 Kasım 1934’te Mustafa Kemal’e", "sans-light", 36, CREAM, cx,
              650 + dy, a, "center")
    a, dy = el(t, 1.65, A)
    draw_text(cv, "“Atatürk” soyadını verdi.", "sans-light", 36, CREAM, cx, 702 + dy, a,
              "center")


def scene_veda(cv, t, A, dur):
    place_ill(cv, panel_clock(t), t, A, dur, mode="fade", length=1.0, zoom=0.02)
    text_block(cv, t, A, "10 KASIM 1938 · SAAT 09.05", "1938", ["Ebediyete İntikal"], [
        ("Dolmabahçe Sarayı’nda hayata gözlerini yumdu.", "sans"),
        ("Fikirleri ve eserleriyle yaşamaya devam ediyor.", "sans"),
    ])


QUOTE = ["“Benim naçiz vücudum elbet bir gün",
         "toprak olacaktır, ancak Türkiye Cumhuriyeti",
         "ilelebet payidar kalacaktır.”"]


def scene_final(cv, t, A, dur):
    cx = W / 2
    out = 1 - smooth((t - 3.3) / 0.5)
    for k, line in enumerate(QUOTE):
        a, dy = el(t, 0.2 + 0.18 * k, A * out, 1.0)
        draw_text(cv, line, "serif-italic", 56, CREAM, cx, 340 + 80 * k + dy, a, "center")
    a, dy = el(t, 1.1, A * out)
    draw_text(cv, "— MUSTAFA KEMAL ATATÜRK", "sans-medium", 26, GOLD, cx, 620 + dy, a,
              "center", 6)
    p = smooth((t - 3.6) / 0.9)
    if p > 0:
        fl = wave_flag(flag_flat(440), t, 16, 330, 4.2)
        fx, fy = cx - fl.width / 2 + 14, 430 - fl.height / 2
        pole = rect_img(10, 640, (200, 190, 175))
        comp(cv, with_alpha(pole, p * A), fx - 12, fy - 10)
        comp(cv, with_alpha(dot_img(), p * A), fx - 27, fy - 32)
        comp(cv, with_alpha(fl, p * A), fx, fy)
        a, dy = el(t, 4.1, A)
        draw_text(cv, "Saygı, minnet ve özlemle…", "serif-italic", 44, CREAM, cx, 790 + dy, a,
                  "center")


SCENE_FUNCS = {
    "title": scene_title, "birth": scene_birth, "school": scene_school,
    "canakkale": scene_canakkale, "samsun": scene_samsun, "meclis": scene_meclis,
    "zafer": scene_zafer, "cumhuriyet": scene_cumhuriyet, "devrimler": scene_devrimler,
    "soyadi": scene_soyadi, "veda": scene_veda, "final": scene_final,
}


def scene_at(t):
    for i in range(len(SCENES) - 1, -1, -1):
        if t >= STARTS[i]:
            return i
    return 0


def render(t):
    i = scene_at(t)
    dur, name, _ = SCENES[i]
    lt = t - STARTS[i]
    fade_out = 1.0 if name == "final" else smooth((dur - lt) / 0.45)
    A = smooth(lt / 0.45) * fade_out

    gray = smooth((t - 47.6) / 0.8) * (1 - smooth((t - 52.6) / 0.8))
    bg = background("warm")
    if gray > 0.001:
        bg = Image.blend(bg, background("gray"), gray)
    cv = bg.copy()
    dust(cv, t)
    SCENE_FUNCS[name](cv, lt, A, dur)

    if 0 < i < len(SCENES) - 1:
        cur = SCENES[i][2]
        prev = SCENES[i - 1][2] or cur
        year = lerp(prev, cur, smooth(lt / 1.1))
        tl_a = smooth((t - 4.2) / 0.8) * (1 - smooth((t - 52.4) / 0.6))
        timeline(cv, year, tl_a)

    out = cv.convert("RGB")
    black = max(1 - smooth(t / 0.8), smooth((t - (DURATION - 0.8)) / 0.8))
    if black > 0.001:
        # karartmada titreşimi (dither) yeniden ekle; yoksa koyu degradeler bantlaşır
        a = np.asarray(out, dtype=np.float32) * (1 - black) + fade_noise()
        out = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGB")
    return out


@lru_cache(maxsize=1)
def fade_noise():
    return np.random.default_rng(4).normal(0.5, 1.2, (H, W, 1)).astype(np.float32)


def render_frame(i):
    return render(i / FPS).tobytes()


# --------------------------------------------------------------------------
# Müzik (re minör, sahnelerle eşzamanlı akorlar)
# --------------------------------------------------------------------------

SR = 44100
PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "Bb": 10}
CHORDS = {"Dm": ("D", 3), "Bb": ("Bb", 4), "F": ("F", 4), "C": ("C", 4), "Gm": ("G", 3),
          "A": ("A", 4), "D": ("D", 4)}
CHORD_PLAN = [("Dm", "Dm"), ("Bb", "F"), ("C", "Dm"), ("Bb", "Gm"), ("F", "C"), ("Dm", "Bb"),
              ("F", "C"), ("Bb", "C"), ("F", "Bb"), ("C", "A"), ("Dm", "Dm")]
MELODY = [(18.5, 1.25, 72), (19.75, 1.25, 69), (21.0, 2.5, 67),
          (23.5, 1.1, 65), (24.6, 1.15, 69), (25.75, 2.25, 74),
          (28.0, 2.5, 72), (30.5, 2.5, 76), (33.0, 2.5, 77), (35.5, 2.5, 76),
          (38.0, 2.75, 72), (40.75, 2.75, 74), (43.5, 2.25, 76), (45.75, 2.25, 73),
          (53.0, 2.5, 74), (55.5, 2.0, 76), (57.5, 3.0, 78)]


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def chord_list():
    out = []
    for i, (a, b) in enumerate(CHORD_PLAN):
        s, d = STARTS[i], SCENES[i][0]
        out += [(s, s + d / 2, a), (s + d / 2, s + d, b)]
    out += [(53.0, 55.5, "Bb"), (55.5, 57.5, "C"), (57.5, 61.5, "D")]
    merged = []
    for c in out:
        if merged and merged[-1][2] == c[2]:
            merged[-1] = (merged[-1][0], c[1], c[2])
        else:
            merged.append(c)
    return merged


def chord_at(chords, t):
    for s, e, n in chords:
        if s <= t < e:
            return n
    return chords[-1][2]


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
    e = np.clip(t / max(attack, 1e-4), 0, 1)
    e = np.sin(e * np.pi / 2) ** 2
    rel = np.clip((t - release_start) / release, 0, 1)
    return e * np.cos(rel * np.pi / 2) ** 2


def music(path):
    rng = np.random.default_rng(5)
    n = int(SR * (DURATION + 3))
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

    chords = chord_list()
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

    # piyano arpejleri
    def piano(f, vel, dur=2.4):
        t = np.arange(int(dur * SR)) / SR
        sig = sum((1 / h ** 1.5) * np.sin(2 * np.pi * f * h * (1 + 0.0004 * h * h) * t)
                  * np.exp(-t * (1.2 + 0.8 * h)) for h in range(1, 7))
        return sig * np.clip(t / 0.004, 0, 1) * np.exp(-t * 0.9) * vel

    pattern = [0, 1, 2, 3, 4, 3, 2, 1]
    t0, k = 4.6, 0
    while t0 < 47.8:
        step = 0.375 if t0 < 28 else 0.25
        _, _, arp = voicing(chord_at(chords, t0))
        idx = pattern[k % len(pattern)]
        vel = (0.6 + 0.3 * (k % 4 == 0)) * clamp((t0 - 4.5) / 2.5, 0.25, 1)
        add("piano", piano(hz(arp[idx]), vel), t0, -0.35 + 0.14 * idx)
        t0 += step
        k += 1

    # ana ezgi
    for s, d, m in MELODY:
        nn = int((d + 0.8) * SR)
        t = np.arange(nn) / SR
        f = hz(m) * (1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.35) / 0.4, 0, 1))
        ph = 2 * np.pi * np.cumsum(f) / SR
        sig = sum(a * np.sin(h * ph) for h, a in
                  enumerate([1.0, 0.45, 0.28, 0.16, 0.09, 0.05], start=1))
        add("lead", sig * env_adsr(nn, 0.28, d, 0.7), s, 0.1)

    # timpani
    def timp(amp, f0=73.42):
        nn = int(2.2 * SR)
        t = np.arange(nn) / SR
        f = f0 * (1 + 0.08 * np.exp(-t * 9))
        ph = 2 * np.pi * np.cumsum(f) / SR
        sig = sum(a * np.sin(r * ph) * np.exp(-t * dcy) for r, a, dcy in
                  ((1, 1.0, 2.2), (1.5, 0.45, 3.5), (1.98, 0.3, 4.5), (2.44, 0.18, 6)))
        noise = rng.normal(0, 1, nn)
        noise = np.convolve(noise, np.ones(30) / 30, mode="same") * np.exp(-t * 35) * 2.5
        return (sig + noise) * amp

    for s, a in ((0.5, 0.5), (13.5, 0.8), (18.5, 0.6), (28.0, 0.9), (30.5, 0.55), (33.0, 1.0),
                 (38.0, 0.6), (43.5, 0.5), (57.5, 1.0)):
        add("perc", timp(a), s)
    tr = 55.5
    while tr < 57.45:
        add("perc", timp(0.06 + 0.3 * ((tr - 55.5) / 2.0) ** 2), tr, rng.uniform(-0.2, 0.2))
        tr += 0.075

    # 1938: saat tıkırtısı ve çanlar
    tk = 48.4
    while tk < 50.6:
        nn = int(0.04 * SR)
        click = np.diff(rng.normal(0, 1, nn + 1)) * np.exp(-np.arange(nn) / SR * 260)
        add("perc", click * 0.1, tk, 0.25)
        tk += 0.2
    nn = int(0.08 * SR)
    add("perc", np.diff(rng.normal(0, 1, nn + 1)) * np.exp(-np.arange(nn) / SR * 90) * 0.25,
        50.62, 0.2)
    for s, m in ((48.3, 74), (49.55, 69), (50.8, 65), (52.05, 62)):
        nn = int(4.0 * SR)
        t = np.arange(nn) / SR
        f = hz(m)
        sig = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * dcy) for r, a, dcy in
                  ((1, 1.0, 0.9), (2.0, 0.45, 1.5), (2.76, 0.35, 2.2), (5.4, 0.15, 3.6)))
        add("bell", sig * np.clip(t / 0.003, 0, 1), s, rng.uniform(-0.3, 0.3))

    # seviye otomasyonu
    def auto(points):
        xs, ys = zip(*points)
        return np.interp(tt, xs, ys)

    stems["pad"] *= auto([(0, 0), (1.5, 0.55), (4.5, 0.6), (13.5, 0.7), (18.5, 0.75),
                          (28, 0.95), (38, 0.9), (47.6, 0.85), (48.6, 0.42), (52.8, 0.42),
                          (53.6, 0.7), (57.5, 1.0), (61, 0.9)])
    stems["bass"] *= auto([(0, 0), (2, 0.6), (13.5, 0.8), (28, 1.0), (47.6, 1.0), (48.6, 0.5),
                           (53, 0.6), (57.5, 1.0)])
    gains = {"pad": 0.24, "bass": 0.09, "piano": 0.19, "lead": 0.12, "perc": 0.35, "bell": 0.16}
    for k_, g in gains.items():
        peak = np.abs(stems[k_]).max()
        stems[k_] *= g / max(peak, 1e-9)
    for k_ in gains:
        act = np.abs(stems[k_]).max(axis=0) > 1e-4
        rms = np.sqrt((stems[k_][:, act] ** 2).mean()) if act.any() else 0
        print(f"  {k_:6s} rms={rms:.4f}")
    dry = sum(stems.values())

    # basit konvolüsyon yankısı
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
    # 40 Hz altını yumuşakça kes (frekans uzayında yüksek geçiren süzgeç)
    freqs = np.fft.rfftfreq(size, 1 / SR)
    hp = 1 / np.sqrt(1 + (40.0 / np.maximum(freqs, 1e-3)) ** 4)
    for ch in range(2):
        mix[ch] = np.fft.irfft(np.fft.rfft(mix[ch], size) * hp, size)[:n]
    mix = mix[:, : int(SR * DURATION)]
    t = np.arange(mix.shape[1]) / SR
    mix *= np.clip(t / 0.3, 0, 1) * np.clip((DURATION - t) / 1.6, 0, 1) ** 1.5
    mix /= np.abs(mix).max()
    mix = np.tanh(1.3 * mix) / np.tanh(1.3) * 0.89
    pcm = (mix.T * 32767).astype(np.int16)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())


# --------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=os.path.join(HERE, "ataturk-hayati.mp4"))
    ap.add_argument("--stills", help="virgülle ayrılmış saniyeler (örn. 2,15.5,40)")
    ap.add_argument("--stills-dir", default="stills")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    ap.add_argument("--crf", type=int, default=18)
    args = ap.parse_args()

    if args.stills:
        os.makedirs(args.stills_dir, exist_ok=True)
        for s in args.stills.split(","):
            p = os.path.join(args.stills_dir, f"kare_{float(s):05.2f}.png")
            render(float(s)).save(p)
            print(p)
        return

    wav = os.path.splitext(args.out)[0] + ".wav"
    print("Müzik üretiliyor…")
    music(wav)
    print("Kareler işleniyor…")
    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", wav,
           "-c:v", "libx264", "-preset", "slow", "-crf", str(args.crf), "-tune", "grain",
           "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest",
           "-metadata", "title=Mustafa Kemal Atatürk (1881-1938)", args.out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with Pool(args.jobs) as pool:
        for k, frame in enumerate(pool.imap(render_frame, range(NFRAMES), chunksize=4)):
            proc.stdin.write(frame)
            if k % 150 == 0:
                print(f"  {k / FPS:5.1f} sn / {DURATION:.0f} sn", flush=True)
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("ffmpeg başarısız oldu")
    os.remove(wav)
    print("Hazır:", args.out)


if __name__ == "__main__":
    main()
