#!/usr/bin/env python3
"""photofx - archival photo animation toolkit (Atatürk v2 video).

Turns still (black-and-white) photographs into 1920x1080 animated shots in the
style of Turkish history explainer channels:

* ``parallax``  - subject cut out and moved separately from a clean background
                  plate (2.5D camera push, depth-of-field on the background)
* ``kenburns``  - eased zoom/pan between two framings
* ``print``     - the photo as a physical print sliding onto a dark desk
                  (white or deckled border, tape, drop shadow, caption)

Every mode shares the same archival look (sepia/BW toning, film grain cycled
from pre-generated tiles, dust, scratches, light flicker, gate weave,
vignette) and there is a reusable ``lower_third`` caption overlay.

Quick use::

    import photofx as fx
    shot = fx.PhotoShot("foto.jpg", 5.0, mode="parallax", subject_box=(0.2, 0.05, 0.8, 1.0))
    img = shot.render(2.5)                      # PIL RGB 1920x1080
    img = fx.lower_third(img, "Mustafa Kemal", "Selanik, 1881", t=1.2)

    # Compositor that crossfades shots: blend pre-look luminance, grade once
    lum = (1 - a) * shot_a.render_lum(ta) + a * shot_b.render_lum(tb)
    img = fx.Look().apply(lum, t_global)

    # Pool workers: Pool(4, initializer=fx.init_worker)

CLI::

    python3 photofx.py --demo [--out DIR]       # stills + mp4 previews per mode

Importing has no side effects.  Heavy preparation (grading, upscale, matte,
clean plate) is cached in memory per process (lru_cache) and on disk
(``$PHOTOFX_CACHE`` or <tmp>/photofx-cache), so Pool workers do it at most once.
Requirements: numpy, Pillow, opencv-python-headless (scikit-image for --demo).
"""

import argparse
import hashlib
import math
import os
import subprocess
import sys
import tempfile
import time
import warnings
from functools import lru_cache

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

W, H, FPS = 1920, 1080, 30
HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, "..", "ataturk-hayati", "fonts")
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

PREP_VERSION = 3
MIN_COVER = 1.3     # prepared photos are at least this much larger than a cover-fit frame
MAX_LONG = 3600     # ...and are downscaled above this long side
GC_LONG = 640       # grabCut working resolution (long side)
DEFAULT_BOX = (0.14, 0.04, 0.86, 1.0)   # portrait default subject box (fractions)


def init_worker():
    """Pool initializer: keep OpenCV single-threaded inside each worker process."""
    cv2.setNumThreads(1)


# --------------------------------------------------------------------------
# Small helpers (same conventions as v1 generate.py)
# --------------------------------------------------------------------------

def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def lerp(a, b, u):
    return a + (b - a) * u


def smooth(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def ease_out(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    x = clamp(x)
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def ease_sine(x):
    x = clamp(x)
    return 0.5 - 0.5 * math.cos(math.pi * x)


def ease_gentle(x):
    """Half linear, half sine in/out: starts and ends softly but never stops."""
    x = clamp(x)
    return 0.5 * x + 0.5 * ease_sine(x)


EASES = {"linear": clamp, "inout": ease_in_out, "sine": ease_sine,
         "gentle": ease_gentle, "out": ease_out, "smooth": smooth}


def _ease(name):
    return name if callable(name) else EASES[name]


@lru_cache(maxsize=None)
def font(face, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, FONTS[face]), size)


@lru_cache(maxsize=512)
def text_img(text, face, size, color, tracking=0, shadow=0.7):
    """RGBA text sprite with a soft drop shadow -> (image, pad, text_width)."""
    f = font(face, size)
    asc, desc = f.getmetrics()
    widths = [f.getlength(c) for c in text] if tracking else None
    tw = sum(widths) + tracking * (len(text) - 1) if tracking else f.getlength(text)
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
    if shadow:
        sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
        blur = im.getchannel("A").filter(ImageFilter.GaussianBlur(size * 0.08 + 2))
        sh.putalpha(blur.point(lambda v: int(v * shadow)))
        im = Image.alpha_composite(sh, im)
    return im, pad, tw


def _gauss(x, sigma):
    if sigma <= 0.05:
        return x
    return cv2.GaussianBlur(x, (0, 0), sigma, borderType=cv2.BORDER_REFLECT)


def _disk(r):
    r = max(1, int(round(r)))
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def _resize(a, size):
    """High quality resize of a float32 array to size=(w, h)."""
    w, h = size
    if (a.shape[1], a.shape[0]) == (w, h):
        return a
    down = w < a.shape[1]
    return cv2.resize(a, (w, h), interpolation=cv2.INTER_AREA if down else cv2.INTER_CUBIC)


def _box(x, r):
    return cv2.boxFilter(x, -1, (2 * r + 1, 2 * r + 1), borderType=cv2.BORDER_REFLECT)


def guided_filter(I, p, r, eps):
    """He et al. guided filter (grey guide): edge-aware smoothing of p along I."""
    mI, mp = _box(I, r), _box(p, r)
    cov = _box(I * p, r) - mI * mp
    var = _box(I * I, r) - mI * mI
    a = cov / (var + eps)
    b = mp - a * mI
    return _box(a, r) * I + _box(b, r)


def pushpull_fill(img, valid):
    """Fill pixels where ``valid`` is 0 with a smooth extension of the valid ones."""
    v = valid.astype(np.float32)
    pyr = [(img * v, v)]
    while min(pyr[-1][1].shape) > 3:
        n, d = pyr[-1]
        size = ((d.shape[1] + 1) // 2, (d.shape[0] + 1) // 2)
        pyr.append((cv2.resize(n, size, interpolation=cv2.INTER_AREA),
                    cv2.resize(d, size, interpolation=cv2.INTER_AREA)))
    n, d = pyr[-1]
    mean = float(n.sum() / max(d.sum(), 1e-6))
    est = np.where(d > 1e-4, n / np.maximum(d, 1e-4), mean).astype(np.float32)
    for n, d in reversed(pyr[:-1]):
        up = cv2.resize(est, (d.shape[1], d.shape[0]), interpolation=cv2.INTER_LINEAR)
        wgt = np.clip(d * 3.0, 0, 1)
        est = (n / np.maximum(d, 1e-4)) * wgt + up * (1 - wgt)
    return est.astype(np.float32)


# --------------------------------------------------------------------------
# Preparation: grade, upscale, matte, clean plate  (cached)
# --------------------------------------------------------------------------

class Prep:
    """Prepared photo.  All arrays float32 HxW in 0..1 at the prepared resolution.

    lum    graded monochrome photo
    alpha  subject matte (None if matte=False)
    fg     subject luminance, edge band decontaminated (no background halo)
    plate  clean background with the subject removed and filled
    box    subject bounding box (x0, y0, x1, y1) in prepared pixels
    """

    def __init__(self, lum, alpha=None, fg=None, plate=None):
        self.lum, self.alpha, self.fg, self.plate = lum, alpha, fg, plate
        self.box = None
        if alpha is not None:
            ys, xs = np.nonzero(alpha > 0.5)
            if len(xs):
                self.box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)

    @property
    def size(self):
        return self.lum.shape[1], self.lum.shape[0]

    def anchor(self):
        """Normalised point the camera should aim at: the subject's head area."""
        w, h = self.size
        if self.box is None:
            return 0.5, 0.42
        x0, y0, x1, y1 = self.box
        bh = y1 - y0
        return ((x0 + x1) / 2 / w, (y0 + min(bh * 0.28, 0.45 * (x1 - x0) + 0.0)) / h)


def _load_rgb(path):
    im = ImageOps.exif_transpose(Image.open(path))
    if im.mode in ("I;16", "I;16B", "I;16L", "I"):
        a = np.asarray(im, dtype=np.float32)
        a = a / (65535.0 if a.max() > 255 else 255.0)
        return np.repeat((a * 255 + 0.5).clip(0, 255).astype(np.uint8)[..., None], 3, 2)
    if im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im)
    return np.asarray(im.convert("RGB"))


def _is_gray(rgb):
    s = rgb[::4, ::4].astype(np.int16)
    return float(np.abs(s[..., 0] - s[..., 1]).mean() + np.abs(s[..., 1] - s[..., 2]).mean()) < 8


def grade(lum, contrast=0.22, mid=0.46):
    """Auto-levels + midtone placement + gentle S-curve on a 0..1 luminance array."""
    s = lum[::3, ::3]
    lo, hi = np.percentile(s, (0.35, 99.65))
    l = np.clip((lum - lo) / max(hi - lo, 1e-3), 0, 1)
    med = float(np.median(np.clip((s - lo) / max(hi - lo, 1e-3), 0, 1)))
    g = clamp(math.log(mid) / math.log(clamp(med, 0.05, 0.95)), 0.72, 1.4)
    l = l ** g
    l = l + contrast * (l * l * (3 - 2 * l) - l)
    return l.astype(np.float32)


def _upscale(lum, s):
    """Clean upscale: Lanczos in <=2x steps, mild unsharp mask after each step."""
    h, w = lum.shape
    tw, th = int(round(w * s)), int(round(h * s))
    cur = lum
    while cur.shape[1] < tw:
        f = min(2.0, tw / cur.shape[1])
        nw, nh = (tw, th) if f < 2.0 else (cur.shape[1] * 2, cur.shape[0] * 2)
        nw, nh = min(nw, tw), min(nh, th)
        cur = cv2.resize(cur, (nw, nh), interpolation=cv2.INTER_LANCZOS4)
        blur = _gauss(cur, 1.1)
        d = cur - blur
        # soft threshold so flat areas/noise are not sharpened
        d = d * np.clip(np.abs(d) / 0.012, 0, 1)
        cur = np.clip(cur + 0.55 * d, 0, 1)
    return cur.astype(np.float32)


def _box_px(box, w, h):
    if box is None:
        box = DEFAULT_BOX
    x0, y0, x1, y1 = box
    if max(abs(v) for v in box) <= 1.0:
        x0, x1, y0, y1 = x0 * w, x1 * w, y0 * h, y1 * h
    x0, x1 = sorted((clamp(x0, 0, w), clamp(x1, 0, w)))
    y0, y1 = sorted((clamp(y0, 0, h), clamp(y1, 0, h)))
    return x0 / w, y0 / h, x1 / w, y1 / h       # normalised


def _grabcut(rgb, lum, nbox, iters=6):
    """Binary subject mask at a reduced resolution (long side GC_LONG)."""
    h, w = lum.shape
    k = min(1.0, GC_LONG / max(w, h))
    sw, sh = max(8, int(round(w * k))), max(8, int(round(h * k)))
    if _is_gray(rgb):
        l = cv2.resize(lum, (sw, sh), interpolation=cv2.INTER_AREA)
        b = _gauss(l, 2.0)
        sd = np.sqrt(np.maximum(_gauss(l * l, 2.0) - b * b, 0))
        sd = np.clip(sd / (np.percentile(sd, 99) + 1e-6), 0, 1)
        feat = (np.dstack([l, b, sd]) * 255 + 0.5).astype(np.uint8)   # luminance + texture
    else:
        feat = cv2.resize(rgb, (sw, sh), interpolation=cv2.INTER_AREA)[..., ::-1].copy()
    x0, y0, x1, y1 = nbox
    rx0, ry0 = int(x0 * sw), int(y0 * sh)
    rx1, ry1 = int(math.ceil(x1 * sw)), int(math.ceil(y1 * sh))
    mask = np.full((sh, sw), cv2.GC_BGD, np.uint8)
    mask[ry0:ry1, rx0:rx1] = cv2.GC_PR_FGD
    # the central core of the box is very likely subject
    cx0, cx1 = int(lerp(rx0, rx1, 0.40)), int(lerp(rx0, rx1, 0.60))
    cy0, cy1 = int(lerp(ry0, ry1, 0.30)), int(lerp(ry0, ry1, 0.55))
    mask[cy0:cy1, cx0:cx1] = cv2.GC_FGD
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.setRNGSeed(1)
    cv2.grabCut(feat, mask, None, bgd, fgd, iters, cv2.GC_INIT_WITH_MASK)
    m = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8)
    return m, (rx0, ry0, rx1, ry1)


def _clean_mask(m):
    """Remove specks, keep the main component(s), fill small holes."""
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, _disk(1))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, _disk(2))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    if n > 1:
        areas = stats[1:, cv2.CC_STAT_AREA]
        keep = 1 + np.nonzero(areas >= 0.12 * areas.max())[0]
        m = np.isin(lab, keep).astype(np.uint8)
    inv = (1 - m).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    hh, ww = m.shape
    limit = 0.003 * hh * ww
    for i in range(1, n):
        x, y, bw, bh, a = stats[i]
        touches = x == 0 or y == 0 or x + bw == ww or y + bh == hh
        if not touches and a < limit:
            m[lab == i] = 1
    return m


def _refine(hard_small, lum):
    """Upsample a low-res hard mask and snap it to image edges -> soft alpha."""
    h, w = lum.shape
    sc = w / hard_small.shape[1]
    m = cv2.resize(hard_small.astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR)
    m = (_gauss(m, 0.5 * sc) > 0.5).astype(np.float32)
    r = int(round(1.4 * sc)) + 2
    a = guided_filter(lum, m, r, 1.5e-3)
    a = np.clip((a - 0.5) * 1.35 + 0.5, 0, 1)
    band = max(2, int(round(1.6 * sc)))
    sure_fg = cv2.erode(m, _disk(band)) > 0.5
    sure_bg = cv2.dilate(m, _disk(band)) < 0.5
    a[sure_fg] = 1.0
    a[sure_bg] = 0.0
    return a


def _finish_alpha(a, long_side):
    """Choke ~1px and feather so edges never carry a background halo."""
    k = long_side / 2000.0
    a = cv2.erode(a, _disk(max(1, round(1.0 * k))))
    return np.clip(_gauss(a, 0.9 * k + 0.3), 0, 1).astype(np.float32)


def _decontaminate(lum, a, long_side):
    """Edge band takes the subject's own (extended) tones instead of background."""
    k = long_side / 2000.0
    core = cv2.erode((a > 0.97).astype(np.uint8), _disk(max(1, round(1.5 * k))))
    if core.sum() < 50:
        return lum.copy()
    ext = pushpull_fill(lum, core)
    wgt = np.clip((a - 0.55) / 0.42, 0, 1)
    wgt = wgt * wgt * (3 - 2 * wgt)
    wgt[core > 0] = 1.0
    return (ext + wgt * (lum - ext)).astype(np.float32)


def _clean_plate(lum, a, long_side):
    """Background with the subject (plus safety margin) removed and filled."""
    h, w = lum.shape
    grow = max(3, int(round(long_side * 0.014)))
    hole = cv2.dilate((a > 0.02).astype(np.uint8), _disk(grow))
    k = min(1.0, 720 / max(w, h))
    sw, sh = max(8, int(w * k)), max(8, int(h * k))
    small = cv2.resize(lum, (sw, sh), interpolation=cv2.INTER_AREA)
    hs = (cv2.resize(hole.astype(np.float32), (sw, sh), interpolation=cv2.INTER_AREA) > 0.01)
    hs = cv2.dilate(hs.astype(np.uint8), _disk(2))
    # smooth fill first (push-pull), then Telea to continue nearby structure
    pp = pushpull_fill(small, 1 - hs)
    tel = cv2.inpaint((small * 65535).astype(np.uint16).astype(np.float32) / 65535.0,
                      hs, 9, cv2.INPAINT_TELEA)
    fill_s = _gauss(0.55 * tel + 0.45 * pp, 1.2)
    fill = cv2.resize(fill_s, (w, h), interpolation=cv2.INTER_CUBIC)
    # re-inject fine texture measured around the hole so the fill is not plasticky
    ring = (cv2.dilate(hole, _disk(grow)) > 0) & (hole == 0)
    hf = lum - _gauss(lum, 2.0)
    tex = float(np.std(hf[ring])) if ring.any() else 0.0
    if tex > 1e-4:
        rng = np.random.default_rng(5)
        n = _gauss(rng.standard_normal((h, w)).astype(np.float32), 1.0)
        fill = fill + n * (tex / (np.std(n) + 1e-6)) * 0.8
    soft = _gauss(hole.astype(np.float32), grow * 0.35)
    soft = np.clip(soft * 1.6, 0, 1)
    return np.clip(lum + soft * (fill - lum), 0, 1).astype(np.float32)


def _cache_dir(cache_dir=None):
    d = cache_dir or os.environ.get("PHOTOFX_CACHE") or os.path.join(tempfile.gettempdir(),
                                                                     "photofx-cache")
    os.makedirs(d, exist_ok=True)
    return d


def _file_hash(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def prepare(path, mask_path=None, subject_box=None, matte=True, cache_dir=None):
    """Load, grade, upscale and (optionally) matte a photo.  Returns a ``Prep``.

    path         image file (any Pillow format; colour is converted to mono)
    mask_path    optional subject mask image (white = subject); used as-is
                 (resized, lightly snapped to edges and feathered)
    subject_box  (x0, y0, x1, y1) box around the subject for grabCut, either as
                 fractions of the image (all values <= 1) or original pixels.
                 Default: a central portrait box DEFAULT_BOX.
    matte        False skips matte/plate (enough for kenburns/print)

    Results are cached per process and on disk (keyed by file contents).
    """
    box = None if subject_box is None else tuple(float(v) for v in subject_box)
    return _prepare(os.path.abspath(path), _file_hash(path),
                    os.path.abspath(mask_path) if mask_path else None,
                    _file_hash(mask_path) if mask_path else None,
                    box, bool(matte), cache_dir)


@lru_cache(maxsize=8)
def _prepare(path, fhash, mask_path, mhash, box, matte, cache_dir):
    key = hashlib.sha1(repr((PREP_VERSION, fhash, mhash, box, matte, MIN_COVER, MAX_LONG,
                             W, H)).encode()).hexdigest()[:20]
    stem = os.path.splitext(os.path.basename(path))[0]
    cpath = os.path.join(_cache_dir(cache_dir), f"{stem}-{key}.npz")
    if os.path.exists(cpath):
        try:
            z = np.load(cpath)
            get = lambda n: z[n].astype(np.float32) if n in z.files else None
            return Prep(get("lum"), get("alpha"), get("fg"), get("plate"))
        except Exception:
            pass
    prep = _compute_prep(path, mask_path, box, matte)
    tmp = f"{cpath}.{os.getpid()}.tmp.npz"
    arrays = {n: getattr(prep, n).astype(np.float16)
              for n in ("lum", "alpha", "fg", "plate") if getattr(prep, n) is not None}
    np.savez(tmp, **arrays)
    os.replace(tmp, cpath)
    return prep


def _compute_prep(path, mask_path, box, matte):
    rgb = _load_rgb(path)
    oh, ow = rgb.shape[:2]
    lum0 = (rgb.astype(np.float32) @ np.float32([0.299, 0.587, 0.114])) / 255.0
    lum0 = grade(lum0)
    s = max(W * MIN_COVER / ow, H * MIN_COVER / oh)
    if s > 1.0:
        lum = _upscale(lum0, s)
    elif max(ow, oh) > MAX_LONG:
        k = MAX_LONG / max(ow, oh)
        lum = cv2.resize(lum0, (int(ow * k), int(oh * k)), interpolation=cv2.INTER_AREA)
    else:
        lum = lum0
    if not matte:
        return Prep(lum)
    h, w = lum.shape
    long_side = max(w, h)
    if mask_path:
        m = np.asarray(ImageOps.exif_transpose(Image.open(mask_path)).convert("L"),
                       dtype=np.float32) / 255.0
        m = cv2.resize(m, (w, h), interpolation=cv2.INTER_LINEAR)
        hard = (m > 0.5).astype(np.uint8)
        k = GC_LONG / long_side
        small = cv2.resize(hard.astype(np.float32), (max(8, int(w * k)), max(8, int(h * k))),
                           interpolation=cv2.INTER_AREA) > 0.5
        a = _refine(small.astype(np.uint8), lum)
        # a soft hand-made matte is trusted where it is clearly decided
        a = np.where((m > 0.98) | (m < 0.02), m, a).astype(np.float32)
    else:
        nbox = _box_px(box, ow, oh)
        small, _ = _grabcut(rgb, lum0 if s > 1.0 else
                            cv2.resize(lum, (ow, oh), interpolation=cv2.INTER_AREA), nbox)
        small = _clean_mask(small)
        frac = small.mean()
        if frac < 0.01:
            warnings.warn(f"photofx: grabCut found no subject in {path}; "
                          "pass subject_box= or mask_path=")
        a = _refine(small, lum)
    a = _finish_alpha(a, long_side)
    fg = _decontaminate(lum, a, long_side)
    plate = _clean_plate(lum, a, long_side)
    return Prep(lum, a, fg, plate)


# --------------------------------------------------------------------------
# Archival look
# --------------------------------------------------------------------------

GRAIN_T = 1024
GRAIN_N = 6
_I8 = 32.0          # int8 grain units per standard deviation


def _wrap_blur(a, sigma):
    p = int(math.ceil(sigma * 4)) + 1
    b = np.pad(a, p, mode="wrap")
    return _gauss(b, sigma)[p:-p, p:-p]


@lru_cache(maxsize=2)
def _grain_tiles(seed=11):
    """Small set of seamless film-grain tiles (int8), pre-tiled for wrap slicing."""
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(GRAIN_N):
        fine = _wrap_blur(rng.standard_normal((GRAIN_T, GRAIN_T)).astype(np.float32), 0.6)
        coarse = _wrap_blur(rng.standard_normal((GRAIN_T, GRAIN_T)).astype(np.float32), 1.5)
        g = fine / fine.std() * 0.8 + coarse / coarse.std() * 0.45
        g = np.clip(g / g.std() * _I8, -127, 127).astype(np.int8)
        out.append(np.tile(g, (2, 3))[:GRAIN_T + H, :GRAIN_T + W].copy())
    return out


@lru_cache(maxsize=4)
def _vignette(strength, cy=0.48):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H * cy) / (H * 0.72)) ** 2)
    u = np.clip((r - 0.45) / 0.85, 0, 1)
    return (1 - strength * u * u * (3 - 2 * u)).astype(np.float32)


@lru_cache(maxsize=1)
def _dust_sprites():
    """Specks and hairs (float32 opacity maps), drawn supersampled."""
    rng = np.random.default_rng(1234)
    sprites = []
    ss = 4
    for i in range(18):
        r = rng.uniform(0.7, 2.8) if i < 14 else rng.uniform(3, 5)
        n = int(math.ceil(r * 2 + 6))
        im = Image.new("L", (n * ss, n * ss), 0)
        ang = np.linspace(0, 2 * math.pi, 9, endpoint=False)
        rad = r * ss * rng.uniform(0.6, 1.25, 9)
        c = n * ss / 2
        ImageDraw.Draw(im).polygon([(c + q * math.cos(t), c + q * math.sin(t))
                                    for q, t in zip(rad, ang)], fill=255)
        im = im.filter(ImageFilter.GaussianBlur(ss * 0.5)).resize((n, n), Image.LANCZOS)
        sprites.append(("speck", np.asarray(im, np.float32) / 255))
    for i in range(8):
        L = rng.uniform(20, 75)
        n = int(L + 10)
        im = Image.new("L", (n * ss, n * ss), 0)
        d = ImageDraw.Draw(im)
        p = np.array([n * ss * 0.5, n * ss * 0.5])
        a = rng.uniform(0, 2 * math.pi)
        da = rng.uniform(-0.12, 0.12)
        pts = []
        for _ in range(int(L)):
            pts.append(tuple(p - np.array([math.cos(a), math.sin(a)]) * L * ss * 0.5))
            p = p + np.array([math.cos(a), math.sin(a)]) * ss
            a += da + rng.normal(0, 0.05)
        d.line(pts, fill=255, width=int(ss * rng.uniform(1.0, 1.6)), joint="curve")
        im = im.resize((n, n), Image.LANCZOS)
        sprites.append(("hair", np.asarray(im, np.float32) / 255))
    return sprites


def _rng(*keys):
    return np.random.default_rng([int(k) & 0xFFFFFFFF for k in keys])


def _fbm(h, w, rng, base=4, octaves=6, persistence=0.55):
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        gw = max(2, int(base * 2 ** o * w / max(w, h))) + 2
        gh = max(2, int(base * 2 ** o * h / max(w, h))) + 2
        n = rng.standard_normal((gh, gw)).astype(np.float32)
        out += amp * cv2.resize(n, (w, h), interpolation=cv2.INTER_CUBIC)
        tot += amp
        amp *= persistence
    out /= tot
    return out / (out.std() + 1e-6)


class Look:
    """Shared archival finish.  All intensities are 0..~2 multipliers (0 = off).

    tone           "sepia" or "bw";  tone_strength 0..1
    fade           lifted blacks / dimmed whites (faded print)
    grain          grain std-dev at midtones (fraction of full scale)
    dust           average specks per frame / 2 (white and black, some hairs)
    scratches      chance of a vertical scratch per 2/3 second
    flicker        light flicker amplitude (fraction)
    vignette       corner darkening (0..1)
    weave          gate weave amplitude in px (applied by PhotoShot camera)
    """

    def __init__(self, tone="sepia", tone_strength=0.6, fade=0.035, grain=0.03, dust=0.6,
                 scratches=0.35, flicker=0.022, vignette=0.32, weave=0.45, seed=7):
        self.tone, self.tone_strength, self.fade = tone, tone_strength, fade
        self.grain, self.dust, self.scratches = grain, dust, scratches
        self.flicker, self.vignette, self.weave, self.seed = flicker, vignette, weave, seed

    # -- per frame parameters -------------------------------------------------
    def frame(self, t):
        return int(math.floor(t * FPS + 1e-6))

    def gain(self, t):
        f = self.frame(t)
        s = self.seed
        slow = (0.5 * math.sin(2 * math.pi * 0.83 * t + s) +
                0.3 * math.sin(2 * math.pi * 2.17 * t + 2 * s) +
                0.2 * math.sin(2 * math.pi * 5.3 * t + 3 * s))
        jit = _rng(s, f, 17).uniform(-1, 1)
        return 1.0 + self.flicker * (0.55 * slow + 0.45 * jit)

    def weave_offset(self, t):
        if not self.weave:
            return 0.0, 0.0
        f = self.frame(t)
        r = _rng(self.seed, f, 29)
        dx = 0.6 * math.sin(2 * math.pi * 0.71 * t) + 0.4 * r.uniform(-1, 1)
        dy = 0.6 * math.sin(2 * math.pi * 0.53 * t + 1.3) + 0.4 * r.uniform(-1, 1)
        return self.weave * dx, self.weave * 0.7 * dy

    def lut(self):
        return _tone_lut(self.tone, round(self.tone_strength, 3), round(self.fade, 4))

    # -- application ----------------------------------------------------------
    def apply(self, lum, t, out_rgb=True):
        """Finish a float32 HxW (1080x1920) luminance frame -> PIL RGB image.

        ``lum`` is modified in place."""
        f = self.frame(t)
        lum *= self.gain(t)
        if self.vignette:
            lum *= _vignette(round(self.vignette, 3))
        if self.dust or self.scratches:
            self._dust(lum, f)
        if self.grain:
            tiles = _grain_tiles()
            r = _rng(self.seed, f, 3)
            g = tiles[int(r.integers(GRAIN_N))]
            oy, ox = int(r.integers(GRAIN_T)), int(r.integers(GRAIN_T))
            gs = g[oy:oy + H, ox:ox + W].astype(np.float32)
            wgt = lum * (1 - lum)
            wgt *= 2.6 * self.grain / _I8
            wgt += 0.35 * self.grain / _I8
            gs *= wgt
            lum += gs
        else:   # tiny dither so dark gradients never band
            r = _rng(self.seed, f, 3)
            g = _grain_tiles()[int(r.integers(GRAIN_N))]
            lum += g[:H, :W].astype(np.float32) * (0.6 / 255 / _I8)
        idx = np.empty(lum.shape, np.uint8)
        np.multiply(lum, 255.0, out=lum)
        lum += 0.5
        np.clip(lum, 0, 255, out=lum)
        idx[...] = lum
        if not out_rgb:
            return idx
        rgb = cv2.LUT(cv2.merge([idx, idx, idx]), self.lut())
        return Image.fromarray(rgb, "RGB")

    def apply_image(self, img, t):
        """Convenience: finish any PIL image (converted to luminance)."""
        lum = np.asarray(img.convert("L"), dtype=np.float32) / 255.0
        return self.apply(lum, t)

    def _dust(self, lum, f):
        sprites = _dust_sprites()
        r = _rng(self.seed, f, 41)
        n = r.poisson(self.dust * 2.0) if self.dust else 0
        for _ in range(n):
            kind, sp = sprites[int(r.integers(14 if r.random() < 0.85 else 18))]
            self._stamp(lum, sp, r.uniform(0, W), r.uniform(0, H),
                        r.random() < 0.7, r.uniform(0.25, 0.65) * min(1.0, self.dust + 0.3))
        if self.dust:
            seg = f // 7     # hairs stay for a few frames
            rs = _rng(self.seed, seg, 43)
            if rs.random() < 0.07 * self.dust:
                kind, sp = sprites[18 + int(rs.integers(len(sprites) - 18))]
                self._stamp(lum, sp, rs.uniform(0.1, 0.9) * W, rs.uniform(0.1, 0.9) * H,
                            rs.random() < 0.5, rs.uniform(0.3, 0.55))
        if self.scratches:
            seg = f // 20
            for k in (seg, seg - 1):          # a scratch may overlap the segment edge
                rs = _rng(self.seed, k, 47)
                if rs.random() >= 0.45 * self.scratches:
                    continue
                start = k * 20 + int(rs.integers(0, 20))
                life = int(rs.integers(6, 26))
                if not (start <= f < start + life):
                    continue
                x = rs.uniform(0.06, 0.94) * W + rs.uniform(-1.5, 1.5) * (f - start)
                x += _rng(self.seed, f, 53).uniform(-0.8, 0.8)
                bright = rs.random() < 0.65
                op = rs.uniform(0.06, 0.16) * min(1.5, self.scratches + 0.5)
                y0 = int(rs.uniform(-0.3, 0.4) * H)
                y1 = int(rs.uniform(0.6, 1.3) * H)
                self._scratch(lum, x, max(0, y0), min(H, y1), bright, op, rs)

    @staticmethod
    def _stamp(lum, sp, x, y, bright, op):
        h, w = sp.shape
        x0, y0 = int(x - w / 2), int(y - h / 2)
        sx0, sy0 = max(0, -x0), max(0, -y0)
        x1, y1 = min(W, x0 + w), min(H, y0 + h)
        if x1 <= max(0, x0) or y1 <= max(0, y0):
            return
        reg = lum[max(0, y0):y1, max(0, x0):x1]
        a = sp[sy0:sy0 + reg.shape[0], sx0:sx0 + reg.shape[1]] * op
        target = 0.97 if bright else 0.05
        reg += a * (target - reg)

    @staticmethod
    def _scratch(lum, x, y0, y1, bright, op, rs):
        if y1 <= y0:
            return
        xi = int(math.floor(x))
        fx = x - xi
        prof = np.array([0.35 * (1 - fx), 1.0, 0.35 * fx + 0.1], np.float32)
        yy = np.arange(y0, y1, dtype=np.float32)
        mod = 0.65 + 0.35 * np.sin(yy * rs.uniform(0.004, 0.02) + rs.uniform(0, 6))
        ends = np.clip(np.minimum(yy - y0, y1 - yy) / 60.0, 0, 1)
        a = (mod * ends * op)[:, None] * prof[None, :]
        c0 = max(0, xi - 1)
        c1 = min(W, xi + 2)
        if c1 <= c0:
            return
        a = a[:, c0 - (xi - 1):c0 - (xi - 1) + (c1 - c0)]
        reg = lum[y0:y1, c0:c1]
        target = 0.95 if bright else 0.06
        reg += a * (target - reg)


@lru_cache(maxsize=8)
def _tone_lut(tone, strength, fade):
    v = np.linspace(0, 1, 256)
    v = fade + (1 - fade - 0.025) * v
    neutral = np.stack([v, v, v], 1)
    if tone == "sepia":
        toned = np.stack([v ** 0.86, v ** 0.99, v ** 1.28], 1)
        # slightly warmer, browner shadows
        toned += np.stack([0.012, 0.004, -0.004]) * (1 - v)[:, None] * (v > 0)[:, None]
    else:
        toned = neutral
    rgb = neutral + strength * (toned - neutral)
    # BGR order is irrelevant: all three input channels are the same luminance
    return np.clip(rgb * 255 + 0.5, 0, 255).astype(np.uint8).reshape(256, 1, 3)


def tone(lum_u8, look=None):
    """Map a uint8 luminance array through the look's toning LUT -> uint8 RGB."""
    lut = (look or Look()).lut()
    return cv2.LUT(cv2.merge([lum_u8, lum_u8, lum_u8]), lut)


# --------------------------------------------------------------------------
# Desk texture (print mode)
# --------------------------------------------------------------------------

@lru_cache(maxsize=2)
def _desk(style, seed, k):
    """Dark mottled paper/leather desk, lit by a soft lamp; float32 (H*k, W*k)."""
    w, h = int(math.ceil(W * k)), int(math.ceil(H * k))
    rng = np.random.default_rng(seed)
    mott = _fbm(h, w, rng, base=3, octaves=7, persistence=0.6)
    fibre = _gauss(rng.standard_normal((h, w)).astype(np.float32), 0.7)
    fibre = cv2.blur(fibre, (9, 1)) * 2.0          # faint horizontal fibres
    fine = _gauss(rng.standard_normal((h, w)).astype(np.float32), 0.8)
    blotch = np.clip(_fbm(h, w, rng, base=6, octaves=4) - 1.2, 0, None)
    if style == "light":
        base, amp = 0.42, 0.10
    else:
        base, amp = 0.17, 0.20
    d = base * (1 + amp * mott + 0.035 * fibre + 0.03 * fine - 0.18 * blotch)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    lx, ly = 0.40 * w, 0.30 * h
    lamp = np.exp(-(((xx - lx) / (0.62 * w)) ** 2 + ((yy - ly) / (0.80 * h)) ** 2))
    d *= 0.55 + 0.65 * lamp
    return np.clip(d, 0, 1).astype(np.float32)


# --------------------------------------------------------------------------
# PhotoShot
# --------------------------------------------------------------------------

_DEFAULTS = {
    "common": dict(look=None, t0=0.0, fit="cover", ease="gentle"),
    "parallax": dict(zoom=(1.03, 1.10), fg_zoom=0.05, pan=(0.012, -0.004), fg_pan=1.8,
                     focus=None, dof=2.2, dof_end=None, bg_haze=0.07, fg_shadow=0.0),
    "kenburns": dict(start=(0.5, 0.5, 1.0), end=None),
    "print": dict(caption=None, rot=(-7.0, -2.2), enter="bottom", enter_dur=1.2,
                  push=(1.0, 1.06), size=0.70, offset=(0.0, -0.025), border=0.045,
                  tape="top", edge="straight", desk="dark", desk_seed=3,
                  caption_delay=0.25, caption_dur=1.3, ease="sine"),
}


class PhotoShot:
    """An animated photo shot.  ``render(t)`` -> PIL RGB 1920x1080, 0 <= t <= duration.

    Common options:
      look=Look(...)      archival finish (default Look()); t0 = global start time
                          of the shot (decorrelates grain/dust between shots)
      fit="cover"         "cover", "contain" or a float 0..1 between them
                          (contain pads with a blurred, darkened copy)
      ease="gentle"       linear | gentle | sine | inout | out | callable
    parallax:
      zoom=(1.03, 1.10)   background zoom start/end (1 = cover fit)
      fg_zoom=0.05        extra relative growth of the subject over the shot
      pan=(0.012,-0.004)  camera drift (fraction of frame) over the shot
      fg_pan=1.8          subject drifts this many times the background
      focus=None          (fx, fy) normalised aim point; default = subject head
      dof=2.2             background blur (px at 1080p); dof_end for a rack focus
      bg_haze=0.07        background contrast reduction (aerial perspective)
      fg_shadow=0.0       soft contact shadow of the subject on the background
    kenburns:
      start=(cx, cy, zoom) end=(cx, cy, zoom)  normalised centre + zoom
    print:
      caption=None, rot=(-7, -2.2) deg, enter="bottom"|"top"|"left"|"right"|"drop"|None,
      enter_dur=1.2, push=(1.0, 1.06), size=0.70 (print photo height / frame),
      offset=(0, -0.025), border=0.045, tape="top"|"corners"|None,
      edge="straight"|"deckle", desk="dark"|"light", caption_delay, caption_dur
    """

    def __init__(self, path, duration, mode="parallax", mask_path=None, subject_box=None,
                 **opts):
        if mode not in ("parallax", "kenburns", "print"):
            raise ValueError(f"unknown mode {mode!r}")
        o = dict(_DEFAULTS["common"])
        o.update(_DEFAULTS[mode])
        bad = set(opts) - set(o)
        if bad:
            raise TypeError(f"unknown option(s) for {mode}: {', '.join(sorted(bad))}")
        o.update(opts)
        self.path, self.duration, self.mode = path, float(duration), mode
        self.mask_path, self.subject_box = mask_path, subject_box
        self.o = o
        self.look = o["look"] or Look()
        self._L = None

    def __getstate__(self):          # never pickle the big layers
        d = dict(self.__dict__)
        d["_L"] = None
        return d

    @property
    def nframes(self):
        return int(round(self.duration * FPS))

    def prep(self):
        return prepare(self.path, self.mask_path, self.subject_box,
                       matte=self.mode == "parallax")

    # -- public ---------------------------------------------------------------
    def render(self, t):
        return self.look.apply(self.render_lum(t), self.o["t0"] + t)

    def render_lum(self, t):
        """Pre-look float32 luminance frame (1080x1920), for custom compositing."""
        if self._L is None:
            self._L = getattr(self, "_build_" + self.mode)()
        t = clamp(t, 0.0, self.duration)
        u = _ease(self.o["ease"])(t / self.duration if self.duration > 0 else 1.0)
        wx, wy = self.look.weave_offset(self.o["t0"] + t)
        return getattr(self, "_frame_" + self.mode)(t, u, wx, wy)

    # -- canvas for parallax / kenburns --------------------------------------
    def _fit(self):
        f = self.o["fit"]
        return {"cover": 1.0, "contain": 0.0}.get(f, f) if isinstance(f, str) else float(f)

    def _canvas(self, prep, kz, layers):
        """Place prepared layers on a canvas at kz canvas px per frame px."""
        w, h = prep.size
        fit = self._fit()
        c_cov, c_con = max(W / w, H / h), min(W / w, H / h)
        sc = c_con * (c_cov / c_con) ** fit * kz
        pw, ph = int(round(w * sc)), int(round(h * sc))
        fw, fh = int(math.ceil(W * kz)), int(math.ceil(H * kz))
        margin = int(0.05 * fw)
        cw, ch = max(pw, fw) + 2 * margin, max(ph, fh) + 2 * margin
        ox, oy = (cw - pw) // 2, (ch - ph) // 2
        covers = pw >= fw - 1 and ph >= fh - 1
        out = {}
        for name, arr, border in layers:
            a = _resize(arr, (pw, ph))
            out[name] = cv2.copyMakeBorder(a, oy, ch - ph - oy, ox, cw - pw - ox, border)
        if covers:
            valid = (ox, oy, ox + pw, oy + ph)
        else:
            valid = (margin, margin, cw - margin, ch - margin)
            yy, xx = np.mgrid[0:ch, 0:cw].astype(np.float32)
            fe = 0.03 * fw
            dx = np.minimum(xx - ox, ox + pw - xx) / fe
            dy = np.minimum(yy - oy, oy + ph - yy) / fe
            inside = np.clip(np.minimum(dx, dy), 0, 1)
            inside = inside * inside * (3 - 2 * inside)
            kc = max(cw / w, ch / h)
            pad_src = prep.plate if prep.plate is not None else prep.lum
            pad = _resize(pad_src, (int(math.ceil(w * kc)), int(math.ceil(h * kc))))
            py, px = (pad.shape[0] - ch) // 2, (pad.shape[1] - cw) // 2
            pad = _gauss(pad[py:py + ch, px:px + cw], 0.025 * fw) * 0.5
            for name in out:
                if name == "alpha":
                    out[name] = out[name] * inside
                elif name != "fg":
                    out[name] = pad + inside * (out[name] - pad)
        geo = dict(ox=ox, oy=oy, pw=pw, ph=ph, cw=cw, ch=ch, valid=valid, kz=kz)
        return out, geo

    @staticmethod
    def _clamp_center(cx, cy, z, geo):
        hw, hh = W * geo["kz"] / z / 2, H * geo["kz"] / z / 2
        x0, y0, x1, y1 = geo["valid"]
        cx = (x0 + x1) / 2 if x1 - x0 < 2 * hw else clamp(cx, x0 + hw, x1 - hw)
        cy = (y0 + y1) / 2 if y1 - y0 < 2 * hh else clamp(cy, y0 + hh, y1 - hh)
        return cx, cy

    # -- parallax -------------------------------------------------------------
    def _build_parallax(self):
        o = self.o
        prep = self.prep()
        z0, z1 = o["zoom"]
        kz = max(z0, z1) * (1 + max(0.0, o["fg_zoom"]))
        if prep.alpha is None or prep.box is None:
            warnings.warn("photofx: no matte, parallax falls back to a plain push")
            alpha = np.zeros_like(prep.lum)
            plate, fg = prep.lum, prep.lum
        else:
            alpha, plate, fg = prep.alpha, prep.plate, prep.fg
        layers, geo = self._canvas(prep, kz, [
            ("plate", plate, cv2.BORDER_REFLECT_101),
            ("fg", fg, cv2.BORDER_REPLICATE),
            ("alpha", alpha, cv2.BORDER_REPLICATE)])
        mean = float(layers["plate"].mean())
        z_mid = (z0 + z1) / 2
        L = dict(geo=geo)
        for key, d in (("bg0", o["dof"]), ("bg1", o["dof_end"])):
            if d is None:
                continue
            b = _gauss(layers["plate"], d * kz / z_mid)
            b = b + o["bg_haze"] * (mean - b)
            if o["fg_shadow"]:
                sh = _gauss(layers["alpha"], 0.012 * W * kz)
                sh = np.roll(sh, (int(0.006 * H * kz), int(0.004 * W * kz)), (0, 1))
                b *= 1 - o["fg_shadow"] * sh
            L[key] = b.astype(np.float32)
        L["fga"] = np.dstack([layers["fg"], layers["alpha"]]).astype(np.float32)
        fx, fy = o["focus"] if o["focus"] else prep.anchor()
        L["F"] = (geo["ox"] + fx * geo["pw"], geo["oy"] + fy * geo["ph"])
        return L

    def _frame_parallax(self, t, u, wx, wy):
        o, L = self.o, self._L
        geo, kz = L["geo"], L["geo"]["kz"]
        z0, z1 = o["zoom"]
        zb = z0 * (z1 / z0) ** u
        Fx, Fy = L["F"]
        c0 = self._clamp_center(Fx, Fy, zb, geo)
        cx, cy = self._clamp_center(Fx + u * o["pan"][0] * W * kz,
                                    Fy + u * o["pan"][1] * H * kz, zb, geo)
        sb = zb / kz
        Mb = np.float32([[sb, 0, W / 2 - sb * cx + wx], [0, sb, H / 2 - sb * cy + wy]])
        flags = cv2.INTER_LINEAR
        bg = cv2.warpAffine(L["bg0"], Mb, (W, H), flags=flags, borderMode=cv2.BORDER_REFLECT)
        if "bg1" in L:
            bg1 = cv2.warpAffine(L["bg1"], Mb, (W, H), flags=flags, borderMode=cv2.BORDER_REFLECT)
            bg += smooth(u) * (bg1 - bg)
        rel = 1 + o["fg_zoom"] * u
        sf = sb * rel
        shx = -(o["fg_pan"] - 1) * sb * (cx - c0[0])
        shy = -(o["fg_pan"] - 1) * sb * (cy - c0[1])
        tx = sb * (Fx - cx) + W / 2 - sf * Fx + shx + wx
        ty = sb * (Fy - cy) + H / 2 - sf * Fy + shy + wy
        Mf = np.float32([[sf, 0, tx], [0, sf, ty]])
        fga = cv2.warpAffine(L["fga"], Mf, (W, H), flags=flags, borderMode=cv2.BORDER_REPLICATE)
        fg, a = fga[..., 0], fga[..., 1]
        fg -= bg
        fg *= a
        bg += fg
        return bg

    # -- ken burns ------------------------------------------------------------
    def _build_kenburns(self):
        o = self.o
        prep = self.prep()
        start = o["start"]
        end = o["end"]
        if end is None:
            ax, ay = prep.anchor()
            end = (lerp(start[0], ax, 0.6), lerp(start[1], ay, 0.6), start[2] * 1.14)
        kz = max(start[2], end[2])
        layers, geo = self._canvas(prep, kz, [("lum", prep.lum, cv2.BORDER_REFLECT_101)])

        def state(s):
            cx = geo["ox"] + s[0] * geo["pw"]
            cy = geo["oy"] + s[1] * geo["ph"]
            cx, cy = self._clamp_center(cx, cy, s[2], geo)
            return cx, cy, 1.0 / s[2]
        return dict(lum=layers["lum"], geo=geo, s0=state(start), s1=state(end))

    def _frame_kenburns(self, t, u, wx, wy):
        L = self._L
        kz = L["geo"]["kz"]
        (x0, y0, i0), (x1, y1, i1) = L["s0"], L["s1"]
        cx, cy, iz = lerp(x0, x1, u), lerp(y0, y1, u), lerp(i0, i1, u)
        s = 1.0 / (iz * kz)
        M = np.float32([[s, 0, W / 2 - s * cx + wx], [0, s, H / 2 - s * cy + wy]])
        return cv2.warpAffine(L["lum"], M, (W, H), flags=cv2.INTER_LINEAR,
                              borderMode=cv2.BORDER_REFLECT)

    # -- print ----------------------------------------------------------------
    def _build_print(self):
        o = self.o
        prep = self.prep()
        k = max(o["push"])                        # layer px per frame px at zoom 1
        w, h = prep.size
        ph = o["size"] * H
        pw = ph * w / h
        if pw > 0.78 * W:                          # wide photos: limit by width
            pw = 0.78 * W
            ph = pw * h / w
        pw, ph = int(round(pw * k)), int(round(ph * k))
        b = int(round(o["border"] * min(pw, ph)))
        cap = o["caption"]
        cap_size = int(round(0.052 * max(pw, ph) / (1.0 if pw < ph else 1.25)))
        bb = b + (int(cap_size * 1.9) if cap else 0)
        PW, PH = pw + 2 * b, ph + b + bb
        pad = int(0.09 * max(PW, PH))
        CW, CH = PW + 2 * pad, PH + 2 * pad
        rng = np.random.default_rng(o["desk_seed"] + 101)

        # print alpha (straight or deckled edge), 4x supersampled for clean AA
        ss = 4
        am = Image.new("L", (CW * ss, CH * ss), 0)
        d = ImageDraw.Draw(am)
        x0, y0, x1, y1 = pad * ss, pad * ss, (pad + PW) * ss, (pad + PH) * ss
        if o["edge"] == "deckle":
            per = 0.022 * min(PW, PH) * ss
            amp = 0.006 * min(PW, PH) * ss
            pts = []
            for (ax, ay), (bx, by) in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)),
                                       ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
                L_ = math.hypot(bx - ax, by - ay)
                n = max(2, int(L_ / per))
                nx, ny = (by - ay) / L_, -(bx - ax) / L_     # inward normal (clockwise)
                for i in range(n * 6):
                    s_ = i / (n * 6)
                    ph_ = (s_ * n) % 1.0
                    dd = amp * (1 - math.sin(math.pi * ph_)) ** 1.5
                    dd *= rng.uniform(0.8, 1.2)
                    pts.append((ax + (bx - ax) * s_ - nx * dd, ay + (by - ay) * s_ - ny * dd))
            d.polygon(pts, fill=255)
        else:
            d.rounded_rectangle([x0, y0, x1, y1], radius=int(0.004 * min(PW, PH) * ss) + ss,
                                fill=255)
        alpha = np.asarray(am.resize((CW, CH), Image.LANCZOS), np.float32) / 255

        # paper: warm white with mottling, darker aged edges
        paper = 0.925 + 0.012 * _fbm(CH, CW, rng, base=6, octaves=5)
        paper += 0.006 * _gauss(rng.standard_normal((CH, CW)).astype(np.float32), 0.6)
        yy, xx = np.mgrid[0:CH, 0:CW].astype(np.float32)
        de = np.minimum(np.minimum(xx - pad, pad + PW - xx), np.minimum(yy - pad, pad + PH - yy))
        paper *= 1 - 0.07 * np.exp(-np.clip(de, 0, None) / (0.35 * b + 1))
        lum = paper.astype(np.float32)

        # photo, printed look: no pure black/white, faint inner vignette
        photo = _resize(prep.lum, (pw, ph))
        photo = 0.04 + 0.90 * photo
        py_, px_ = np.mgrid[0:ph, 0:pw].astype(np.float32)
        r = np.sqrt(((px_ - pw / 2) / (pw * 0.75)) ** 2 + ((py_ - ph / 2) / (ph * 0.75)) ** 2)
        photo *= 1 - 0.12 * np.clip(r - 0.35, 0, 1) ** 1.5
        lum[pad + b:pad + b + ph, pad + b:pad + b + pw] = photo

        # caption (handwritten-ish ink in the bottom margin)
        ink = None
        if cap:
            f = font("serif-italic", cap_size)
            tw = f.getlength(cap)
            im = Image.new("L", (CW, CH), 0)
            cx_ = pad + PW / 2 - tw / 2
            cy_ = pad + b + ph + (bb - cap_size * 1.25) / 2
            ImageDraw.Draw(im).text((cx_, cy_), cap, font=f, fill=235)
            ink = _gauss(np.asarray(im, np.float32) / 255, 0.35 * k)
            cap_x = (cx_ - 2, cx_ + tw + 2)

        # sheen: soft diagonal highlight across the print
        sheen = np.exp(-(((xx - yy * 0.6) - CW * 0.62) / (CW * 0.22)) ** 2)
        lum += 0.025 * sheen.astype(np.float32)

        # tape
        if o["tape"]:
            tl, ta = self._tape_layers(CW, CH, pad, PW, PH, o["tape"], rng)
            lum = (tl * ta + lum * alpha * (1 - ta)) / np.maximum(ta + alpha * (1 - ta), 1e-4)
            alpha_t = ta + alpha * (1 - ta)
        else:
            alpha_t = alpha

        # shadows: contact + soft key, resting and lifted
        def shadow(sig, dx, dy):
            s = _gauss(alpha, sig * k)
            M = np.float32([[1, 0, dx * k], [0, 1, dy * k]])
            return cv2.warpAffine(s, M, (CW, CH), borderMode=cv2.BORDER_CONSTANT)
        rest = 0.55 * shadow(9, 6, 10) + 0.45 * shadow(2.2, 1.5, 2.5)
        lift = shadow(30, 22, 38)
        L = dict(stack=np.dstack([lum, alpha_t, rest, lift]).astype(np.float32),
                 qc=(pad + PW / 2, pad + PH / 2), k=k, ink=None,
                 desk=_desk(o["desk"], o["desk_seed"], k))
        if ink is not None:
            ys, xs = np.nonzero(ink > 0.003)
            y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            L.update(ink=ink[y0:y1, x0:x1].copy(), ink_box=(y0, y1, x0, x1), cap_x=cap_x)
            L["stack_ink"] = self._ink(L, 1.0)
        return L

    @staticmethod
    def _ink(L, uc):
        """Print stack with the caption written up to fraction ``uc`` (left to right)."""
        y0, y1, x0, x1 = L["ink_box"]
        xs = np.arange(x0, x1, dtype=np.float32)
        cx0, cx1 = L["cap_x"]
        fe = 0.08 * (cx1 - cx0) + 4
        head = cx0 - fe + uc * (cx1 - cx0 + 2 * fe)
        wipe = np.clip((head - xs) / fe, 0, 1)
        stack = L["stack"].copy()
        reg = stack[y0:y1, x0:x1, 0]
        reg -= (L["ink"] * wipe[None, :] * 0.88) * (reg - 0.16)
        return stack

    @staticmethod
    def _tape_layers(CW, CH, pad, PW, PH, where, rng):
        tl = np.zeros((CH, CW), np.float32)
        ta = np.zeros((CH, CW), np.float32)
        ss = 3
        if where == "corners":
            pieces = [(pad + 0.02 * PW, pad + 0.02 * PH, -38, 0.20),
                      (pad + 0.98 * PW, pad + 0.02 * PH, 36, 0.20)]
        else:
            pieces = [(pad + PW * rng.uniform(0.44, 0.56), pad + 0.005 * PH,
                       rng.uniform(-4, 4), 0.26)]
        for cx, cy, ang, wf in pieces:
            tw, th = wf * PW, 0.075 * PW * (0.9 if where == "corners" else 1.0)
            n = int(max(tw, th) * 1.6)
            im = Image.new("L", (n * ss, n * ss), 0)
            pts_top, pts_bot = [], []
            c = n * ss / 2
            hw, hh = tw * ss / 2, th * ss / 2
            jag = 0.06 * th * ss
            ys = np.linspace(-hh, hh, 12)
            right = [(c + hw + rng.uniform(-jag, jag), c + y) for y in ys]
            left = [(c - hw + rng.uniform(-jag, jag), c + y) for y in ys[::-1]]
            ImageDraw.Draw(im).polygon(right + left, fill=255)
            im = im.rotate(ang, resample=Image.BICUBIC).resize((n, n), Image.LANCZOS)
            a = np.asarray(im, np.float32) / 255
            x0, y0 = int(cx - n / 2), int(cy - n / 2)
            sx0, sy0 = max(0, -x0), max(0, -y0)
            x1, y1 = min(CW, x0 + n), min(CH, y0 + n)
            sub = a[sy0:sy0 + (y1 - max(0, y0)), sx0:sx0 + (x1 - max(0, x0))]
            reg = (slice(max(0, y0), y1), slice(max(0, x0), x1))
            ta[reg] = np.maximum(ta[reg], sub)
        tex = _fbm(CH, CW, rng, base=10, octaves=4)
        tl[:] = 0.86 + 0.03 * tex
        ta *= np.clip(0.5 + 0.06 * tex, 0.3, 0.7)
        return tl, ta

    def _frame_print(self, t, u, wx, wy):
        o, L = self.o, self._L
        k = L["k"]
        ed = o["enter_dur"]
        ue = clamp(t / ed) if ed > 0 and o["enter"] else 1.0
        pos = ease_out(ue)
        lift = 1 - smooth(clamp(t / (ed * 1.05))) if o["enter"] else 0.0
        # rotation settles a little after the slide, with a tiny overshoot
        ur = clamp(t / (ed * 1.25)) if o["enter"] else 1.0
        settle = 1 - (1 - ur) ** 3 + 0.06 * math.sin(math.pi * ur) * ur
        rot = lerp(o["rot"][0], o["rot"][1], settle)
        Px = W / 2 + o["offset"][0] * W
        Py = H / 2 + o["offset"][1] * H
        enter = o["enter"]
        dist = 1.0 - pos
        if enter == "bottom":
            Py += dist * H * 0.95
        elif enter == "top":
            Py -= dist * H * 0.95
        elif enter == "left":
            Px -= dist * W * 0.85
        elif enter == "right":
            Px += dist * W * 0.85
        scale = 1 + 0.035 * lift + (0.25 * (1 - pos) if enter == "drop" else 0.0)
        p0, p1 = o["push"]
        z = lerp(p0, p1, u)
        Cx, Cy = W / 2 + o["offset"][0] * W, H / 2 + o["offset"][1] * H
        th = -math.radians(rot)
        cs, sn = math.cos(th), math.sin(th)
        a = z * scale / k
        qx, qy = L["qc"]
        tx = z * (Px - Cx) + Cx - a * (cs * qx - sn * qy) + wx
        ty = z * (Py - Cy) + Cy - a * (sn * qx + cs * qy) + wy
        M = np.float32([[a * cs, -a * sn, tx], [a * sn, a * cs, ty]])
        stack = L["stack"]
        if L["ink"] is not None:
            uc = clamp((t - (ed if o["enter"] else 0.0) - o["caption_delay"]) / o["caption_dur"])
            if uc >= 1:
                stack = L["stack_ink"]
            elif uc > 0:
                stack = self._ink(L, uc)
        dk = L["desk"]
        Md = np.float32([[z / k, 0, Cx - z * Cx + wx], [0, z / k, Cy - z * Cy + wy]])
        desk = cv2.warpAffine(dk, Md, (W, H), flags=cv2.INTER_LINEAR,
                              borderMode=cv2.BORDER_REFLECT)
        lay = cv2.warpAffine(stack, M, (W, H), flags=cv2.INTER_LINEAR,
                             borderMode=cv2.BORDER_CONSTANT)
        lum, al, rest, lft = cv2.split(lay)
        if enter == "drop":
            fade = smooth(ue / 0.35)
            al *= fade
            rest *= fade
            lft *= fade
        sh = rest * (0.78 * (1 - lift)) + lft * (0.55 * lift)
        desk *= 1 - sh
        lum -= desk
        lum *= al
        desk += lum
        return desk


# --------------------------------------------------------------------------
# Lower third
# --------------------------------------------------------------------------

LT_X, LT_Y = 116, H - 214


@lru_cache(maxsize=4)
def _lt_backdrop(w, h):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    ax = np.clip(1 - xx / w, 0, 1) ** 1.4
    ay = np.clip(yy / (h * 0.55), 0, 1)
    ay = ay * ay * (3 - 2 * ay)
    a = (ax * ay * 0.62 * 255).astype(np.uint8)
    im = Image.new("RGBA", (w, h), (8, 5, 4, 0))
    im.putalpha(Image.fromarray(a, "L"))
    return im


def lower_third(img, title, subtitle=None, t=10.0, alpha=1.0, dur=None):
    """Overlay an animated lower-third caption on a 1920x1080 PIL image.

    title     Playfair Display Bold, cream;  subtitle  Montserrat Medium, gold
    t         seconds since the caption started (animates in over ~1 s)
    alpha     overall opacity (compositor fades); dur  optional auto fade-out
    Returns a new RGB image.
    """
    if dur is not None:
        alpha *= 1 - smooth((t - (dur - 0.5)) / 0.5)
    if alpha <= 0.004:
        return img.copy() if img.mode == "RGB" else img.convert("RGB")
    ttl, tpad, tw = text_img(title, "serif-bold", 62, CREAM, 0, 0.75)
    sub = text_img(subtitle, "sans-medium", 27, GOLD, 3, 0.75) if subtitle else None
    width = int(max(tw, sub[2] if sub else 0)) + LT_X + 60
    top = LT_Y - 70
    reg_box = (0, top, min(W, width + 420), H)
    out = img.convert("RGB")
    region = out.crop(reg_box).convert("RGBA")
    rw, rh = region.size
    bd = _lt_backdrop(rw, rh)
    a_bd = alpha * smooth(t / 0.6)
    if a_bd < 0.999:
        bd = bd.copy()
        bd.putalpha(bd.getchannel("A").point(lambda v: int(v * a_bd)))
    region.alpha_composite(bd)

    # red accent bar grows downwards
    bar_top = LT_Y - top + 10
    bar_h = 62 + (54 if sub else 14)
    g = ease_out(t / 0.5)
    bh = int(round(bar_h * g))
    if bh > 0:
        bar = Image.new("RGBA", (7, bh), RED + (int(255 * alpha),))
        region.alpha_composite(bar, (LT_X - 26, bar_top))

    def place(sprite, pad, x, y, a, slide):
        if a <= 0.004:
            return
        im = sprite
        if a < 0.999:
            im = sprite.copy()
            im.putalpha(sprite.getchannel("A").point(lambda v: int(v * a)))
        xx = int(round(x - pad - slide))
        clip = LT_X - 14             # text emerges from behind the bar
        if xx < clip:
            im = im.crop((clip - xx, 0, im.width, im.height))
            xx = clip
        region.alpha_composite(im, (xx, int(round(y - pad))))

    ut = ease_out((t - 0.15) / 0.7)
    place(ttl, tpad, LT_X, LT_Y - top, alpha * smooth((t - 0.15) / 0.45), 34 * (1 - ut))
    if sub:
        us = ease_out((t - 0.4) / 0.7)
        place(sub[0], sub[1], LT_X + 2, LT_Y - top + 86, alpha * smooth((t - 0.4) / 0.45),
              24 * (1 - us))
    out.paste(region.convert("RGB"), reg_box[:2])
    return out


# --------------------------------------------------------------------------
# Demo / CLI
# --------------------------------------------------------------------------

def _demo_sources(src):
    import skimage.data as skd
    os.makedirs(src, exist_ok=True)
    paths = {}
    for n in ("camera", "astronaut"):
        p = os.path.join(src, n + ".png")
        if not os.path.exists(p):
            Image.fromarray(getattr(skd, n)()).save(p)
        paths[n] = p
    return paths


def _demo_shots(paths):
    cam_box = (0.0, 0.08, 0.62, 1.0)
    return {
        "parallax_camera": PhotoShot(paths["camera"], 6.0, "parallax", subject_box=cam_box,
                                     pan=(0.016, -0.004)),
        "parallax_astronaut": PhotoShot(paths["astronaut"], 6.0, "parallax",
                                        subject_box=(0.10, 0.18, 0.86, 1.0),
                                        zoom=(1.02, 1.09), pan=(-0.012, 0.0)),
        "kenburns_camera": PhotoShot(paths["camera"], 6.0, "kenburns",
                                     start=(0.55, 0.55, 1.0), end=(0.38, 0.32, 1.25)),
        "kenburns_contain": PhotoShot(paths["astronaut"], 6.0, "kenburns", fit=0.35,
                                      start=(0.5, 0.5, 1.0), end=(0.5, 0.36, 1.12)),
        "print_camera": PhotoShot(paths["camera"], 6.0, "print", caption="Selanik, 1881",
                                  rot=(-8.0, -2.4)),
        "print_astronaut": PhotoShot(paths["astronaut"], 6.0, "print", edge="deckle",
                                     enter="drop", tape="corners", rot=(4.0, 1.6),
                                     caption="Harbiye Mektebi · İstanbul, 1902"),
    }


_SHOTS = None


def _demo_frame(args):
    name, i = args
    shot = _SHOTS[name]
    t = i / FPS
    img = shot.render(t)
    if name == "parallax_camera":
        img = lower_third(img, "Mustafa Kemal", "Selanik · 1881", t - 1.0)
    return img.tobytes()


def _debug_prep(prep, out, name):
    """Matte checks: cut-out over grey and over red, matte, clean plate."""
    h, w = prep.lum.shape
    k = 960 / w
    sz = (960, int(h * k))
    lum = _resize(prep.lum, sz)
    fg = _resize(prep.fg, sz)
    a = _resize(prep.alpha, sz)
    plate = _resize(prep.plate, sz)
    grey = np.full_like(lum, 0.5)
    red = np.dstack([np.full_like(lum, 0.85), np.full_like(lum, 0.1), np.full_like(lum, 0.1)])
    on_red = red * (1 - a[..., None]) + fg[..., None] * a[..., None]
    on_grey = grey + a * (fg - grey)
    to8 = lambda x: (np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8)
    rows = [np.dstack([to8(lum)] * 3), np.dstack([to8(on_grey)] * 3), to8(on_red),
            np.dstack([to8(a)] * 3), np.dstack([to8(plate)] * 3)]
    sheet = np.concatenate([np.concatenate(rows[:3], 1),
                            np.concatenate(rows[3:] + [np.zeros_like(rows[0])], 1)], 0)
    p = os.path.join(out, f"debug_{name}.png")
    Image.fromarray(sheet).save(p)
    # 1:1 edge crop around the subject's head on red
    bx0, by0, bx1, by1 = prep.box
    cx, cy = (bx0 + bx1) // 2, by0 + 40
    cx0, cy0 = max(0, cx - 400), max(0, cy - 120)
    cr = (slice(cy0, cy0 + 500), slice(cx0, cx0 + 800))
    A = prep.alpha[cr][..., None]
    crop = np.array([0.85, 0.1, 0.1]) * (1 - A) + prep.fg[cr][..., None] * A
    Image.fromarray(to8(crop)).save(os.path.join(out, f"debug_{name}_edge.png"))
    return p


def demo(out, seconds=6.0, jobs=None, video=True):
    global _SHOTS
    from multiprocessing import Pool
    os.makedirs(out, exist_ok=True)
    paths = _demo_sources(os.path.join(out, "src"))
    init_worker()
    for n, box in (("camera", (0.0, 0.08, 0.62, 1.0)), ("astronaut", (0.10, 0.18, 0.86, 1.0))):
        t0 = time.time()
        p = prepare(paths[n], subject_box=box)
        print(f"prepare({n}): {time.time() - t0:.2f}s  -> {p.size}")
        print("  ", _debug_prep(p, out, n))
    _SHOTS = _demo_shots(paths)
    for name, shot in _SHOTS.items():
        shot.duration = seconds
        t0 = time.time()
        shot.render(0.0)
        build = time.time() - t0
        ts = [0.2 + i * (seconds - 0.4) / 11 for i in range(12)]
        t0 = time.time()
        for t in ts:
            shot.render(t)
        per = (time.time() - t0) / len(ts)
        print(f"{name:20s} build {build:5.2f}s   {per * 1000:6.1f} ms/frame (1 core)")
        for t in (0.0, seconds * 0.5, seconds):
            img = shot.render(t)
            if name == "parallax_camera":
                img = lower_third(img, "Mustafa Kemal", "Selanik · 1881", t - 1.0)
            p = os.path.join(out, f"{name}_t{t:04.1f}.png")
            img.save(p)
    if not video:
        return
    jobs = jobs or os.cpu_count() or 2
    with Pool(jobs, initializer=init_worker) as pool:
        for name, shot in _SHOTS.items():
            mp4 = os.path.join(out, f"{name}.mp4")
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                   "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264",
                   "-preset", "medium", "-crf", "18", "-tune", "grain", "-pix_fmt", "yuv420p",
                   "-movflags", "+faststart", mp4]
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
            t0 = time.time()
            for fr in pool.imap(_demo_frame, [(name, i) for i in range(shot.nframes + 1)],
                                chunksize=4):
                proc.stdin.write(fr)
            proc.stdin.close()
            if proc.wait() != 0:
                sys.exit("ffmpeg failed")
            print(f"{mp4}  ({time.time() - t0:.1f}s)")


def main():
    ap = argparse.ArgumentParser(description="photofx: archival photo animation toolkit")
    ap.add_argument("--demo", action="store_true", help="render demo stills and previews")
    ap.add_argument("--out", default=os.path.join(tempfile.gettempdir(), "photofx-demo"))
    ap.add_argument("--seconds", type=float, default=6.0)
    ap.add_argument("--jobs", type=int, default=None)
    ap.add_argument("--no-video", action="store_true")
    args = ap.parse_args()
    if not args.demo:
        ap.print_help()
        return
    demo(args.out, args.seconds, args.jobs, video=not args.no_video)


if __name__ == "__main__":
    main()
