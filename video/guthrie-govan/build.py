#!/usr/bin/env python3
"""Guthrie Govan belgeseli (~5 dk, 1920x1080, 30 fps) — birleştirici.

Girdiler:
    storyboard.json          bölümler, çekimler, kinetik yazılar (bu klasörde)
    narration/seg_<id>.wav   bölüm başına Türkçe anlatım
    narration/subs.json      (isteğe bağlı) cümle zamanlamaları
    music/bed.wav            müzik yatağı; music/sfx/ geçiş efektleri
    media/                   fotoğraflar, kapaklar, ekipman görselleri

Kullanım:
    python3 build.py                     # guthrie-govan.mp4
    python3 build.py --stills 3,40,120   # önizleme kareleri
    python3 build.py --range 0-30        # sessiz kısa önizleme
"""

import argparse
import json
import math
import multiprocessing
import os
import subprocess
import sys
import wave
from functools import lru_cache

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import colorfx as cf  # noqa: E402

W, H, FPS = 1920, 1080, 30
SR = 44100
XF = 0.35                 # çekimler arası çapraz geçiş
LEAD = 0.35               # bölüm başında anlatımdan önceki boşluk
TAIL = 0.45               # anlatımdan sonra
ACCENT = (255, 122, 26)   # turuncu vurgu
ACCENT2 = (64, 200, 255)  # camgöbeği
WHITE = (245, 245, 242)
MUTED = (190, 192, 198)

FONTS = {
    "bebas": "BebasNeue-Regular.ttf",
    "oswald": "Oswald-Bold.ttf",
    "oswald-m": "Oswald-Medium.ttf",
    "mont-xb": "Montserrat-ExtraBold.ttf",
    "mont-sb": "Montserrat-SemiBold.ttf",
    "mont-m": "Montserrat-Medium.ttf",
    "mont-i": "Montserrat-Italic.ttf",
}


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def smooth(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def ease_out(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def ease_back(x, k=1.7):
    x = clamp(x)
    return 1 + (k + 1) * (x - 1) ** 3 + k * (x - 1) ** 2


@lru_cache(maxsize=None)
def font(face, size):
    return ImageFont.truetype(os.path.join(HERE, "fonts", FONTS[face]), size)


# --------------------------------------------------------------------------
# Metin ve katman yardımcıları
# --------------------------------------------------------------------------

@lru_cache(maxsize=4096)
def text_img(text, face, size, color, tracking=0, shadow=0.75, stroke=0):
    f = font(face, size)
    asc, desc = f.getmetrics()
    if tracking:
        ws = [f.getlength(c) for c in text]
        tw = sum(ws) + tracking * (len(text) - 1)
    else:
        tw = f.getlength(text)
    pad = int(size * 0.35) + 8
    im = Image.new("RGBA", (int(tw) + 2 * pad, asc + desc + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if tracking:
        x = pad
        for c, w in zip(text, ws):
            d.text((x, pad), c, font=f, fill=color + (255,), stroke_width=stroke,
                   stroke_fill=(0, 0, 0, 255))
            x += w + tracking
    else:
        d.text((pad, pad), text, font=f, fill=color + (255,), stroke_width=stroke,
               stroke_fill=(0, 0, 0, 255))
    if shadow:
        a = im.getchannel("A").filter(ImageFilter.GaussianBlur(size * 0.09 + 3))
        sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
        sh.putalpha(a.point(lambda v: int(v * shadow)))
        im = Image.alpha_composite(sh, im)
    return im, pad, tw, asc


def comp(cv, layer, x, y):
    x, y = int(round(x)), int(round(y))
    sx, sy = max(0, -x), max(0, -y)
    dx, dy = max(0, x), max(0, y)
    w = min(layer.width - sx, cv.width - dx)
    h = min(layer.height - sy, cv.height - dy)
    if w > 0 and h > 0:
        cv.alpha_composite(layer, (dx, dy), (sx, sy, sx + w, sy + h))


def fade(layer, a):
    if a >= 0.999:
        return layer
    out = layer.copy()
    out.putalpha(layer.getchannel("A").point(lambda v: int(v * a + 0.5)))
    return out


def draw_text(cv, text, face, size, color, x, y, alpha=1.0, align="left", tracking=0,
              scale=1.0, shadow=0.75):
    if alpha <= 0.004 or not text:
        return 0
    im, pad, tw, _ = text_img(text, face, size, color, tracking, shadow)
    if abs(scale - 1) > 0.002:
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))),
                       Image.BICUBIC)
        pad, tw = pad * scale, tw * scale
    if align == "center":
        x -= tw / 2
    elif align == "right":
        x -= tw
    comp(cv, fade(im, alpha), x - pad, y - pad)
    return tw


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
def rect(w, h, color, a=255):
    return Image.new("RGBA", (max(1, w), max(1, h)), color + (a,))


@lru_cache(maxsize=8)
def grad(w, h, direction, strength=210):
    """direction: 'up' (alt koyu), 'left' (sol koyu), 'radial'."""
    if direction == "up":
        a = np.linspace(0, 1, h, dtype=np.float32)[:, None] ** 1.6 * np.ones((1, w), np.float32)
    elif direction == "down":
        a = np.linspace(1, 0, h, dtype=np.float32)[:, None] ** 1.6 * np.ones((1, w), np.float32)
    elif direction == "left":
        v = np.linspace(0, 1, h, dtype=np.float32)
        v = np.clip(np.minimum(v, 1 - v) / 0.3, 0, 1)
        v = v * v * (3 - 2 * v)
        a = np.linspace(1, 0, w, dtype=np.float32)[None, :] ** 1.3 * v[:, None]
    else:
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        d = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
        a = np.clip(1 - d, 0, 1) ** 1.2
    im = Image.new("RGBA", (w, h), (6, 6, 9, 0))
    im.putalpha(Image.fromarray((a * strength).astype(np.uint8)))
    return im


# --------------------------------------------------------------------------
# Görsel yükleme
# --------------------------------------------------------------------------

def mpath(rel):
    return os.path.join(HERE, rel)


@lru_cache(maxsize=32)
def load_rgba(rel, max_side=1600):
    im = Image.open(mpath(rel))
    im = im.convert("RGBA")
    if max(im.size) > max_side:
        k = max_side / max(im.size)
        im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
    return im


@lru_cache(maxsize=16)
def cutout_white(rel, max_side=1400):
    """Beyaz/açık zeminli ürün fotoğrafını saydam yap (ekipman kartları için)."""
    im = load_rgba(rel, max_side)
    a = np.asarray(im).astype(np.float32)
    if (a[..., 3] < 250).mean() > 0.02:
        return im
    rgb = a[..., :3]
    dist = np.sqrt(((255 - rgb) ** 2).sum(-1))
    mask = (dist > 28).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    if n > 1:
        keep = 1 + np.argsort(stats[1:, cv2.CC_STAT_AREA])[::-1][:3]
        mask = np.isin(lab, keep).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    alpha = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 1.2)
    a[..., 3] = np.clip(alpha * 255, 0, 255)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


@lru_cache(maxsize=16)
def blurred_bg(rel, dim=0.38):
    im = load_rgba(rel, 900).convert("RGB")
    s = max(W / im.width, H / im.height) * 1.12
    im = im.resize((int(im.width * s), int(im.height * s)), Image.BILINEAR)
    im = im.filter(ImageFilter.GaussianBlur(28))
    arr = np.asarray(im).astype(np.float32) * dim
    return arr


def bg_frame(rel, t, dur, dim=0.38):
    arr = blurred_bg(rel, dim)
    h, w = arr.shape[:2]
    u = smooth(t / max(dur, 1e-3))
    k = max(W / w, H / h) * (1.0 + 0.06 * u)
    M = np.float32([[k, 0, W / 2 - k * w / 2], [0, k, H / 2 - k * h / 2]])
    out = cv2.warpAffine(arr, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).convert("RGBA")


@lru_cache(maxsize=1)
def dark_bg():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - W * 0.5) / W) ** 2 + ((yy - H * 0.45) / H) ** 2)
    c0, c1 = np.array([34, 30, 38]), np.array([8, 8, 11])
    u = np.clip(d / 0.75, 0, 1)[..., None]
    arr = c0 * (1 - u) + c1 * u + np.random.default_rng(2).normal(0, 1.4, (H, W, 1))
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).convert("RGBA")


def shadowed(im, blur=22, off=(14, 22), strength=0.7):
    pad = blur * 3
    out = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
    sh = Image.new("RGBA", out.size, (0, 0, 0, 0))
    a = Image.new("L", out.size, 0)
    a.paste(im.getchannel("A"), (pad + off[0], pad + off[1]))
    sh.putalpha(a.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(v * strength)))
    out.alpha_composite(sh)
    out.alpha_composite(im, (pad, pad))
    return out, pad


def perspective(im, ang):
    """Y ekseni etrafında hafif 3B dönüş (ang: -1..1)."""
    w, h = im.size
    k = 0.10 * ang
    # hedef köşe noktaları (sol üst, sağ üst, sağ alt, sol alt)
    dst = [(0, h * max(0, -k)), (w, h * max(0, k)), (w, h * (1 - max(0, k))),
           (0, h * (1 - max(0, -k)))]
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    M = cv2.getPerspectiveTransform(np.float32(dst), np.float32(src))
    coeffs = M.flatten()[:8]
    return im.transform((w, h), Image.PERSPECTIVE, coeffs, Image.BICUBIC)


# --------------------------------------------------------------------------
# Çekim türleri  (her biri: (shot, t, dur) -> RGBA PIL 1920x1080)
# --------------------------------------------------------------------------

@lru_cache(maxsize=64)
def color_shot(rel, dur, mode, start, end, box):
    return cf.ColorShot(mpath(rel), dur, mode=mode, start=start, end=end, box=box)


def shot_photo(s, t, dur):
    mode = s.get("mode", "kenburns")
    box = tuple(s["box"]) if s.get("box") else None
    st = tuple(s.get("start", (0.5, 0.45, 1.0)))
    en = tuple(s.get("end", (0.5, 0.42, 1.1)))
    cs = color_shot(s["file"], round(dur + XF, 2), mode, st, en, box)
    try:
        arr = cs.render(min(t, cs.duration))
    except Exception as e:  # maske bulunamazsa Ken Burns'e düş
        print("uyarı:", s["file"], e, file=sys.stderr)
        cs = color_shot(s["file"], round(dur + XF, 2), "kenburns", st, en, None)
        arr = cs.render(min(t, cs.duration))
    img = Image.fromarray(arr).convert("RGBA")
    if s.get("caption"):
        caption(img, s["caption"], t)
    return img


def caption(cv, text, t):
    """Sağ altta küçük künye (ör. 'The Aristocrats, 2015')."""
    a = smooth((t - 0.4) / 0.5)
    tw = font("mont-m", 24).getlength(text)
    comp(cv, fade(rect(int(tw) + 40, 46, (10, 10, 14), 150), a), W - tw - 100, 60)
    comp(cv, fade(rect(4, 46, ACCENT), a), W - tw - 100, 60)
    draw_text(cv, text, "mont-m", 24, WHITE, W - 80, 70, a, "right", shadow=0)


def shot_cover(s, t, dur):
    """Albüm vitrini: bulanık kapak zemini, 3B dönen kapak, başlık ve yıl."""
    cv = bg_frame(s["file"], t, dur, 0.33)
    comp(cv, grad(W, H, "radial", 120), 0, 0)
    cov = load_rgba(s["file"], 1000)
    side = 640
    cov = cov.resize((side, int(side * cov.height / cov.width)), Image.LANCZOS)
    p = ease_out(t / 0.9)
    ang = (1 - p) * 0.9 - 0.25 + 0.12 * math.sin(t * 0.6)
    im = perspective(cov, ang)
    im, pad = shadowed(im, 26, (18, 26), 0.75)
    x = 250 + (1 - p) * -380
    y = (H - cov.height) / 2 + 10
    comp(cv, fade(im, p), x - pad, y - pad)
    tx = 1000
    a1 = smooth((t - 0.35) / 0.5)
    a2 = smooth((t - 0.55) / 0.5)
    a3 = smooth((t - 0.8) / 0.5)
    if s.get("kicker"):
        draw_text(cv, s["kicker"], "mont-sb", 28, ACCENT, tx, 330 + (1 - a1) * 20, a1, tracking=6)
    lines = wrap(s.get("title", ""), "bebas", 130, 820)
    y0 = 380
    for k, ln in enumerate(lines):
        draw_text(cv, ln, "bebas", 130, WHITE, tx, y0 + 118 * k + (1 - a2) * 24, a2)
    y1 = y0 + 118 * len(lines) + 30
    if s.get("sub"):
        draw_text(cv, s["sub"], "oswald-m", 44, MUTED, tx, y1 + (1 - a3) * 20, a3)
    for k, ln in enumerate(s.get("notes", [])):
        a = smooth((t - 1.1 - 0.25 * k) / 0.5)
        draw_text(cv, "•  " + ln, "mont-m", 30, WHITE, tx, y1 + 80 + 50 * k + (1 - a) * 16, a)
    return cv


def shot_gear(s, t, dur):
    """Ekipman: koyu zemin, spot ışık, yavaşça dönen ürün görseli ve etiketler."""
    cv = dark_bg().copy()
    spot = grad(1300, 1300, "radial", 90)
    comp(cv, spot, 560 - 650, H / 2 - 650)
    g = cutout_white(s["file"])
    hmax = s.get("height", 900)
    k = min(hmax / g.height, 900 / g.width)
    g = g.resize((int(g.width * k), int(g.height * k)), Image.LANCZOS)
    rot = s.get("rot", -8) + 3 * math.sin(t * 0.7)
    gi = g.rotate(rot, resample=Image.BICUBIC, expand=True)
    p = ease_out(t / 1.0)
    gi, pad = shadowed(gi, 30, (20, 34), 0.8)
    comp(cv, fade(gi, p), 560 - gi.width / 2 + (1 - p) * -120, H / 2 - gi.height / 2)
    tx = 1080
    a = smooth((t - 0.4) / 0.5)
    if s.get("kicker"):
        draw_text(cv, s["kicker"], "mont-sb", 28, ACCENT, tx, 300, a, tracking=6)
    for k, ln in enumerate(wrap(s.get("title", ""), "bebas", 120, 780)):
        draw_text(cv, ln, "bebas", 120, WHITE, tx, 350 + 110 * k + (1 - a) * 20, a)
    for k, ln in enumerate(s.get("notes", [])):
        b = smooth((t - 0.9 - 0.3 * k) / 0.5)
        y = 600 + 62 * k
        comp(cv, fade(rect(10, 10, ACCENT), b), tx, y + 16)
        draw_text(cv, ln, "mont-m", 32, WHITE, tx + 30, y + (1 - b) * 14, b)
    return cv


def shot_quote(s, t, dur):
    """Alıntı kartı: bulanık fotoğraf zemini, büyük italik alıntı, kişi adı."""
    cv = bg_frame(s["bg"], t, dur, 0.30) if s.get("bg") else dark_bg().copy()
    comp(cv, grad(W, H, "radial", 110), 0, 0)
    q = s["text"]
    lines = wrap(q, "mont-i", 54, 1400)
    total = len(lines)
    y0 = H / 2 - total * 74 / 2 - 40
    draw_text(cv, "“", "bebas", 260, ACCENT, 230, y0 - 150, smooth(t / 0.4))
    chars = sum(len(l) for l in lines)
    shown = int(chars * clamp((t - 0.3) / max(0.9, min(2.2, dur * 0.45))))
    for k, ln in enumerate(lines):
        vis = ln[:max(0, shown)]
        shown -= len(ln)
        draw_text(cv, vis, "mont-i", 54, WHITE, 330, y0 + 74 * k, 1.0)
    a = smooth((t - 0.6 - min(2.2, dur * 0.45)) / 0.5)
    if s.get("who"):
        comp(cv, fade(rect(60, 4, ACCENT), a), 330, y0 + 74 * total + 40)
        draw_text(cv, s["who"], "mont-sb", 32, MUTED, 410, y0 + 74 * total + 22, a, tracking=3)
    if s.get("orig"):
        draw_text(cv, s["orig"], "mont-m", 26, MUTED, 330, y0 + 74 * total + 80, a * 0.8)
    return cv


def shot_title(s, t, dur):
    """Açılış/kapanış başlığı: büyük isim, alt başlık, arkada fotoğraf."""
    if s.get("bg"):
        base = Image.fromarray(color_shot(s["bg"], round(dur + XF, 2), "kenburns",
                                          tuple(s.get("start", (0.5, 0.45, 1.05))),
                                          tuple(s.get("end", (0.5, 0.42, 1.16))), None)
                               .render(t)).convert("RGBA")
    else:
        base = dark_bg().copy()
    comp(base, fade(grad(W, H, "radial", 255), 0.75), 0, 0)
    comp(base, grad(W, 600, "up", 230), 0, H - 600)
    p = ease_back((t - 0.2) / 0.8)
    a = smooth((t - 0.2) / 0.4)
    size = s.get("size", 210)
    draw_text(base, s["title"], "bebas", size, WHITE, W / 2, s.get("y", 600), a, "center",
              tracking=8, scale=0.9 + 0.1 * p)
    lw = int(560 * ease_out((t - 0.6) / 0.7))
    if lw > 2:
        comp(base, rect(lw, 6, ACCENT), W / 2 - lw / 2, s.get("y", 600) + size * 0.98)
    b = smooth((t - 0.9) / 0.5)
    if s.get("sub"):
        draw_text(base, s["sub"], "oswald-m", 48, MUTED, W / 2, s.get("y", 600) + size + 30,
                  b, "center", tracking=4)
    return base


def shot_stat(s, t, dur):
    """Büyük sayı/kelime kartı (ör. '3 YAŞ', '1993')."""
    cv = bg_frame(s["bg"], t, dur, 0.28) if s.get("bg") else dark_bg().copy()
    comp(cv, grad(W, H, "radial", 120), 0, 0)
    p = ease_back((t - 0.1) / 0.6)
    a = smooth((t - 0.1) / 0.3)
    draw_text(cv, s["big"], "bebas", s.get("size", 330), ACCENT, W / 2, 250, a, "center",
              scale=0.85 + 0.15 * p)
    b = smooth((t - 0.5) / 0.5)
    for k, ln in enumerate(wrap(s.get("label", ""), "oswald-m", 64, 1500)):
        draw_text(cv, ln, "oswald-m", 64, WHITE, W / 2, 660 + 80 * k + (1 - b) * 20, b, "center")
    return cv


def shot_timeline(s, t, dur):
    """Yatay zaman çizelgesi: yıllar sırayla belirir."""
    cv = bg_frame(s["bg"], t, dur, 0.25) if s.get("bg") else dark_bg().copy()
    items = s["items"]
    x0, x1, y = 330, W - 330, 560
    p = ease_out(t / 1.2)
    comp(cv, rect(int((x1 - x0) * p), 4, MUTED), x0, y)
    n = len(items)
    for k, (yr, label) in enumerate(items):
        x = x0 + (x1 - x0) * (k / max(1, n - 1))
        a = smooth((t - 0.3 - k * (min(2.5, dur * 0.6) / n)) / 0.4)
        comp(cv, fade(rect(18, 18, ACCENT), a), x - 9, y - 7)
        up = k % 2 == 0
        lab = wrap(label, "mont-m", 30, 340)
        if up:
            ly = y - 40 - 38 * len(lab)
            draw_text(cv, yr, "bebas", 76, ACCENT, x, ly - 92, a, "center")
        else:
            ly = y + 125
            draw_text(cv, yr, "bebas", 76, WHITE, x, y + 36, a, "center")
        for j, ln in enumerate(lab):
            draw_text(cv, ln, "mont-m", 30, WHITE, x, ly + 38 * j, a, "center")
    if s.get("heading"):
        draw_text(cv, s["heading"], "bebas", 90, WHITE, W / 2, 150, smooth(t / 0.5), "center",
                  tracking=4)
    return cv


def _bubble(text, right, max_w=760):
    f = font("mont-m", 36)
    lines = wrap(text, "mont-m", 36, max_w)
    w = int(max(f.getlength(l) for l in lines)) + 64
    h = 48 * len(lines) + 40
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    col = (0, 132, 255) if right else (52, 54, 62)
    ImageDraw.Draw(im).rounded_rectangle([0, 0, w - 1, h - 1], 30, fill=col + (255,))
    for k, ln in enumerate(lines):
        ImageDraw.Draw(im).text((32, 18 + 48 * k), ln, font=f, fill=(255, 255, 255, 255))
    return im


def shot_chat(s, t, dur):
    """Mesajlaşma: baloncuklar sırayla belirir (gerçek bir uygulama arayüzü değil)."""
    cv = bg_frame(s["bg"], t, dur, 0.22) if s.get("bg") else dark_bg().copy()
    comp(cv, grad(W, H, "radial", 120), 0, 0)
    msgs = s["messages"]          # [[who, text, right(bool), (isteğe bağlı) zaman], ...]
    n = len(msgs)
    step = max(1.4, (dur - 1.0) / n)
    y = 120
    for k, m in enumerate(msgs):
        who, text, right = m[:3]
        t0 = m[3] if len(m) > 3 else 0.3 + k * step
        if t < t0 - 0.9:
            break
        b = _bubble(text, right)
        if t < t0:  # "yazıyor…" noktaları
            dots = Image.new("RGBA", (150, 70), (0, 0, 0, 0))
            dd = ImageDraw.Draw(dots)
            dd.rounded_rectangle([0, 0, 149, 69], 30, fill=(52, 54, 62, 255) if not right
                                 else (0, 132, 255, 255))
            for j in range(3):
                ph = 0.5 + 0.5 * math.sin(t * 9 - j * 0.9)
                dd.ellipse([30 + j * 34, 26, 48 + j * 34, 44], fill=(255, 255, 255, int(110 + 140 * ph)))
            x = W - 260 - 150 if right else 260
            comp(cv, dots, x, y + 34)
            break
        p = ease_back((t - t0) / 0.35)
        a = smooth((t - t0) / 0.2)
        x = W - 260 - b.width if right else 260
        draw_text(cv, who, "mont-sb", 24, MUTED, x + (b.width if right else 0), y, a,
                  "right" if right else "left")
        bs = b.resize((max(1, int(b.width * (0.9 + 0.1 * p))), max(1, int(b.height * (0.9 + 0.1 * p)))),
                      Image.BICUBIC)
        comp(cv, fade(bs, a), x + (b.width - bs.width if right else 0), y + 36)
        y += b.height + 64
    return cv


def shot_stamp(s, t, dur):
    """Başlık kartı + üzerine çarpan kırmızı damga (ör. REDDEDİLDİ)."""
    cv = bg_frame(s["bg"], t, dur, 0.26) if s.get("bg") else dark_bg().copy()
    comp(cv, grad(W, H, "radial", 120), 0, 0)
    a = smooth((t - 0.1) / 0.4)
    if s.get("kicker"):
        draw_text(cv, s["kicker"], "mont-sb", 30, ACCENT, W / 2, 300, a, "center", tracking=6)
    for k, ln in enumerate(wrap(s["title"], "bebas", 140, 1500)):
        draw_text(cv, ln, "bebas", 140, WHITE, W / 2, 350 + 125 * k, a, "center", tracking=3)
    t0 = s.get("stamp_at", 1.3)
    if t >= t0:
        u = clamp((t - t0) / 0.22)
        sc = 2.2 - 1.2 * ease_out(u)
        st_txt = s.get("stamp", "REDDEDİLDİ")
        f = font("bebas", 170)
        tw = int(f.getlength(st_txt)) + 90
        im = Image.new("RGBA", (tw, 230), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle([6, 6, tw - 7, 223], 18, outline=(225, 30, 40, 255), width=12)
        d.text((45, 18), st_txt, font=f, fill=(225, 30, 40, 255))
        im = im.rotate(-12, resample=Image.BICUBIC, expand=True)
        im = im.resize((int(im.width * sc), int(im.height * sc)), Image.BICUBIC)
        comp(cv, fade(im, 0.92 * smooth(u * 3)), W / 2 - im.width / 2, 560 - im.height / 2)
        if u < 1:
            comp(cv, fade(rect(W, H, (255, 255, 255)), 0.12 * (1 - u)), 0, 0)
    return cv


def shot_grid(s, t, dur):
    """Albüm kapakları ızgarası: kapaklar sırayla 'pop' ederek gelir."""
    cv = dark_bg().copy()
    files = s["files"]
    n = len(files)
    cols = min(n, s.get("cols", 5))
    rows = math.ceil(n / cols)
    side = min(320, int((W - 260) / cols) - 40)
    gx = (W - cols * (side + 40) + 40) / 2
    gy = (H - rows * (side + 70) + 40) / 2 + 40
    if s.get("heading"):
        draw_text(cv, s["heading"], "bebas", 96, WHITE, W / 2, gy - 150, smooth(t / 0.4), "center",
                  tracking=4)
    for k, (f_, label) in enumerate(files):
        t0 = 0.25 + k * min(0.35, (dur * 0.5) / n)
        p = ease_back((t - t0) / 0.45)
        a = smooth((t - t0) / 0.2)
        if a <= 0:
            continue
        r, c = divmod(k, cols)
        im = load_rgba(f_, 700).resize((side, side), Image.LANCZOS)
        sc = 0.75 + 0.25 * p
        im2 = im.resize((max(1, int(side * sc)), max(1, int(side * sc))), Image.BICUBIC)
        sh, pad = shadowed(im2, 16, (8, 14), 0.7)
        x = gx + c * (side + 40) + (side - im2.width) / 2
        y = gy + r * (side + 70) + (side - im2.height) / 2
        comp(cv, fade(sh, a), x - pad, y - pad)
        draw_text(cv, label, "mont-sb", 24, MUTED, gx + c * (side + 40) + side / 2,
                  gy + r * (side + 70) + side + 14, a, "center")
    return cv


def shot_list(s, t, dur):
    """Başlık + maddeler sırayla gelir (teknikler vb.), sağda fotoğraf."""
    if s.get("bg"):
        base = Image.fromarray(color_shot(s["bg"], round(dur + XF, 2), "kenburns",
                                          tuple(s.get("start", (0.6, 0.45, 1.05))),
                                          tuple(s.get("end", (0.62, 0.42, 1.14))), None)
                               .render(t)).convert("RGBA")
    else:
        base = dark_bg().copy()
    comp(base, grad(1250, H, "left", 235), 0, 0)
    a = smooth(t / 0.4)
    draw_text(base, s.get("kicker", ""), "mont-sb", 28, ACCENT, 120, 190, a, tracking=6)
    for k, ln in enumerate(wrap(s.get("title", ""), "bebas", 110, 900)):
        draw_text(base, ln, "bebas", 110, WHITE, 120, 235 + 100 * k, a, tracking=2)
    items = s["items"]
    step = min(0.7, (dur - 1.2) / max(1, len(items)))
    y0 = 235 + 100 * len(wrap(s.get("title", ""), "bebas", 110, 900)) + 40
    for k, it in enumerate(items):
        b = smooth((t - 0.6 - k * step) / 0.3)
        p = ease_out((t - 0.6 - k * step) / 0.4)
        x = 120 - (1 - p) * 60
        comp(base, fade(rect(12, 12, ACCENT), b), x, y0 + 74 * k + 22)
        draw_text(base, it, "oswald-m", 50, WHITE, x + 34, y0 + 74 * k, b)
    return base


def shot_endcard(s, t, dur):
    """Kapanış: 'Şimdi dinle' kartı, kapak ve oynat düğmesi."""
    cv = bg_frame(s["file"], t, dur, 0.3)
    comp(cv, grad(W, H, "radial", 110), 0, 0)
    cov = load_rgba(s["file"], 900).resize((560, 560), Image.LANCZOS)
    p = ease_out(t / 0.8)
    sh, pad = shadowed(cov, 26, (16, 24), 0.8)
    comp(cv, fade(sh, p), 300 - pad, (H - 560) / 2 - pad)
    # oynat düğmesi
    pb = Image.new("RGBA", (180, 180), (0, 0, 0, 0))
    d = ImageDraw.Draw(pb)
    pulse = 1 + 0.05 * math.sin(t * 5)
    d.ellipse([0, 0, 179, 179], fill=(235, 30, 40, 235))
    d.polygon([(68, 48), (68, 132), (136, 90)], fill=(255, 255, 255, 255))
    pb = pb.resize((int(180 * pulse), int(180 * pulse)), Image.BICUBIC)
    comp(cv, fade(pb, smooth((t - 0.6) / 0.4)), 580 - pb.width / 2, H / 2 - pb.height / 2)
    a = smooth((t - 0.4) / 0.5)
    draw_text(cv, s.get("kicker", "ŞİMDİ DİNLE"), "mont-sb", 32, ACCENT, 1000, 360, a, tracking=8)
    for k, ln in enumerate(wrap(s.get("title", ""), "bebas", 150, 820)):
        draw_text(cv, ln, "bebas", 150, WHITE, 1000, 410 + 135 * k, a)
    if s.get("sub"):
        draw_text(cv, s["sub"], "oswald-m", 44, MUTED, 1000, 580, smooth((t - 0.8) / 0.5))
    return cv


SHOT_FUNCS = {"photo": shot_photo, "cover": shot_cover, "gear": shot_gear, "quote": shot_quote,
              "title": shot_title, "stat": shot_stat, "timeline": shot_timeline,
              "chat": shot_chat, "stamp": shot_stamp, "grid": shot_grid, "list": shot_list,
              "endcard": shot_endcard}


# --------------------------------------------------------------------------
# Üst katmanlar: bölüm başlığı, kinetik yazı, alt yazı
# --------------------------------------------------------------------------

def chapter_overlay(cv, num, title, t, pos="bottom"):
    if t < 0 or t > 3.4:
        return
    a = smooth(t / 0.35) * (1 - smooth((t - 2.9) / 0.5))
    y0 = H - 430 if pos == "bottom" else 70
    comp(cv, fade(grad(1200, 420, "left", 200), a), 0, y0 - 90)
    p = ease_out(t / 0.6)
    x = 110 - (1 - p) * 60
    draw_text(cv, f"BÖLÜM {num:02d}", "mont-sb", 30, ACCENT, x, y0, a, tracking=8)
    lw = int(90 * p)
    comp(cv, fade(rect(max(1, lw), 6, ACCENT), a), x, y0 + 45)
    for k, ln in enumerate(wrap(title.upper(), "bebas", 112, 1100)):
        draw_text(cv, ln, "bebas", 112, WHITE, x, y0 + 70 + 100 * k, a, tracking=3)


def kinetic_overlay(cv, text, t, dur=1.6, pos="center"):
    if t < 0 or t > dur:
        return
    a = smooth(t / 0.18) * (1 - smooth((t - dur + 0.3) / 0.3))
    p = ease_back(t / 0.45)
    size = 150 if len(text) < 14 else 110 if len(text) < 22 else 84
    y = 380 if pos == "center" else 120
    comp(cv, fade(grad(1500, 520, "radial", 170), a), W / 2 - 750, y - 130)
    draw_text(cv, text.upper(), "bebas", size, WHITE, W / 2, y, a, "center", tracking=4,
              scale=0.86 + 0.14 * p)
    lw = int(220 * ease_out((t - 0.15) / 0.4))
    if lw > 2:
        comp(cv, fade(rect(lw, 6, ACCENT), a), W / 2 - lw / 2, y + size * 0.95)


def subtitle_overlay(cv, text, t, t_end):
    a = smooth(t / 0.15) * (1 - smooth((t - t_end) / 0.2))
    if a <= 0.01:
        return
    lines = wrap(text, "mont-sb", 40, 1560)[:2]
    f = font("mont-sb", 40)
    wmax = max(f.getlength(l) for l in lines)
    n = len(lines)
    y0 = H - 70 - 54 * n
    box = Image.new("RGBA", (int(wmax) + 60, 54 * n + 26), (0, 0, 0, 0))
    ImageDraw.Draw(box).rounded_rectangle([0, 0, box.width - 1, box.height - 1], 12,
                                          fill=(8, 8, 10, 165))
    comp(cv, fade(box, a), W / 2 - box.width / 2, y0 - 13)
    for k, ln in enumerate(lines):
        draw_text(cv, ln, "mont-sb", 40, WHITE, W / 2, y0 + 54 * k, a, "center", shadow=0.4)


# --------------------------------------------------------------------------
# Zaman çizelgesi
# --------------------------------------------------------------------------

def wav_duration(p):
    with wave.open(p) as w:
        return w.getnframes() / w.getframerate()


@lru_cache(maxsize=1)
def manifest_boxes():
    p = mpath("media/manifest.json")
    if not os.path.exists(p):
        return {}
    with open(p, encoding="utf-8") as f:
        return {"media/" + e["file"]: e.get("subject_box") for e in json.load(f)}


def resolve(cands):
    """Aday listesinden ilk var olan dosya; 'glob:' önekiyle desen de olur."""
    import glob as _g
    if isinstance(cands, str):
        cands = [cands]
    for c in cands:
        if c.startswith("glob:"):
            hits = sorted(_g.glob(mpath(c[5:])))
            if hits:
                return os.path.relpath(hits[0], HERE)
        elif os.path.exists(mpath(c)):
            return c
    return None


def resolve_shot(s):
    s = dict(s)
    if isinstance(s.get("file"), list) and s.get("caption"):
        if resolve(s["file"][:1]) is None:  # yedek görsel geldiyse künye yanlış olur
            s.pop("caption")
    for key in ("file", "bg"):
        if key in s:
            r = resolve(s[key])
            if r is None:
                if key == "file" and s.get("fallback"):
                    fb = dict(s["fallback"], d=s.get("d"))
                    return resolve_shot(fb)
                if key == "file":
                    return None
                s.pop(key)
            else:
                s[key] = r
    if s.get("type") == "grid":
        s["files"] = [(r, lab) for f_, lab in s["files"] if (r := resolve(f_))]
    if s.get("type") == "photo" and s.get("mode") == "parallax" and not s.get("box"):
        s["box"] = manifest_boxes().get(s["file"])
        if not s["box"]:
            s["mode"] = "kenburns"
    return s


@lru_cache(maxsize=1)
def plan():
    """storyboard + anlatım süreleri -> mutlak zamanlı plan."""
    with open(os.environ.get("GG_STORYBOARD") or mpath("storyboard.json"), encoding="utf-8") as f:
        sb = json.load(f)
    subs = {}
    sp = mpath("narration/subs.json")
    if os.path.exists(sp):
        with open(sp, encoding="utf-8") as f:
            subs = json.load(f)
    t = 0.0
    segs = []
    for k, seg in enumerate(sb["segments"]):
        np_ = mpath(f"narration/seg_{seg['id']}.wav")
        nd = wav_duration(np_) if os.path.exists(np_) else seg.get("target_sec", 15) - 1.0
        dur = max(seg.get("min_sec", 0), LEAD + nd + TAIL)
        raw = [resolve_shot(x) for x in seg["shots"]]
        # eksik çekimin süresini bir öncekine ekle
        shots_in = []
        for x, orig in zip(raw, seg["shots"]):
            if x is None:
                if shots_in and orig.get("d"):
                    shots_in[-1]["d"] = (shots_in[-1].get("d") or 0) + orig["d"]
                continue
            shots_in.append(x)
        fixed = sum(x.get("d") or 0 for x in shots_in[:-1])
        free = [x for x in shots_in if not x.get("d")]
        if all(x.get("d") for x in shots_in[:-1]):
            shots_in[-1]["d"] = max(1.5, dur - fixed)
        else:
            rest = max(1.5 * len(free), dur - sum(x.get("d") or 0 for x in shots_in))
            for x in free:
                x["d"] = rest / len(free)
        scale = dur / sum(x["d"] for x in shots_in)
        shots, st = [], t
        for x in shots_in:
            d = x["d"] * scale
            shots.append(dict(x, t0=st, dur=d))
            st += d
        kin = [dict(kk, t0=t + kk.get("at", 1.0)) for kk in seg.get("kinetic", [])]
        sub = [(t + LEAD + e["start"], t + LEAD + e["end"], e["text"]) for e in subs.get(seg["id"], [])]
        first = shots[0]["type"] if shots else "photo"
        chap_pos = None if seg.get("no_chapter") or k == 0 else \
            ("bottom" if first in ("photo", "title", "list") else "top")
        segs.append(dict(seg, t0=t, dur=dur, narr=np_ if os.path.exists(np_) else None,
                         narr_dur=nd, shots=shots, kin=kin, subs=sub, num=k, chap_pos=chap_pos))
        t += dur
    return segs, t


def total_duration():
    return plan()[1]


def find_shot(t):
    segs, total = plan()
    flat = [(seg, s) for seg in segs for s in seg["shots"]]
    for i, (seg, s) in enumerate(flat):
        if s["t0"] <= t < s["t0"] + s["dur"] or i == len(flat) - 1:
            return i, flat
    return len(flat) - 1, flat


def render_shot(s, t):
    return SHOT_FUNCS[s["type"]](s, clamp(t, 0, s["dur"] + XF), s["dur"])


def render(t):
    i, flat = find_shot(t)
    seg, s = flat[i]
    img = render_shot(s, t - s["t0"])
    if i + 1 < len(flat):
        nseg, ns = flat[i + 1]
        u = (t - (ns["t0"] - XF / 2)) / XF
        if u > 0:
            nxt = render_shot(ns, 0.0)
            img = Image.blend(img, nxt, smooth(u))
    if i > 0 and t - s["t0"] < XF / 2:
        pseg, ps = flat[i - 1]
        u = (t - (s["t0"] - XF / 2)) / XF
        prev = render_shot(ps, t - ps["t0"])
        img = Image.blend(prev, img, smooth(u))
    cv = img if img.mode == "RGBA" else img.convert("RGBA")
    segs, total = plan()
    no_subs = s["type"] in ("quote", "chat")
    for sg in segs:
        lt = t - sg["t0"]
        if sg.get("chapter") and sg["chap_pos"] and 0 <= lt <= 3.4:
            chapter_overlay(cv, sg["num"], sg["chapter"], lt, sg["chap_pos"])
        for kk in sg["kin"]:
            kinetic_overlay(cv, kk["text"], t - kk["t0"], kk.get("dur", 1.6), kk.get("pos", "center"))
        for s0, s1, txt in sg["subs"]:
            if not no_subs and s0 - 0.2 <= t <= s1 + 0.3:
                subtitle_overlay(cv, txt, t - s0, s1 - s0)
    # bölüm geçişlerinde kısa beyaz parlama
    for sg in segs[1:]:
        d = t - sg["t0"]
        if -0.05 <= d <= 0.18:
            a = (1 - abs(d - 0.02) / 0.16) * 0.55
            if a > 0:
                comp(cv, fade(rect(W, H, (255, 250, 240)), a), 0, 0)
    out = cv.convert("RGB")
    black = max(1 - smooth(t / 0.5), smooth((t - (total - 1.2)) / 1.2))
    if black > 0.002:
        arr = np.asarray(out, dtype=np.float32) * (1 - black)
        out = Image.fromarray(arr.astype(np.uint8))
    return out


def render_frame(i):
    return render(i / FPS).tobytes()


# --------------------------------------------------------------------------
# Ses
# --------------------------------------------------------------------------

def read_audio(path):
    """Herhangi bir ses dosyasını ffmpeg ile 44.1 kHz stereo float'a çevir."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar",
                          str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.astype(np.float64)


def soundtrack(path):
    segs, total = plan()
    n = int(total * SR) + 1
    narr = np.zeros((2, n))
    for sg in segs:
        if sg["narr"]:
            x = read_audio(sg["narr"])
            i0 = int((sg["t0"] + LEAD) * SR)
            m = min(x.shape[1], n - i0)
            narr[:, i0:i0 + m] += x[:, :m]
    mus = np.zeros((2, n))
    bp = mpath("music/bed.wav")
    if os.path.exists(bp):
        b = read_audio(bp)
        m = min(b.shape[1], n)
        mus[:, :m] = b[:, :m]
        if b.shape[1] < n:  # yatak kısa kalırsa son kısmı döngüle
            rest = n - b.shape[1]
            seg = b[:, -min(b.shape[1], 30 * SR):]
            reps = int(math.ceil(rest / seg.shape[1]))
            mus[:, b.shape[1]:] = np.tile(seg, reps)[:, :rest]
    # anlatım altında müzik kısma
    env = np.abs(narr).max(axis=0)
    win = int(0.03 * SR)
    env = np.convolve(env, np.ones(win) / win, mode="same")
    env = (env > 0.008).astype(np.float64)
    k = int(0.3 * SR)
    hann = np.hanning(2 * k)
    env = np.clip(np.convolve(env, hann / hann.sum(), mode="same") * 1.6, 0, 1)
    duck = 1 - 0.68 * env
    sfx = np.zeros((2, n))
    wp = mpath("music/sfx/whoosh.wav")
    if os.path.exists(wp):
        wh = read_audio(wp)
        for sg in segs[1:]:
            i0 = max(0, int((sg["t0"] - 0.35) * SR))
            m = min(wh.shape[1], n - i0)
            sfx[:, i0:i0 + m] += wh[:, :m] * 0.35
    mix = mus * 0.9 * duck[None, :] + narr * 1.0 + sfx
    t = np.arange(n) / SR
    mix *= np.clip(t / 0.4, 0, 1) * np.clip((total - t) / 2.0, 0, 1) ** 1.3
    peak = np.abs(mix).max() + 1e-9
    mix = np.tanh(1.1 * mix / peak) / np.tanh(1.1) * 0.9
    pcm = (mix.T * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


# --------------------------------------------------------------------------

def init_worker():
    cf.init_worker()


def warm_up():
    segs, _ = plan()
    for sg in segs:
        for s in sg["shots"]:
            if s["type"] == "photo" and s.get("mode") == "parallax":
                render_shot(s, 0.5)


def encode(out, frames, wav, crf, maxrate=None):
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"]
    if wav:
        cmd += ["-i", wav]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p"]
    if maxrate:
        cmd += ["-maxrate", maxrate, "-bufsize", "12M"]
    if wav:
        cmd += ["-c:a", "aac", "-b:a", "192k", "-af", "loudnorm=I=-15:TP=-1.5:LRA=11",
                "-ar", "44100", "-shortest"]
    cmd += ["-movflags", "+faststart", out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    ctx = multiprocessing.get_context("spawn")
    nf = len(frames)
    with ctx.Pool(os.cpu_count() or 2, initializer=init_worker) as pool:
        for k, fr in enumerate(pool.imap(render_frame, frames, chunksize=6)):
            proc.stdin.write(fr)
            if k % 300 == 0:
                print(f"  %{100 * k / nf:4.1f}  ({k / FPS:5.1f} sn)", flush=True)
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("ffmpeg başarısız oldu")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=os.path.join(HERE, "guthrie-govan.mp4"))
    ap.add_argument("--stills")
    ap.add_argument("--stills-dir", default="stills")
    ap.add_argument("--range")
    ap.add_argument("--crf", type=int, default=21)
    ap.add_argument("--maxrate", default="6M")
    args = ap.parse_args()
    segs, total = plan()
    print(f"Toplam süre: {total:.1f} sn, {len(segs)} bölüm")
    if args.stills:
        os.makedirs(args.stills_dir, exist_ok=True)
        for s in args.stills.split(","):
            p = os.path.join(args.stills_dir, f"gg_{float(s):06.2f}.jpg")
            render(float(s)).save(p, quality=90)
            print(p)
        return
    warm_up()
    if args.range:
        a, b = (float(v) for v in args.range.split("-"))
        out = os.path.splitext(args.out)[0] + f"_onizleme_{int(a)}-{int(b)}.mp4"
        encode(out, range(int(a * FPS), int(min(b, total) * FPS)), None, 24)
        print("Önizleme:", out)
        return
    wav = os.path.splitext(args.out)[0] + ".wav"
    print("Ses hazırlanıyor…")
    soundtrack(wav)
    print("Kareler işleniyor…")
    encode(args.out, range(int(total * FPS)), wav, args.crf, args.maxrate)
    os.remove(wav)
    print("Hazır:", args.out)


if __name__ == "__main__":
    main()
