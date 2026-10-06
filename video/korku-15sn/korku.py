#!/usr/bin/env python3
"""BODRUM KATI — 15 saniyelik deneysel korku kısa filmi (1920x1080, 30 fps).

Görüntü ve ses tamamen kodla üretilir: ışın izlemeli bir koridor, titreyen
floresanlar, her karanlıkta yaklaşan bir silüet, VHS bozulmaları, bilinçaltı
yazılar ve sonda ani bir yüz. UYARI: son saniyelerde yüksek ses ve ani görüntü var.

    python3 korku.py            # korku.mp4
    python3 korku.py --stills 3,7,12,13.8
"""
import argparse
import math
import os
import subprocess
import wave

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, DUR = 1920, 1080, 30, 15.0
N = int(DUR * FPS)
SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
BEBAS = os.path.join(HERE, "..", "guthrie-govan", "fonts", "BebasNeue-Regular.ttf")

STEPS = [4.2, 5.6, 6.9, 8.0]          # ışıkların sönüp figürün yaklaştığı anlar
DEPTHS = [27.0, 20.0, 13.5, 8.5, 5.0]  # figürün koridordaki derinliği
GLITCH = (8.4, 11.0)
DARK = (11.0, 13.4)
JUMP = (13.4, 14.6)


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def smooth(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def fbm(h, w, seed, octaves=6, base=6):
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = base * 2 ** o
        g = rng.standard_normal((n + 1, int(n * w / h) + 1)).astype(np.float32)
        out += amp * cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC)
        tot += amp
        amp *= 0.55
    out /= tot
    return (out - out.min()) / (out.max() - out.min() + 1e-6)


# --------------------------------------------------------------------------
# Koridor (piksel başına ışın: duvar/zemin/tavan/arka duvar)
# --------------------------------------------------------------------------
F, CX, CY, ZEND = 900.0, W / 2, H * 0.49, 32.0
LIGHTS = [4.5, 10.5, 16.5, 22.5, 28.5]


def build_corridor():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    u, v = (xx - CX) / F, (yy - CY) / F
    tw = 1.0 / np.maximum(np.abs(u), 1e-5)
    tf = 1.15 / np.maximum(np.abs(v), 1e-5)
    z = np.minimum(np.minimum(tw, tf), ZEND)
    X, Y = u * z, v * z
    wall = (tw <= tf) & (tw < ZEND)
    floor = (tf < tw) & (v > 0) & (tf < ZEND)
    ceil = (tf < tw) & (v < 0) & (tf < ZEND)
    back = ~(wall | floor | ceil)
    stain = fbm(H, W, 3)
    alb = np.zeros((H, W), np.float32)
    # duvarlar: lambri, derzler, kapılar, lekeler
    a = 0.55 + 0.25 * stain
    a = np.where(Y > 0.35, a * 0.55, a)
    a = np.where(np.abs(Y - 0.35) < 0.02, 0.2, a)
    a = np.where((np.mod(z, 2.0) < 0.03), a * 0.5, a)
    door = np.zeros_like(z, bool)
    for k, dz in enumerate([5.5, 11.5, 17.5, 23.5]):
        side = 1 if k % 2 == 0 else -1
        d = (np.sign(u) == side) & (z > dz) & (z < dz + 1.0) & (Y > -0.55)
        door |= d
        frame = d & ((z < dz + 0.06) | (z > dz + 0.94) | (Y < -0.5))
        a = np.where(d, 0.12 + 0.05 * stain, a)
        a = np.where(frame, 0.35, a)
    alb = np.where(wall, a, alb)
    # zemin: karolar
    tile = ((np.floor(X / 0.5) + np.floor(z / 0.5)) % 2).astype(np.float32)
    grout = (np.mod(X, 0.5) < 0.02) | (np.mod(z, 0.5) < 0.02)
    fl = (0.30 + 0.12 * tile) * (0.7 + 0.5 * stain)
    fl = np.where(grout, 0.08, fl)
    alb = np.where(floor, fl, alb)
    # tavan + lamba yuvaları
    emis = []
    alb = np.where(ceil, 0.35 + 0.2 * stain, alb)
    for L in LIGHTS:
        e = ceil & (np.abs(X) < 0.22) & (np.abs(z - L) < 0.35)
        emis.append(e.astype(np.float32))
    # arka duvar: kapalı bir kapı ve üstünde çıkış ışığı
    bk = 0.35 + 0.2 * stain
    bk = np.where((np.abs(X) < 0.45) & (Y > -0.4), 0.06, bk)
    alb = np.where(back, bk, alb)
    exit_sign = back & (np.abs(X) < 0.22) & (np.abs(Y + 0.62) < 0.07)
    # ışık katkı haritaları
    maps = []
    for L in LIGHTS:
        d2 = X ** 2 + (Y + 1.1) ** 2 + (z - L) ** 2
        maps.append((alb / (1 + 0.55 * d2)).astype(np.float32))
    fog = np.exp(-z * 0.035).astype(np.float32)
    return dict(alb=alb, maps=maps, emis=emis, fog=fog, z=z, exit=exit_sign.astype(np.float32),
                red=(alb / (1 + 0.3 * (X ** 2 + (Y + 1.0) ** 2 + (z - 7.0) ** 2))).astype(np.float32))


def light_levels(t):
    rng = np.random.default_rng(int(t * FPS) * 7 + 11)
    lv = []
    for i, _ in enumerate(LIGHTS):
        base = 1.0
        # titreme: bazı lambalar sık sık kesilir
        if i in (1, 3):
            ph = math.sin(t * (7 + 3 * i)) + math.sin(t * 23.3 + i)
            base = 0.15 if ph > 1.25 else 1.0
        if rng.random() < 0.04:
            base *= 0.2
        lv.append(base)
    for s in STEPS:  # karartma anları
        if s - 0.06 <= t < s + 0.32:
            lv = [0.0] * len(LIGHTS)
    if t >= DARK[0]:
        lv = [0.0] * len(LIGHTS)
    if t < 1.2:  # açılış: lambalar yavaşça yanıyor
        k = smooth((t - 0.3) / 0.9)
        lv = [x * k * (1.0 if (int(t * 17) % 3) else 0.3) for x in lv]
    return lv


# --------------------------------------------------------------------------
# Figür ve yüz
# --------------------------------------------------------------------------

def build_figure():
    s = 4
    w, h = 300, 1000
    im = Image.new("L", (w * s, h * s), 0)
    d = ImageDraw.Draw(im)
    P = lambda pts: [(x * s, y * s) for x, y in pts]
    d.ellipse([110 * s, 0, 190 * s, 130 * s], fill=255)                 # uzun kafa
    d.polygon(P([(140, 120), (160, 120), (164, 175), (136, 175)]), fill=255)
    d.polygon(P([(98, 170), (202, 165), (196, 520), (104, 525)]), fill=255)   # gövde
    d.polygon(P([(98, 175), (82, 190), (60, 560), (70, 700), (80, 700), (88, 560), (104, 230)]), fill=255)
    d.polygon(P([(202, 170), (220, 190), (238, 540), (232, 690), (222, 690), (214, 545), (196, 230)]), fill=255)
    d.polygon(P([(108, 515), (148, 515), (140, 1000), (118, 1000)]), fill=255)
    d.polygon(P([(152, 515), (194, 515), (184, 1000), (162, 1000)]), fill=255)
    for fx in (66, 228):  # uzun parmaklar
        for k in range(4):
            d.line([(fx * s, 690 * s), ((fx - 9 + 6 * k) * s, (760 + 6 * k) * s)], fill=255, width=3 * s)
    im = im.resize((w, h), Image.LANCZOS)
    a = np.asarray(im, np.float32) / 255.0
    return cv2.GaussianBlur(a, (0, 0), 1.2)


def build_face():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    skin = 0.18 + 0.55 * fbm(H, W, 9, 7, 4) ** 1.4
    cx, cy = W / 2, H * 0.52
    head = np.clip(1.15 - np.sqrt(((xx - cx) / 560) ** 2 + ((yy - cy) / 760) ** 2), 0, 1) ** 0.6
    img = skin * head
    def hole(px, py, ax, ay, depth=1.0):
        d = np.sqrt(((xx - px) / ax) ** 2 + ((yy - py) / ay) ** 2)
        return np.clip(1.25 - d, 0, 1) ** 0.8 * depth
    for ex in (cx - 210, cx + 205):
        img *= 1 - hole(ex, cy - 120, 150, 115)
    img *= 1 - hole(cx, cy + 250, 120, 190)              # uzun, açık ağız
    img *= 1 - 0.5 * hole(cx - 300, cy + 120, 150, 240)  # çökük yanaklar
    img *= 1 - 0.5 * hole(cx + 300, cy + 120, 150, 240)
    img *= 1 - 0.7 * hole(cx, cy + 40, 45, 70)           # burun boşluğu
    # asimetri: dalgalı çarpıtma
    mx = xx + 22 * np.sin(yy / 90.0) + 10 * np.sin(yy / 23.0)
    my = yy + 16 * np.sin(xx / 120.0)
    img = cv2.remap(img.astype(np.float32), mx.astype(np.float32), my.astype(np.float32),
                    cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    eyes = np.zeros((H, W), np.float32)
    for ex in (cx - 210, cx + 205):
        d = np.sqrt((xx - ex) ** 2 + (yy - (cy - 115)) ** 2)
        eyes += np.exp(-(d / 9) ** 2) + 0.35 * np.exp(-(d / 40) ** 2)
    img = np.clip(img, 0, 1) ** 1.25
    return img.astype(np.float32), eyes


# --------------------------------------------------------------------------
# Kare
# --------------------------------------------------------------------------
_cache = {}


def assets():
    if not _cache:
        _cache["c"] = build_corridor()
        _cache["fig"] = build_figure()
        _cache["face"] = build_face()
        _cache["font"] = ImageFont.truetype(MONO, 34)
        _cache["font_s"] = ImageFont.truetype(MONO, 26)
        _cache["big"] = ImageFont.truetype(BEBAS, 230)
        _cache["mid"] = ImageFont.truetype(BEBAS, 90)
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.sqrt(((xx - W / 2) / (W * 0.6)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2)
        _cache["vig"] = np.clip(1.05 - d ** 1.8 * 0.75, 0.1, 1).astype(np.float32)
        _cache["scan"] = (1 - 0.07 * (np.arange(H) % 3 == 0))[:, None].astype(np.float32)
    return _cache


def fig_depth(t):
    k = sum(1 for s in STEPS if t >= s + 0.2)
    return DEPTHS[min(k, len(DEPTHS) - 1)]


def render(t):
    A = assets()
    c = A["c"]
    rng = np.random.default_rng(int(t * FPS) + 1)
    lv = light_levels(t)
    lum = 0.012 * c["alb"]
    for m, e, l in zip(c["maps"], c["emis"], lv):
        lum = lum + l * (m * 2.6 + e * 2.2)
    lum = lum + 0.6 * c["exit"] * (0.6 + 0.4 * math.sin(t * 3))
    lum *= c["fog"] ** 0.5
    rgb = np.stack([lum * 0.80, lum * 0.95, lum * 1.0], -1)
    # karanlık bölüm: kırmızı acil durum ışığı
    if t >= DARK[0]:
        red = c["red"] * (0.9 + 0.1 * math.sin(t * 40)) * smooth((t - DARK[0]) / 0.6)
        rgb = np.stack([lum * 0.3 + red * 1.6, lum * 0.2 + red * 0.25, lum * 0.25 + red * 0.25], -1)
    # figür (ışıklar yanarken siluet)
    if 2.6 <= t < JUMP[0]:
        zf = fig_depth(t)
        if t >= DARK[0]:  # karanlıkta yaklaşmaya devam ediyor
            zf = 5.0 - 2.2 * smooth((t - 11.6) / 1.8)
        top, bot = CY + F * -0.95 / zf, CY + F * 1.15 / zf
        hgt = bot - top
        fig = A["fig"]
        sw = max(2, int(fig.shape[1] * hgt / fig.shape[0]))
        sh = max(2, int(hgt))
        f2 = cv2.resize(fig, (sw, sh), interpolation=cv2.INTER_AREA)
        x0 = int(CX + F * 0.12 / zf - sw / 2 + 2 * math.sin(t * 1.3))
        y0 = int(top)
        a = np.zeros((H, W), np.float32)
        xs, ys = max(0, x0), max(0, y0)
        xe, ye = min(W, x0 + sw), min(H, y0 + sh)
        if xe > xs and ye > ys:
            a[ys:ye, xs:xe] = f2[ys - y0:ye - y0, xs - x0:xe - x0]
        appear = smooth((t - 2.6) / 1.2)
        rgb *= (1 - 0.94 * a * appear)[..., None]
        if t >= DARK[0]:
            a *= 0.0  # siluet karanlıkta görünmez, sadece gözler
        if zf < 21 and (t >= DARK[0] or int(t * 5) % 4 != 0):  # gözler
            hy = int(top + hgt * 0.065)
            for ex in (x0 + sw * 0.43, x0 + sw * 0.57):
                if 0 <= hy < H and 0 <= int(ex) < W:
                    r_ = max(1, int(hgt * 0.006))
                    if t >= DARK[0]:
                        blink = 0.0 if 12.35 < t < 12.45 else 1.0
                        cv2.circle(rgb, (int(ex), hy), r_ * 4, (0.25 * blink, 0.05 * blink, 0.05 * blink), -1)
                        r_ = max(2, r_)
                        cv2.circle(rgb, (int(ex), hy), r_, (1.2 * blink, 1.1 * blink, 1.0 * blink), -1)
                    else:
                        cv2.circle(rgb, (int(ex), hy), r_, (0.9, 0.95, 1.0), -1)
    # kamera sarsıntısı
    sh_amt = 2.0 + 6.0 * smooth((t - 6.5) / 4)
    if GLITCH[0] <= t < GLITCH[1]:
        sh_amt += 8
    dx, dy = sh_amt * math.sin(t * 13.1 + 0.3) * 0.6, sh_amt * math.sin(t * 17.7) * 0.5
    zoom = 1.04 + 0.05 * smooth(t / 11)
    M = np.float32([[zoom, 0, W / 2 * (1 - zoom) + dx], [0, zoom, H / 2 * (1 - zoom) + dy]])
    rgb = cv2.warpAffine(rgb.astype(np.float32), M, (W, H), borderMode=cv2.BORDER_REFLECT)

    # ani yüz
    if JUMP[0] <= t < JUMP[1]:
        lt = t - JUMP[0]
        face, eyes = A["face"]
        z = 1.0 + 0.35 * smooth(lt / 1.2)
        jx, jy = 30 * math.sin(lt * 61), 26 * math.sin(lt * 47)
        Mf = np.float32([[z, 0, W / 2 * (1 - z) + jx], [0, z, H / 2 * (1 - z) + jy]])
        f2 = cv2.warpAffine(face, Mf, (W, H), borderMode=cv2.BORDER_CONSTANT)
        e2 = cv2.warpAffine(eyes, Mf, (W, H), borderMode=cv2.BORDER_CONSTANT)
        rgb = np.stack([f2 * 1.05 + e2 * 1.2, f2 * 0.85 + e2 * 1.2, f2 * 0.8 + e2 * 1.2], -1)
        if int(lt * FPS) in (0, 1, 5):
            rgb = 1.0 - np.clip(rgb, 0, 1)  # negatif flaş
    if t >= JUMP[1]:
        rgb = np.zeros((H, W, 3), np.float32)

    # VHS: kayma, renk ayrışması, yırtılma
    glitch = GLITCH[0] <= t < GLITCH[1] or (JUMP[0] <= t < JUMP[0] + 0.25)
    shift = 3 + (14 if glitch else 0)
    rgb[..., 0] = np.roll(rgb[..., 0], shift, axis=1)
    rgb[..., 2] = np.roll(rgb[..., 2], -shift, axis=1)
    if glitch:
        for _ in range(int(rng.integers(3, 9))):
            y = int(rng.integers(0, H - 40))
            h = int(rng.integers(6, 60))
            rgb[y:y + h] = np.roll(rgb[y:y + h], int(rng.integers(-180, 180)), axis=1)
        if rng.random() < 0.3:
            rgb = rgb[:, :, ::-1].copy()
    band_y = int((t * 260) % (H + 200)) - 100
    if 0 < band_y < H - 30:
        rgb[band_y:band_y + 30] = rgb[band_y:band_y + 30] * 0.6 + rng.random((30, W, 1)) * 0.25
    # gren, tarama çizgileri, vinyet
    noise = rng.standard_normal((H // 2, W // 2)).astype(np.float32)
    noise = cv2.resize(noise, (W, H), interpolation=cv2.INTER_NEAREST)[..., None]
    rgb = rgb * A["vig"][..., None] * A["scan"][..., None] + noise * (0.035 + (0.06 if glitch else 0))
    if t < 0.35 or (t >= JUMP[1] and t < JUMP[1] + 0.08):
        rgb = rng.random((H, W, 1)).astype(np.float32).repeat(3, -1) * 0.5  # karlanma
    out = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8))

    # yazılar
    d = ImageDraw.Draw(out)
    if t < JUMP[0]:
        if int(t * 2) % 2 == 0:
            d.ellipse([70, 66, 96, 92], fill=(220, 20, 20))
        sec = 42 + int(t)
        d.text((112, 60), f"KAYIT   03:17:{sec:02d}", font=A["font"], fill=(235, 235, 235))
        d.text((70, H - 100), "KAMERA 2  ·  BODRUM KATI", font=A["font_s"], fill=(220, 220, 220))
        d.text((W - 330, 60), "OYNAT ▶", font=A["font"], fill=(235, 235, 235))
        if glitch:
            d.text((W / 2 - 170, H / 2 - 30), "SİNYAL KAYBI", font=A["font"], fill=(240, 240, 240))
    sub = [(9.1, "SENİ GÖRÜYOR"), (10.25, "ARKANA BAKMA"), (12.6, "O BURADA")]
    for st, txt in sub:
        if st <= t < st + 2.0 / FPS:
            tw = d.textlength(txt, font=A["big"])
            d.text(((W - tw) / 2, H / 2 - 130), txt, font=A["big"], fill=(255, 255, 255))
    if t >= JUMP[1] + 0.1:
        a = int(200 * smooth((t - JUMP[1] - 0.1) / 0.15))
        txt = "ARKANA BAK."
        tw = d.textlength(txt, font=A["mid"])
        d.text(((W - tw) / 2, H / 2 - 50), txt, font=A["mid"], fill=(a, a // 8, a // 8))
    return out


# --------------------------------------------------------------------------
# Ses
# --------------------------------------------------------------------------

def soundtrack(path):
    n = int(SR * DUR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(5)
    L = np.zeros(n)
    R = np.zeros(n)

    def add(sig, start, pan=0.0, gain=1.0):
        i0 = int(start * SR)
        m = min(len(sig), n - i0)
        if m <= 0:
            return
        gl, gr = math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)
        L[i0:i0 + m] += sig[:m] * gain * gl
        R[i0:i0 + m] += sig[:m] * gain * gr

    def lowpass(x, k):
        return np.convolve(x, np.ones(k) / k, mode="same")

    # uğultu: birbirine sürtünen alçak sinüsler
    env = np.interp(t, [0, 2, 8, 11, 11.3, 13.3, 13.4], [0, 0.5, 0.9, 1.0, 0.25, 0.3, 0])
    drone = sum(math.sqrt(1 / k) * np.sin(2 * np.pi * f * (1 + 0.004 * t) * t + k)
                for k, f in enumerate([41.2, 43.7, 55.0, 58.3, 82.4, 87.3], 1))
    rumble = lowpass(rng.standard_normal(n), 400) * 6
    add((drone * 0.35 + rumble) * env, 0, 0)
    # floresan vızıltısı, görüntüdeki titremeyle eşzamanlı
    buzz = np.sign(np.sin(2 * np.pi * 100 * t)) * 0.3 + np.sin(2 * np.pi * 200 * t) * 0.3
    gate = np.array([sum(light_levels(x)) / len(LIGHTS) for x in np.arange(0, DUR, 1 / FPS)])
    gate = np.interp(t, np.arange(len(gate)) / FPS, gate)
    add(lowpass(buzz, 3) * gate * 0.06, 0, 0.3)
    # kalp atışı: hızlanarak
    hb = 1.0
    tk = 1.0
    while tk < DARK[1] - 0.3:
        for off, a in ((0, 1.0), (0.16, 0.7)):
            m = int(0.35 * SR)
            tt = np.arange(m) / SR
            th = np.sin(2 * np.pi * 52 * tt * (1 + 0.4 * np.exp(-tt * 30))) * np.exp(-tt * 14)
            add(th * a * 0.55 * (0.4 + 0.6 * smooth(tk / 10)), tk + off)
        hb = max(0.42, hb * 0.93)
        tk += hb
    # her karanlıkta ağır bir adım + gıcırtı
    for k, s in enumerate(STEPS):
        m = int(1.2 * SR)
        tt = np.arange(m) / SR
        thud = np.sin(2 * np.pi * 38 * tt) * np.exp(-tt * 9) + lowpass(rng.standard_normal(m), 30) * np.exp(-tt * 25) * 3
        creak = np.sin(2 * np.pi * (300 + 140 * np.sin(2 * np.pi * 3 * tt)) * tt + 4 * np.sin(2 * np.pi * 11 * tt)) * np.exp(-tt * 4) * 0.15
        add(thud * (0.5 + 0.15 * k) + creak, s + 0.05, -0.2 + 0.1 * k)
    # fısıltılar (hece benzeri gürültü patlamaları)
    tw_ = 5.0
    while tw_ < DARK[1]:
        m = int(rng.uniform(0.12, 0.3) * SR)
        tt = np.arange(m) / SR
        x = rng.standard_normal(m)
        x = x - lowpass(x, 6)  # yüksek geçiren
        x = lowpass(x, 3)
        e = np.sin(np.pi * tt / tt[-1]) ** 2
        add(x * e * 0.10 * (1.3 if tw_ > 11 else 1.0), tw_, rng.uniform(-0.9, 0.9))
        tw_ += rng.uniform(0.08, 0.35) if tw_ > 7.5 else rng.uniform(0.25, 0.7)
    # bozulma sesleri
    tg = GLITCH[0]
    while tg < GLITCH[1]:
        m = int(rng.uniform(0.04, 0.18) * SR)
        x = np.round(rng.standard_normal(m) * 3) / 3
        add(x * 0.12, tg, rng.uniform(-0.6, 0.6))
        tg += rng.uniform(0.1, 0.5)
    # karanlıkta yakından nefes + kulak çınlaması
    m = int((DARK[1] - DARK[0]) * SR)
    tt = np.arange(m) / SR
    br = lowpass(rng.standard_normal(m), 8) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.55 * tt - 1.5)) ** 3
    add(br * 0.5, DARK[0], 0.7)
    add(np.sin(2 * np.pi * 7800 * tt) * 0.01 * smooth(1.0), DARK[0], 0)
    # ters şişen ses -> çığlık
    m = int(0.8 * SR)
    tt = np.arange(m) / SR
    swell = rng.standard_normal(m) * (tt / tt[-1]) ** 3
    add(lowpass(swell, 4) * 0.5, JUMP[0] - 0.8, 0)
    m = int((JUMP[1] - JUMP[0] + 0.15) * SR)
    tt = np.arange(m) / SR
    scr = sum(((2 * ((f * (1 + 0.02 * np.sin(2 * np.pi * 9 * tt)) * tt) % 1) - 1)) for f in (412, 437, 611, 899, 1310))
    scr = np.tanh(scr * 1.6 + rng.standard_normal(m) * 1.2) * np.exp(-tt * 1.2)
    hit = np.sin(2 * np.pi * 45 * tt) * np.exp(-tt * 5) * 2
    add(scr * 0.9 + hit, JUMP[0], 0)
    # sonda kısa karlanma
    m = int(0.1 * SR)
    add(rng.standard_normal(m) * 0.15, JUMP[1], 0)

    mix = np.stack([L, R])
    mix /= np.abs(mix).max() + 1e-9
    mix *= 0.89
    fade = np.clip((DUR - t) / 0.05, 0, 1)
    mix *= fade
    pcm = (mix.T * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills")
    ap.add_argument("--out", default=os.path.join(HERE, "korku.mp4"))
    a = ap.parse_args()
    if a.stills:
        for s in a.stills.split(","):
            p = os.path.join(HERE, f"kare_{float(s):05.2f}.jpg")
            render(float(s)).save(p, quality=90)
            print(p)
        return
    wav = a.out + ".wav"
    soundtrack(wav)
    p = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                          "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-i", wav,
                          "-c:v", "libx264", "-preset", "slow", "-b:v", "12M", "-maxrate", "16M",
                          "-bufsize", "24M", "-pix_fmt", "yuv420p",
                          "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", a.out],
                         stdin=subprocess.PIPE)
    for i in range(N):
        p.stdin.write(render(i / FPS).tobytes())
        if i % 90 == 0:
            print(f"  %{100 * i / N:.0f}", flush=True)
    p.stdin.close()
    p.wait()
    os.remove(wav)
    print("Hazır:", a.out)


if __name__ == "__main__":
    main()
