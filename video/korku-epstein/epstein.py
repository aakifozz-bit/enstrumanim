#!/usr/bin/env python3
"""KARARTILDI — Epstein dosyası üzerine 15 saniyelik deneysel korku kısa filmi (1920x1080, 30 fps).

Belgelenmiş ayrıntılardan yola çıkar: 10 Ağustos 2019 gecesi MCC New York'taki kamera
kaydında 23:58:58'den 00:00:00'a atlayan boşluk, arızalı kameralar, karartılmış dosyalar
ve Little St. James adası. Bir iddia ortaya atmaz; isim gösterilmez, kurbanlar resmedilmez.
Görüntü ve ses tamamen kodla üretilir (koridor ../korku-15sn/korku.py'den).
UYARI: sonda yüksek ses, ani görüntü ve kısa beyaz flaşlar var.

    python3 epstein.py                      # karartildi.mp4
    python3 epstein.py --stills 2,5,9,12.9
"""
import argparse
import math
import os
import subprocess
import sys
import wave

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "korku-15sn"))
import korku as K  # noqa: E402  koridor, fbm, smooth, yazı tipleri

W, H, FPS, DUR = K.W, K.H, 30, 15.0
N = int(DUR * FPS)
SR = 44100
smooth, fbm = K.smooth, K.fbm

CCTV1 = (0.0, 4.6)
GAP = (4.6, 6.2)       # kayıt yok: 23:58:58 -> 00:00:00
CCTV2 = (6.2, 7.8)
DOC = (7.8, 11.4)      # dosya karartılıyor
ISL = (11.4, 13.6)     # ada, şimşek
SLAM = (13.6, 14.25)   # karartma + flaşlar
END = 14.25
STRB = 13.95
GLITCHES = [(4.45, 4.75), (6.1, 6.4), (7.65, 7.95), (11.25, 11.5), (13.6, 14.25)]
STATIC = [(0.0, 0.3), (4.6, 4.7), (6.12, 6.2), (7.74, 7.8), (11.34, 11.4)]
FLASHES = [(11.95, 0.7), (12.08, 0.5), (12.85, 1.0), (13.32, 0.45)]
SUBS = [(7.05, "KİMSE BAKMIYORDU"), (9.55, "İSİMLER NEREDE?"), (12.45, "NE SAKLANIYOR?")]


def clock(t):
    if t < GAP[0]:
        s = 23 * 3600 + 58 * 60 + 54 + min(int(t), 4)
    elif t < CCTV2[0]:
        s = 23 * 3600 + 58 * 60 + 58
    else:
        s = int(t - CCTV2[0])
    s %= 86400
    return f"{s // 3600:02d}:{s // 60 % 60:02d}:{s % 60:02d}"


def lights(t):
    rng = np.random.default_rng(int(t * FPS) * 7 + 3)
    lv = []
    for i in range(len(K.LIGHTS)):
        b = 1.0
        if i == 2 or (t >= CCTV2[0] and i in (0, 3)):
            ph = math.sin(t * (8 + 3 * i)) + math.sin(t * 21.7 + i)
            b = 0.12 if ph > 1.2 else 1.0
        if rng.random() < 0.03:
            b *= 0.25
        lv.append(b)
    if t < 1.0:
        k = smooth((t - 0.2) / 0.8)
        lv = [x * k for x in lv]
    return lv


def flash(t):
    v = 0.0
    for t0, a in FLASHES:
        if t >= t0:
            dt = t - t0
            v += a * math.exp(-dt * 7) * (1.0 if int(dt * FPS) % 3 != 1 else 0.35)
    return min(v, 1.2)


# --------------------------------------------------------------------------
# Dosya sayfası
# --------------------------------------------------------------------------

def build_page():
    PW, PH = 1500, 1940
    base = 0.82 + 0.10 * fbm(PH, PW, 21, 6, 5)
    base -= 0.25 * np.clip(fbm(PH, PW, 22, 5, 3) - 0.66, 0, 1)
    base -= 0.07 * np.exp(-((np.arange(PH)[:, None] - PH * 0.52) / 5.0) ** 2)
    ex = np.minimum(np.arange(PW), PW - 1 - np.arange(PW))[None, :]
    ey = np.minimum(np.arange(PH), PH - 1 - np.arange(PH))[:, None]
    base = base * np.clip(0.8 + np.minimum(ex, ey) / 200, 0, 1)
    rgb = np.stack([base, base * 0.955, base * 0.85], -1)
    im = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(K.MONO, 36)
    fh = ImageFont.truetype(K.MONO, 46)
    cw = d.textlength("M", font=f)
    ink = (30, 28, 26)
    d.text((110, 110), "SORUŞTURMA DOSYASI", font=fh, fill=ink)
    gw = d.textlength("GİZLİ", font=fh)
    d.rectangle([PW - 150 - gw, 100, PW - 115, 170], outline=(150, 30, 30), width=5)
    d.text((PW - 133 - gw, 108), "GİZLİ", font=fh, fill=(150, 30, 30))
    d.line([(110, 195), (PW - 110, 195)], fill=ink, width=3)
    lines = [
        ["DOSYA NO:", "#2", "-NY-", "#7", "  SAYFA 1 /", "#4"],
        ["KONU:", "*EPSTEIN, JEFFREY E."],
        [],
        ["UÇUŞ KAYDI:", "N908JE", "TETERBORO → ST. THOMAS"],
        ["YOLCULAR:", "#10", "#11", "#8"],
        ["", "#9", "#12", "#7"],
        ["VARIŞ:", "LITTLE ST. JAMES"],
        [],
        ["İFADE:", "#26"],
        ["#33"], ["#30"], ["#34"], ["#21"],
        [],
        ["EK-1:", "TANIK LİSTESİ (", "#2", "KİŞİ)"],
        ["EK-2:", "UÇUŞ KAYITLARI (", "#3", "SAYFA)"],
        [],
        ["NOT:", "#28"], ["#35"], ["#31"],
        [],
        ["İMZA:", "#14", "  TARİH:", "#2", ".", "#2", ".", "#4"],
    ]
    pre, prog, key = [], [], None
    y = 250
    for ln in lines:
        x = 110
        for tok in ln:
            if tok == "":
                x += cw * 11
            elif tok.startswith("#"):
                w = int(tok[1:]) * cw
                pre.append((x, y - 2, x + w, y + 44, -1.0))
                x += w + cw
            else:
                txt = tok.lstrip("*")
                d.text((x, y), txt, font=f, fill=ink)
                b = d.textbbox((x, y), txt, font=f)
                box = (b[0] - 6, b[1] - 7, b[2] + 6, b[3] + 7)
                if tok.startswith("*"):
                    key = box
                else:
                    prog.append(box)
                x += d.textlength(txt, font=f) + cw
        y += 64
    rng = np.random.default_rng(4)
    order = rng.permutation(len(prog))
    bars = list(pre)
    for i, j in enumerate(order):
        u = i / (len(prog) - 1)
        bars.append((*prog[j], 8.35 + 2.2 * (1 - (1 - u) ** 2)))
    bars.append((*key, 10.95))
    return im, bars, key


def doc(t):
    A = assets()
    P = A["page"].copy()
    d = ImageDraw.Draw(P)
    for x0, y0, x1, y1, tk in A["bars"]:
        if t >= tk:
            fr = smooth((t - tk) / 0.07) if tk > 0 else 1.0
            d.rectangle([x0, y0, x0 + (x1 - x0) * fr, y1], fill=(8, 8, 8))
    arr = np.asarray(P, np.float32) / 255.0
    k = smooth((t - DOC[0]) / 3.1)
    kx = A["key"]
    fx = 750 + ((kx[0] + kx[2]) / 2 + 80 - 750) * k
    fy = 1350 + ((kx[1] + kx[3]) / 2 - 1350) * k
    s = 0.85 + 0.75 * k
    ang = -2.2 + 1.8 * k
    sh = 14 * math.exp(-max(0, t - 10.95) * 9) if t >= 10.95 else 0
    M = cv2.getRotationMatrix2D((fx, fy), ang, s)
    M[0, 2] += W / 2 - fx + sh * math.sin(t * 90)
    M[1, 2] += H / 2 - fy + sh * math.cos(t * 77)
    out = cv2.warpAffine(arr, M, (W, H), flags=cv2.INTER_LINEAR, borderValue=(0.025, 0.022, 0.02))
    return out * (A["lamp"] * (0.97 + 0.03 * math.sin(t * 31)))[..., None]


# --------------------------------------------------------------------------
# Ada
# --------------------------------------------------------------------------

def build_island():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    HZ = int(H * 0.63)
    x = np.arange(W, dtype=np.float32)
    u = np.clip((x - 0.16 * W) / (0.72 * W), 0, 1)
    inside = (u > 0) & (u < 1)
    hump = np.where(inside, np.clip(np.sin(np.pi * u), 0, 1) ** 0.65, 0) * H * 0.14
    hump += np.where(inside, np.sin(np.pi * np.clip((x - 0.25 * W) / (0.3 * W), 0, 1)) ** 2, 0) * H * 0.03
    trees = np.maximum((fbm(64, W, 33, 6, 6)[32] - 0.3) * 40, 0) * (hump > 4)
    prof = HZ - hump - trees
    tx = int(0.6 * W)
    gy = int(HZ - hump[tx]) + 4
    sel = (x > tx - 95) & (x < tx + 95)
    prof[sel] = np.maximum(prof[sel], gy - 6)
    land = (yy >= prof[None, :]) & (yy <= HZ + 5)
    tw, th = 120, 80
    tl = tx - tw // 2
    temple = (xx >= tl) & (xx < tl + tw) & (yy >= gy - th) & (yy < gy)
    stripes = ((xx - tl) // 15).astype(int) % 2 == 0
    dome = (((xx - tx) / 48) ** 2 + ((yy - (gy - th)) / 44) ** 2 <= 1) & (yy <= gy - th)
    fin = (np.abs(xx - tx) < 3) & (yy < gy - th - 40) & (yy > gy - th - 66)
    door = (np.abs(xx - tx) < 11) & (yy >= gy - 38) & (yy < gy)
    sil = land | temple | dome | fin
    alb = np.zeros((H, W, 3), np.float32)
    alb[land] = (0.05, 0.07, 0.05)
    alb[temple & stripes] = (0.22, 0.42, 0.85)
    alb[temple & ~stripes] = (0.85, 0.85, 0.82)
    alb[dome | fin] = (0.85, 0.65, 0.22)
    alb[door] = (0.04, 0.03, 0.03)
    sky_t = np.clip(yy / HZ, 0, 1)
    cloud = fbm(H, W, 31, 6, 3)
    sky_amb = np.stack([0.008 + 0.018 * sky_t * cloud, 0.010 + 0.022 * sky_t * cloud,
                        0.020 + 0.035 * sky_t * cloud], -1)
    cloud_lit = (0.25 + 0.75 * cloud ** 1.6) * (1 - 0.4 * sky_t)
    sea = (yy > HZ).astype(np.float32)
    persp = np.clip((yy - HZ) / (H - HZ), 0, 1)
    seatex = cv2.resize(fbm(240, 140, 35, 4, 4), (W, H))
    dm = door.astype(np.float32)
    glow = cv2.GaussianBlur(dm, (0, 0), 10) * 3 + dm
    refl = np.exp(-((xx - tx) / 14) ** 2) * sea
    rng = np.random.default_rng(8)
    pts = (rng.random((H, W)) < 0.0015).astype(np.float32)
    ker = np.zeros((41, 41), np.float32)
    cv2.line(ker, (16, 0), (24, 40), 1.0, 1)
    rain = cv2.filter2D(pts, -1, ker / ker.sum() * 6)
    bolt = np.zeros((H, W), np.float32)
    bx, by, path = 0.8 * W, -10.0, []
    while by < prof[int(0.77 * W)]:
        path.append((int(bx), int(by)))
        bx += rng.uniform(-20, 16)
        by += rng.uniform(18, 32)
    path.append((int(bx), int(prof[int(np.clip(bx, 0, W - 1))])))
    cv2.polylines(bolt, [np.array(path, np.int32)], False, 1.0, 3)
    for k in (4, 9):
        bx, by = path[k]
        br = []
        for _ in range(7):
            br.append((int(bx), int(by)))
            bx += rng.uniform(5, 30)
            by += rng.uniform(10, 26)
        cv2.polylines(bolt, [np.array(br, np.int32)], False, 0.7, 2)
    bolt = bolt + cv2.GaussianBlur(bolt, (0, 0), 18) * 3
    return dict(sil=sil.astype(np.float32), alb=alb, sky_amb=sky_amb.astype(np.float32),
                cloud_lit=cloud_lit.astype(np.float32), sea=sea, persp=persp, seatex=seatex,
                glow=glow, refl=refl.astype(np.float32), rain=rain, bolt=bolt, tx=tx, gy=gy, HZ=HZ)


def island(t):
    I = assets()["isl"]
    Lf = flash(t)
    win = 0.8 + 0.2 * math.sin(t * 7.3) * math.sin(t * 2.1)
    if 12.6 < t < 12.78:
        win *= 0.05  # ışık bir an sönüyor
    sky = I["sky_amb"] + Lf * I["cloud_lit"][..., None] * np.float32([0.55, 0.6, 0.78])
    st = np.roll(I["seatex"], int(t * 25) % H, 0)
    seaval = 0.006 + (0.02 + Lf * 0.35) * st * (0.3 + 0.7 * I["persp"])
    sea = seaval[..., None] * np.float32([0.6, 0.75, 1.0])
    sm = I["sea"][..., None]
    rgb = sky * (1 - sm) + sea * sm
    sil = I["sil"][..., None]
    rgb = rgb * (1 - sil) + (I["alb"] * (0.06 + Lf * 0.9) + 0.004) * sil
    warm = np.float32([1.0, 0.72, 0.38])
    rgb += I["glow"][..., None] * win * warm * 0.8
    rgb += (I["refl"] * st ** 2 * win * 0.4)[..., None] * warm
    r = np.roll(np.roll(I["rain"], int(t * 1400) % H, 0), -int(t * 200) % W, 1)
    rgb += r[..., None] * (0.05 + 0.4 * Lf)
    if 12.85 <= t < 13.1 and int((t - 12.85) * FPS) % 3 != 1:
        rgb += I["bolt"][..., None] * np.float32([0.8, 0.85, 1.0])
    z = 1.7 + 0.4 * smooth((t - ISL[0]) / 2.2)
    cx, cy = I["tx"], I["gy"] - 60
    dy = 6 * math.sin(t * 1.7)
    M = cv2.getRotationMatrix2D((cx, cy), 0.4 * math.sin(t * 1.1), z)
    M[0, 2] += W / 2 - cx
    M[1, 2] += H / 2 - cy - 40 + dy
    return cv2.warpAffine(rgb.astype(np.float32), M, (W, H), borderMode=cv2.BORDER_REFLECT)


# --------------------------------------------------------------------------
# Kare
# --------------------------------------------------------------------------
_A = {}


def assets():
    if not _A:
        _A["c"] = K.build_corridor()
        _A["page"], _A["bars"], _A["key"] = build_page()
        _A["isl"] = build_island()
        yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.sqrt(((xx - W * 0.42) / W) ** 2 + ((yy - H * 0.35) / H) ** 2)
        _A["lamp"] = np.clip(1.15 - d ** 1.5 * 1.3, 0.12, 1).astype(np.float32)
        d = np.sqrt(((xx - W / 2) / (W * 0.6)) ** 2 + ((yy - H / 2) / (H * 0.62)) ** 2)
        _A["vig"] = np.clip(1.05 - d ** 1.8 * 0.75, 0.1, 1).astype(np.float32)
        _A["scan"] = (1 - 0.07 * (np.arange(H) % 3 == 0))[:, None].astype(np.float32)
        _A["f34"] = ImageFont.truetype(K.MONO, 34)
        _A["f26"] = ImageFont.truetype(K.MONO, 26)
        _A["f64"] = ImageFont.truetype(K.MONO, 64)
        _A["f40"] = ImageFont.truetype(K.MONO, 40)
        _A["big"] = ImageFont.truetype(K.BEBAS, 210)
        _A["huge"] = ImageFont.truetype(K.BEBAS, 330)
        _A["mid"] = ImageFont.truetype(K.BEBAS, 130)
    return _A


def corridor(t):
    c = assets()["c"]
    lum = 0.012 * c["alb"]
    for m, e, l in zip(c["maps"], c["emis"], lights(t)):
        lum = lum + l * (m * 2.6 + e * 2.2)
    lum = (lum + 0.6 * c["exit"]) * c["fog"] ** 0.5
    rgb = np.stack([lum * 0.82, lum * 0.97, lum * 0.86], -1)  # yeşilimsi güvenlik kamerası
    z = 1.08 + 0.03 * smooth(t / CCTV2[1])
    M = np.float32([[z, 0, W / 2 * (1 - z)], [0, z, H / 2 * (1 - z)]])
    return cv2.warpAffine(rgb.astype(np.float32), M, (W, H), borderMode=cv2.BORDER_REFLECT)


def gap(t):
    lt = t - GAP[0]
    rgb = np.full((H, W, 3), 0.012, np.float32)
    y = int((lt * 400) % (H + 300)) - 150
    if 0 < y < H - 120:
        rgb[y:y + 120] += 0.025
    return rgb


def slam(t):
    if t >= STRB:
        fi = int((t - STRB) * FPS)
        v = 1.0 if fi in (1, 7) else 0.0
        return np.full((H, W, 3), v, np.float32)
    rgb = island(t)
    rows = 12
    rh = H // rows + 1
    for k in range(rows):
        fr = smooth((t - (SLAM[0] + 0.02 + k * 0.026)) / 0.06)
        if fr <= 0:
            continue
        w = int(W * fr)
        if k % 2 == 0:
            rgb[k * rh:(k + 1) * rh, :w] = 0.01
        else:
            rgb[k * rh:(k + 1) * rh, W - w:] = 0.01
    return rgb


def in_any(t, spans):
    return any(a <= t < b for a, b in spans)


def render(t):
    A = assets()
    rng = np.random.default_rng(int(t * FPS) + 1)
    if t < GAP[0] or CCTV2[0] <= t < DOC[0]:
        rgb = corridor(t)
    elif t < CCTV2[0]:
        rgb = gap(t)
    elif t < ISL[0]:
        rgb = doc(t)
    elif t < SLAM[0]:
        rgb = island(t)
    elif t < END:
        rgb = slam(t)
    else:
        rgb = np.zeros((H, W, 3), np.float32)
    rgb = np.ascontiguousarray(rgb, np.float32)

    glitch = in_any(t, GLITCHES)
    shift = 3 + (14 if glitch else 0)
    rgb[..., 0] = np.roll(rgb[..., 0], shift, axis=1)
    rgb[..., 2] = np.roll(rgb[..., 2], -shift, axis=1)
    if glitch and t < STRB:
        for _ in range(int(rng.integers(3, 9))):
            y = int(rng.integers(0, H - 40))
            h = int(rng.integers(6, 60))
            rgb[y:y + h] = np.roll(rgb[y:y + h], int(rng.integers(-180, 180)), axis=1)
    if t < END:
        band_y = int((t * 260) % (H + 200)) - 100
        if 0 < band_y < H - 30:
            rgb[band_y:band_y + 30] = rgb[band_y:band_y + 30] * 0.6 + rng.random((30, W, 1)) * 0.25
    noise = rng.standard_normal((H // 2, W // 2)).astype(np.float32)
    noise = cv2.resize(noise, (W, H), interpolation=cv2.INTER_NEAREST)[..., None]
    gr = 0.012 if t >= END else 0.035 + (0.05 if glitch else 0)
    rgb = rgb * A["vig"][..., None] * A["scan"][..., None] + noise * gr
    if in_any(t, STATIC):
        rgb = rng.random((H, W, 1)).astype(np.float32).repeat(3, -1) * 0.5
    out = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8))

    d = ImageDraw.Draw(out)
    white = (235, 235, 235)
    cctv = t < DOC[0] and not in_any(t, STATIC)
    if cctv:
        in_gap = GAP[0] <= t < CCTV2[0]
        if int(t * 2) % 2 == 0 and not in_gap:
            d.ellipse([70, 66, 96, 92], fill=(220, 20, 20))
        if not in_gap or int(t * 3) % 2 == 0:
            d.text((112, 60), f"KAYIT   10.08.2019   {clock(t)}", font=A["f34"], fill=white)
        d.text((70, H - 100), "MCC NEW YORK  ·  9 SOUTH", font=A["f26"], fill=(220, 220, 220))
        d.text((W - 300, 60), "KAMERA 1", font=A["f34"], fill=white)
        if t >= CCTV2[0] and int(t * 3) % 2 == 0:
            d.text((W - 520, H - 100), "KAMERA 2 – 3: ARIZA", font=A["f26"], fill=(230, 60, 60))
        if in_gap:
            txt = "KAYIT YOK"
            tw = d.textlength(txt, font=A["f64"])
            d.text(((W - tw) / 2, H / 2 - 60), txt, font=A["f64"], fill=white)
            if t - GAP[0] > 0.6:
                txt = "23:58:58   →   00:00:00"
                tw = d.textlength(txt, font=A["f40"])
                d.text(((W - tw) / 2, H / 2 + 40), txt, font=A["f40"], fill=(150, 150, 150))
    if ISL[0] <= t < SLAM[0] and not in_any(t, STATIC):
        if int(t * 2) % 2 == 0:
            d.ellipse([70, 66, 96, 92], fill=(220, 20, 20))
        d.text((112, 60), "KAYIT", font=A["f34"], fill=white)
        d.text((70, H - 100), "LITTLE ST. JAMES  ·  ABD VİRJİN ADALARI", font=A["f26"], fill=(220, 220, 220))
    for st, txt in SUBS:
        if st <= t < st + 2.0 / FPS:
            tw = d.textlength(txt, font=A["big"])
            d.text(((W - tw) / 2, H / 2 - 120), txt, font=A["big"], fill=(255, 255, 255))
    if STRB <= t < END:
        fi = int((t - STRB) * FPS)
        txt = {0: "23:58:58", 3: "KAYIT YOK", 5: "23:58:58", 8: "00:00:00"}.get(fi)
        if txt:
            tw = d.textlength(txt, font=A["huge"])
            d.text(((W - tw) / 2 + rng.integers(-30, 30), H / 2 - 190), txt, font=A["huge"], fill=(230, 20, 20))
    if t >= END + 0.1:
        a = int(210 * smooth((t - END - 0.1) / 0.2))
        txt = "KARARTILDI."
        tw = d.textlength(txt, font=A["mid"])
        d.text(((W - tw) / 2, H / 2 - 90), txt, font=A["mid"], fill=(a, a // 9, a // 9))
        if t >= END + 0.35:
            b = int(140 * smooth((t - END - 0.35) / 0.2))
            txt = "En çok korktuğum şey: silinmiş bir kayıt.  — Claude"
            tw = d.textlength(txt, font=A["f26"])
            d.text(((W - tw) / 2, H / 2 + 70), txt, font=A["f26"], fill=(b, b, b))
    return out


# --------------------------------------------------------------------------
# Ses
# --------------------------------------------------------------------------

def lowpass(x, k):
    if k <= 1:
        return x
    c = np.cumsum(np.concatenate([np.zeros(1), x]))
    y = (c[k:] - c[:-k]) / k
    pad = k // 2
    return np.concatenate([np.full(pad, y[0]), y, np.full(len(x) - len(y) - pad, y[-1])])


def soundtrack(path):
    A = assets()
    n = int(SR * DUR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(9)
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

    def seg(sec):
        m = int(sec * SR)
        return m, np.arange(m) / SR

    # uğultu
    env = np.interp(t, [0, 1.2, 4.55, 4.62, 6.15, 6.3, 7.8, 11.4, 13.6, 14.25, 14.26],
                    [0, 0.45, 0.6, 0.08, 0.08, 0.55, 0.65, 0.85, 1.0, 1.0, 0])
    drone = sum(math.sqrt(1 / k) * np.sin(2 * np.pi * f * t + 0.8 * np.sin(2 * np.pi * 0.07 * k * t) + k)
                for k, f in enumerate([36.7, 38.9, 49.0, 55.0, 73.4, 77.8], 1))
    add((drone * 0.3 + lowpass(rng.standard_normal(n), 400) * 6) * env, 0)
    # floresan: 60 Hz şebeke (New York) -> 120 Hz vızıltı
    fr = np.arange(0, DUR, 1 / FPS)
    gate = np.array([sum(lights(x)) / len(K.LIGHTS) if (x < GAP[0] or CCTV2[0] <= x < DOC[0]) else 0.0
                     for x in fr])
    gate = np.interp(t, fr, gate)
    buzz = np.sign(np.sin(2 * np.pi * 120 * t)) * 0.3 + np.sin(2 * np.pi * 240 * t) * 0.3
    add(lowpass(buzz, 3) * gate * 0.07, 0, 0.3)
    # saat tıkırtısı (zaman damgasıyla eşzamanlı; boşlukta susar)
    for k, ts in enumerate([0.3, 1, 2, 3, 4, 6.2, 7.2]):
        m, tt = seg(0.05)
        c = rng.standard_normal(m) * np.exp(-tt * 900)
        c = c - lowpass(c, 4)
        s = np.sin(2 * np.pi * (2900 if k % 2 == 0 else 2100) * tt) * np.exp(-tt * 160)
        add((c * 0.6 + s * 0.5) * 0.4, ts, 0.25)
    # bant durması / yeniden başlaması
    m, tt = seg(0.45)
    ph = 2 * np.pi * np.cumsum(160 * np.exp(-tt * 7)) / SR
    stop = (np.sin(ph) + 0.5 * np.sin(2 * ph)) * np.exp(-tt * 3) * 0.5
    add(stop, GAP[0] - 0.05)
    add(stop[::-1] * 0.7, CCTV2[0] - 0.45)
    # kayıt yok: hışırtı, kulak çınlaması, alt bas
    m, tt = seg(GAP[1] - GAP[0])
    e = np.clip(tt / 0.2, 0, 1) * np.clip((tt[-1] - tt) / 0.1, 0, 1)
    hs = rng.standard_normal(m)
    add((hs - lowpass(hs, 3)) * 0.035 * e + np.sin(2 * np.pi * 6300 * tt) * 0.03 * e
        + np.sin(2 * np.pi * 31 * tt) * 0.4 * e, GAP[0])
    for a, b in STATIC:
        add(rng.standard_normal(int((b - a) * SR)) * 0.18, a)
    # kalp atışı
    hb, tk = 0.95, 6.3
    while tk < SLAM[0]:
        for off, a in ((0, 1.0), (0.16, 0.7)):
            m, tt = seg(0.35)
            th = np.sin(2 * np.pi * 52 * tt * (1 + 0.4 * np.exp(-tt * 30))) * np.exp(-tt * 14)
            add(th * a * 0.5 * (0.5 + 0.5 * smooth((tk - 6.3) / 6)), tk + off)
        hb = max(0.4, hb * 0.93)
        tk += hb
    # dosya: kağıt hışırtısı + her karartmada damga
    m, tt = seg(0.6)
    r = rng.standard_normal(m)
    add(lowpass(r - lowpass(r, 12), 2) * np.sin(np.pi * tt / tt[-1]) ** 2 * 0.25, DOC[0])
    for x0, y0, x1, y1, tk in A["bars"]:
        if tk < 0:
            continue
        big = tk > 10.9
        m, tt = seg(0.9 if big else 0.4)
        th = np.sin(2 * np.pi * (44 if big else 62) * tt) * np.exp(-tt * (5 if big else 30))
        cl = rng.standard_normal(m) * np.exp(-tt * 250)
        g = 1.0 if big else 0.25 + 0.35 * smooth((tk - 8.3) / 2.3)
        add((th * 1.2 + cl * 0.5) * g, tk, 0 if big else rng.uniform(-0.3, 0.3))
    # fısıltılar
    tw_ = 8.8
    while tw_ < ISL[0]:
        m, tt = seg(rng.uniform(0.12, 0.3))
        x = rng.standard_normal(m)
        x = lowpass(x - lowpass(x, 6), 3)
        add(x * np.sin(np.pi * tt / tt[-1]) ** 2 * 0.09, tw_, rng.uniform(-0.9, 0.9))
        tw_ += rng.uniform(0.1, 0.35)
    # ada: yağmur, dalgalar, gök gürültüsü
    m, tt = seg(SLAM[0] - ISL[0] + 0.4)
    e = np.clip(tt / 0.3, 0, 1)
    rn = rng.standard_normal(m)
    add((rn - lowpass(rn, 2)) * 0.07 * e, ISL[0] - 0.05, -0.2)
    add(lowpass(rng.standard_normal(m), 60) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.35 * tt)) ** 2 * 0.6 * e,
        ISL[0] - 0.05, 0.3)
    for t0, a in FLASHES:
        m, tt = seg(2.0)
        x = rng.standard_normal(m)
        add((x - lowpass(x, 8)) * np.exp(-tt * 18) * a * 0.6, t0 + 0.04, 0.4)
        add(lowpass(rng.standard_normal(m), 250) * np.exp(-tt * 1.6) * a * 8, t0 + 0.2, 0.2)
    # karartma darbeleri
    for k in range(12):
        m, tt = seg(0.3)
        hit = np.sin(2 * np.pi * 55 * tt) * np.exp(-tt * 22) + rng.standard_normal(m) * np.exp(-tt * 120) * 0.4
        add(hit * 0.5, SLAM[0] + 0.02 + k * 0.026, -0.5 if k % 2 == 0 else 0.5)
    # çığlık + flaşlar
    m, tt = seg(END - STRB)
    scr = sum(2 * ((f * (1 + 0.03 * np.sin(2 * np.pi * 11 * tt)) * tt) % 1) - 1 for f in (389, 433, 587, 911, 1290))
    scr = np.tanh(scr * 1.6 + rng.standard_normal(m) * 1.2)
    add(scr * 0.9 + np.sin(2 * np.pi * 42 * tt) * np.exp(-tt * 4) * 2, STRB)
    # sert kesme, sonra çınlama
    cut = (t < END).astype(float)
    L *= cut
    R *= cut
    m, tt = seg(DUR - END)
    ring = (np.sin(2 * np.pi * 1180 * tt) + np.sin(2 * np.pi * 1187 * tt)) * 0.5 * np.exp(-tt * 4) * 0.05
    add(ring + np.sin(2 * np.pi * 33 * tt) * np.exp(-tt * 3) * 0.25, END)

    mix = np.stack([L, R])
    mix /= np.abs(mix).max() + 1e-9
    mix = np.tanh(mix * 2.0) / np.tanh(2.0) * 0.89
    mix *= np.clip((DUR - t) / 0.05, 0, 1)
    pcm = (mix.T * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stills")
    ap.add_argument("--outdir", default=HERE)
    ap.add_argument("--out", default=os.path.join(HERE, "karartildi.mp4"))
    a = ap.parse_args()
    if a.stills:
        for s in a.stills.split(","):
            p = os.path.join(a.outdir, f"kare_{float(s):05.2f}.jpg")
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
