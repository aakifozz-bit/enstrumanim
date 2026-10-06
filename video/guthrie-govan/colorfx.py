"""Renkli fotoğraf animasyonu: Ken Burns, 2.5D paralaks ve bulanık arka planlı
"contain" çekimleri; hafif sinematik renk, grenli doku ve vinyet.

Kişi maskesi için Atatürk v2'deki photofx.py'nin kişi bölütleme + grabCut
hattı kullanılır (yalnızca maske; renkler burada korunur).

    shot = ColorShot("media/gg_live_01.jpg", 6.0, mode="parallax", box=[x0, y0, x1, y1])
    frame = shot.render(t)   # numpy uint8 (1080, 1920, 3)
"""

import math
import os
import sys
from functools import lru_cache

import cv2
import numpy as np
from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "ataturk-hayati-v2"))
import photofx  # noqa: E402

W, H = 1920, 1080
COVER = 1.18          # hazırlanan görüntü, kadrajı bu oranda taşar (zoom payı)


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def ease_gentle(x):
    x = clamp(x)
    return 0.5 - 0.5 * math.cos(math.pi * x)


def init_worker():
    cv2.setNumThreads(1)


# --------------------------------------------------------------------------
# Renk ve doku
# --------------------------------------------------------------------------

def grade(rgb):
    """Hafif kontrast eğrisi, biraz doygunluk, sıcak ışık / serin gölge."""
    x = rgb
    lum = x @ np.float32([0.299, 0.587, 0.114])
    # S-eğrisi
    c = 0.18
    y = lum + c * (lum - 0.5) * (1 - np.abs(2 * lum - 1))
    x = x * (y / np.maximum(lum, 1e-4))[..., None]
    # doygunluk
    l2 = (x @ np.float32([0.299, 0.587, 0.114]))[..., None]
    x = l2 + (x - l2) * 1.08
    # renk tonu: gölgeler hafif camgöbeği, ışıklar hafif sıcak
    w = l2
    x = x + (1 - w) * np.float32([-0.008, 0.004, 0.012]) + w * np.float32([0.012, 0.004, -0.010])
    return np.clip(x, 0, 1).astype(np.float32)


@lru_cache(maxsize=1)
def vignette():
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H / 2) / (H * 0.72)) ** 2)
    v = 1 - 0.38 * np.clip((d - 0.55) / 0.75, 0, 1) ** 1.5
    return v[..., None].astype(np.float32)


@lru_cache(maxsize=1)
def grain_tiles():
    rng = np.random.default_rng(21)
    tiles = []
    for _ in range(6):
        n = rng.standard_normal((540, 960)).astype(np.float32)
        n = cv2.GaussianBlur(n, (0, 0), 0.6)
        n /= n.std() + 1e-6
        tiles.append(cv2.resize(n, (W, H), interpolation=cv2.INTER_LINEAR)[..., None])
    return tiles


def finish(img, t, grain=0.018):
    """img: float32 0..1 HxWx3 -> uint8, vinyet + gren."""
    out = img * vignette()
    if grain > 0:
        g = grain_tiles()[int(t * 24) % 6]
        out = out + g * grain * (0.35 + 0.65 * out)
    return (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)


# --------------------------------------------------------------------------
# Hazırlık (önbellekli)
# --------------------------------------------------------------------------

def _load_rgb(path):
    im = ImageOps.exif_transpose(Image.open(path))
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (20, 20, 22, 255))
        im = Image.alpha_composite(bg, im)
    return np.asarray(im.convert("RGB"), dtype=np.float32) / 255.0


def _resize(a, size):
    w, h = size
    interp = cv2.INTER_AREA if w < a.shape[1] else cv2.INTER_CUBIC
    return cv2.resize(a, (w, h), interpolation=interp)


@lru_cache(maxsize=6)
def prepared(path, matte=False, box=None):
    """-> (rgb, alpha|None, plate|None) kadrajı COVER oranında taşacak boyutta."""
    rgb = grade(_load_rgb(path))
    oh, ow = rgb.shape[:2]
    s = max(W * COVER / ow, H * COVER / oh)
    size = (max(W, int(round(ow * s))), max(H, int(round(oh * s))))
    img = np.clip(_resize(rgb, size), 0, 1).astype(np.float32)
    if not matte:
        return img, None, None
    prep = photofx.prepare(path, subject_box=list(box) if box else None)
    alpha = cv2.resize(prep.alpha.astype(np.float32), size, interpolation=cv2.INTER_LINEAR)
    alpha = np.clip(alpha, 0, 1)
    # arka plan: özneyi çıkar, çevresinden doldur
    hole = cv2.dilate((alpha > 0.04).astype(np.uint8), np.ones((25, 25), np.uint8))
    small = (size[0] // 3, size[1] // 3)
    valid_s = cv2.resize((1 - hole).astype(np.float32), small, interpolation=cv2.INTER_AREA)
    img_s = cv2.resize(img, small, interpolation=cv2.INTER_AREA)
    fill = np.stack([photofx.pushpull_fill(img_s[..., c], valid_s > 0.99) for c in range(3)], -1)
    fill = cv2.GaussianBlur(fill, (0, 0), 3)
    fill = cv2.resize(fill, size, interpolation=cv2.INTER_LINEAR)
    soft = cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 6)[..., None]
    plate = img * (1 - soft) + fill * soft
    return img, alpha, plate.astype(np.float32)


# --------------------------------------------------------------------------
# Çekimler
# --------------------------------------------------------------------------

def _affine(cx, cy, scale):
    """Görüntüdeki (cx, cy) piksel noktasını kadraj ortasına, verilen ölçekle getiren matris."""
    return np.float32([[scale, 0, W / 2 - scale * cx], [0, scale, H / 2 - scale * cy]])


def _clamp_center(cx, cy, scale, w, h):
    hw, hh = W / 2 / scale, H / 2 / scale
    cx = min(max(cx, hw), w - hw) if w > 2 * hw else w / 2
    cy = min(max(cy, hh), h - hh) if h > 2 * hh else h / 2
    return cx, cy


class ColorShot:
    """mode: "kenburns" | "parallax" | "contain"

    start/end = (cx, cy, zoom): normalize merkez ve yakınlaşma (1 = kadrajı tam kaplar).
    box: kişinin kutusu (kaydedilmiş dosyanın pikselleri) — paralaks maskesi için.
    """

    def __init__(self, path, duration, mode="kenburns", start=None, end=None, box=None,
                 grain=0.018, fg_extra=0.06, dof=2.2):
        self.path, self.duration, self.mode = path, duration, mode
        self.box = tuple(box) if box else None
        self.grain, self.fg_extra, self.dof = grain, fg_extra, dof
        self.start = start or (0.5, 0.45, 1.0)
        self.end = end or (0.5, 0.42, 1.10)

    def _cam(self, t):
        u = ease_gentle(t / max(self.duration, 1e-3))
        return tuple(a + (b - a) * u for a, b in zip(self.start, self.end))

    def render(self, t):
        if self.mode == "contain":
            return finish(self._contain(t), t, self.grain)
        img, alpha, plate = prepared(self.path, self.mode == "parallax",
                                     self.box if self.mode == "parallax" else None)
        h, w = img.shape[:2]
        k0 = max(W / w, H / h)
        cx, cy, z = self._cam(t)
        scale = k0 * z
        px, py = _clamp_center(cx * w, cy * h, scale, w, h)
        if self.mode != "parallax" or alpha is None:
            out = cv2.warpAffine(img, _affine(px, py, scale), (W, H), flags=cv2.INTER_LINEAR,
                                 borderMode=cv2.BORDER_REFLECT)
            return finish(out, t, self.grain)
        bg = _blurred_plate(self.path, self.box, self.dof)
        out_bg = cv2.warpAffine(bg, _affine(px, py, scale), (W, H), flags=cv2.INTER_LINEAR,
                                borderMode=cv2.BORDER_REFLECT)
        # özne biraz daha hızlı büyür; büyüme noktası öznenin tabanı
        u = ease_gentle(t / max(self.duration, 1e-3))
        fs = scale * (1 + self.fg_extra * u)
        ys, xs = np.nonzero(alpha > 0.5)
        if len(xs):
            ax, ay = (xs.min() + xs.max()) / 2, float(ys.max())
        else:
            ax, ay = w / 2, h
        # taban noktasının ekrandaki yeri arka planla aynı kalsın
        sx = W / 2 + scale * (ax - px)
        sy = H / 2 + scale * (ay - py)
        M = np.float32([[fs, 0, sx - fs * ax], [0, fs, sy - fs * ay]])
        fg = cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        a = cv2.warpAffine(alpha, M, (W, H), flags=cv2.INTER_LINEAR,
                           borderMode=cv2.BORDER_CONSTANT, borderValue=0)[..., None]
        out = out_bg * (1 - a) + fg * a
        return finish(out, t, self.grain)

    def _contain(self, t):
        """Dikey/kare fotoğraflar: bulanık, karartılmış kopya üzerinde gölgeli fotoğraf."""
        bgimg = _blurred_cover(self.path)
        u = ease_gentle(t / max(self.duration, 1e-3))
        h, w = bgimg.shape[:2]
        k0 = max(W / w, H / h) * (1.05 + 0.05 * u)
        out = cv2.warpAffine(bgimg, _affine(w / 2, h / 2, k0), (W, H), flags=cv2.INTER_LINEAR,
                             borderMode=cv2.BORDER_REFLECT)
        img, _, _ = prepared(self.path)
        ih, iw = img.shape[:2]
        cx = self.start[0] + (self.end[0] - self.start[0]) * u
        fh = H * 0.86 * (1 + 0.04 * u)
        s = min(fh / ih, W * 0.86 / iw)
        x0, y0 = W * cx - iw * s / 2, H / 2 - ih * s / 2
        M = np.float32([[s, 0, x0], [0, s, y0]])
        ph = cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR)
        m = cv2.warpAffine(np.ones((ih, iw), np.float32), M, (W, H), flags=cv2.INTER_LINEAR)
        sh = cv2.GaussianBlur(cv2.warpAffine(np.ones((ih, iw), np.float32),
                                             M + np.float32([[0, 0, 10], [0, 0, 18]]), (W, H)),
                              (0, 0), 22)[..., None]
        out = out * (1 - 0.65 * sh)
        m = m[..., None]
        return out * (1 - m) + ph * m


@lru_cache(maxsize=6)
def _blurred_plate(path, box, dof):
    _, _, plate = prepared(path, True, box)
    return cv2.GaussianBlur(plate, (0, 0), dof)


@lru_cache(maxsize=6)
def _blurred_cover(path):
    img, _, _ = prepared(path)
    small = cv2.resize(img, (img.shape[1] // 4, img.shape[0] // 4), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (0, 0), 9)
    small = small * 0.42
    return cv2.resize(small, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_LINEAR)
