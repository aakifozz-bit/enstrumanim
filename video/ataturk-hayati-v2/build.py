#!/usr/bin/env python3
"""Atatürk v2 videosunu birleştirir: arşiv fotoğrafları + animasyonlu haritalar +
Türkçe anlatım + alt yazı + müzik.  1920x1080, 30 fps, 60 sn.

Kullanım:
    python3 build.py                     # ataturk-hayati-v2.mp4
    python3 build.py --stills 2,12,30    # PNG önizleme kareleri
    python3 build.py --preview 0-20      # 0–20 sn arası hızlı önizleme mp4

Bileşenler: maps.py (haritalar), photofx.py (fotoğraf animasyonu), music.py (müzik),
photos/ (Wikimedia Commons, kamu malı), narration/ (anlatım sesi + zamanlamalar).
"""

import argparse
import importlib.util
import json
import os
import subprocess
import sys
import wave
from functools import lru_cache
import multiprocessing

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import maps  # noqa: E402
import music  # noqa: E402
import photofx  # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "v1", os.path.join(HERE, "..", "ataturk-hayati", "generate.py"))
v1 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(v1)

W, H, FPS = 1920, 1080, 30
DURATION = 60.0
NFRAMES = int(DURATION * FPS)
XFADE = 0.4
PHOTOS = os.path.join(HERE, "photos")
NARR = os.path.join(HERE, "narration")

RED, GOLD, CREAM = v1.RED, v1.GOLD, v1.CREAM

# (ad, başlangıç, süre, tür, ayarlar)
SHOTS = [
    ("acilis", 0.0, 5.0, "photo", dict(photo="p01_portrait", mode="parallax", title=True)),
    ("selanik", 5.0, 5.0, "map", dict(scene="selanik")),
    ("subay", 10.0, 5.0, "photo", dict(photo="p02_young_officer", mode="print",
                                       tag=("1905", "HARP AKADEMİSİ · KURMAY YÜZBAŞI"))),
    ("canakkale", 15.0, 6.0, "map", dict(scene="canakkale")),
    ("milli", 21.0, 7.0, "map", dict(scene="milli_mucadele")),
    ("tbmm", 28.0, 4.0, "photo", dict(photo="p05_tbmm", mode="kenburns",
                                      tag=("23 NİSAN 1920", "TÜRKİYE BÜYÜK MİLLET MECLİSİ"))),
    ("taarruz", 32.0, 6.0, "map", dict(scene="buyuk_taarruz")),
    ("cumhuriyet", 38.0, 5.0, "photo", dict(photo="p07_cumhuriyet", mode="kenburns",
                                            kb=((0.5, 0.36, 1.0), (0.5, 0.31, 1.1)),
                                            tag=("29 EKİM 1923", "CUMHURİYET İLAN EDİLDİ"))),
    ("devrimler", 43.0, 6.0, "photo", dict(photo="p08_harf_devrimi", mode="kenburns",
                                           fit=0.45, kb=((0.5, 0.42, 1.0), (0.53, 0.38, 1.1)),
                                           tag=("1928", "HARF DEVRİMİ"))),
    ("soyadi", 49.0, 5.0, "photo", dict(photo="p09_portrait_1930s", mode="parallax",
                                        tag=("1934", "SOYADI KANUNU · “ATATÜRK”"))),
    ("veda", 54.0, 6.0, "photo", dict(photo="p10_dolmabahce", mode="kenburns",
                                      tag=("10 KASIM 1938", "DOLMABAHÇE SARAYI · SAAT 09.05"),
                                      flag_at=3.4)),
]


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


smooth = v1.smooth
ease_out = v1.ease_out


@lru_cache(maxsize=1)
def credits():
    p = os.path.join(PHOTOS, "credits.json")
    if not os.path.exists(p):
        return {}
    with open(p, encoding="utf-8") as f:
        data = json.load(f)
    return {os.path.splitext(e["file"])[0]: e for e in data}


def photo_path(key):
    p = os.path.join(PHOTOS, key + ".jpg")
    return p if os.path.exists(p) else None


@lru_cache(maxsize=None)
def photo_shot(idx):
    name, start, dur, kind, o = SHOTS[idx]
    path = photo_path(o["photo"])
    if path is None:
        return None
    box = credits().get(o["photo"], {}).get("subject_box")
    opts = dict(t0=start)
    mode = o["mode"]
    if mode == "print":
        opts.update(caption=o.get("caption"), enter="bottom", tape="top", desk="dark")
    if mode == "kenburns":
        a, b = o.get("kb", ((0.5, 0.5, 1.0), (0.5, 0.46, 1.12)))
        opts.update(start=a, end=b)
    if "fit" in o:
        opts["fit"] = o["fit"]
    return photofx.PhotoShot(path, dur + XFADE, mode=mode, subject_box=box, **opts)


# --------------------------------------------------------------------------
# Katmanlar: başlık, tarih etiketi, alt yazı, bayrak
# --------------------------------------------------------------------------

def overlay(img, fn):
    cv = img.convert("RGBA")
    fn(cv)
    return cv.convert("RGB")


@lru_cache(maxsize=2)
def corner_img(w, h):
    x = np.clip(1 - np.arange(w, dtype=np.float32) / w, 0, 1)
    y = np.clip(1 - np.arange(h, dtype=np.float32) / h, 0, 1)
    x, y = x * x * (3 - 2 * x), y * y * (3 - 2 * y)
    a = (y[:, None] * x[None, :]) ** 0.9 * 190
    im = Image.new("RGBA", (w, h), (8, 6, 6, 0))
    im.putalpha(Image.fromarray(a.astype(np.uint8)))
    return im


@lru_cache(maxsize=4)
def grad_img(w, h, side):
    a = np.linspace(1, 0, w if side in ("left", "right") else h, dtype=np.float32) ** 1.4
    if side in ("left", "right"):
        a = np.tile(a[None, :] if side == "left" else a[None, ::-1], (h, 1))
    else:
        a = np.tile(a[:, None] if side == "top" else a[::-1, None], (1, w))
    im = Image.new("RGBA", (w, h), (8, 6, 6, 0))
    im.putalpha(Image.fromarray((a * 200).astype(np.uint8)))
    return im


def title_card(cv, t):
    v1.comp(cv, v1.with_alpha(grad_img(W, 520, "bottom"), smooth(t / 0.8)), 0, H - 520)
    a, dy = v1.el(t, 0.5, 1.0, 1.1)
    v1.draw_text(cv, "1881 — 1938", "sans-medium", 28, GOLD, W / 2, 742 + dy, a, "center", 12)
    a, dy = v1.el(t, 0.75, 1.0, 1.2)
    v1.draw_text(cv, "Mustafa Kemal", "serif-bold", 100, CREAM, W / 2, 776 + dy, a, "center")
    a, dy = v1.el(t, 1.0, 1.0, 1.2)
    v1.draw_text(cv, "ATATÜRK", "sans-semibold", 56, GOLD, W / 2, 918 + dy, a, "center", 28)


def date_tag(cv, t, date, sub, alpha=1.0):
    if alpha <= 0.004:
        return
    v1.comp(cv, v1.with_alpha(corner_img(1300, 480), alpha * smooth(t / 0.6)), 0, 0)
    bw = int(70 * ease_out((t - 0.1) / 0.8))
    if bw > 0:
        v1.comp(cv, v1.with_alpha(v1.rect_img(bw, 6, RED), alpha), 96, 84)
    a, dy = v1.el(t, 0.2, alpha, 0.8, 18)
    v1.draw_text(cv, date, "serif-bold", 64, CREAM, 92, 106 + dy, a)
    a, dy = v1.el(t, 0.38, alpha, 0.8, 18)
    v1.draw_text(cv, sub, "sans-medium", 25, GOLD, 96, 196 + dy, a, tracking=5)


@lru_cache(maxsize=1)
def subtitle_lines():
    p = os.path.join(NARR, "timings.json")
    if not os.path.exists(p):
        return []
    with open(p, encoding="utf-8") as f:
        data = json.load(f)
    out = []
    for e in data:
        text = e.get("text_displayed") or e.get("text")
        out.append((float(e["start"]), float(e["end"]), v1.wrap(text, "sans-medium", 38, 1500)))
    return out


def subtitles(cv, t):
    if t < SHOTS[1][1] - 0.1:  # açılışta başlık kartı aynı cümleyi gösteriyor
        return
    for s, e, lines in subtitle_lines():
        if s - 0.15 <= t <= e + 0.35:
            a = smooth((t - s + 0.15) / 0.2) * (1 - smooth((t - e) / 0.35))
            n = len(lines)
            y0 = H - 66 - 52 * n
            f = v1.font("sans-medium", 38)
            wmax = max(f.getlength(ln) for ln in lines)
            box = Image.new("RGBA", (int(wmax) + 56, 52 * n + 26), (0, 0, 0, 0))
            ImageDraw.Draw(box).rounded_rectangle([0, 0, box.width - 1, box.height - 1], 14,
                                                  fill=(10, 8, 8, 150))
            v1.comp(cv, v1.with_alpha(box, a), W / 2 - box.width / 2, y0 - 12)
            for k, ln in enumerate(lines):
                v1.draw_text(cv, ln, "sans-medium", 38, CREAM, W / 2, y0 + 52 * k, a, "center")


def flag_end(cv, t):
    """Kapanış: dalgalanan bayrak ve son söz."""
    p = smooth(t / 0.8)
    if p <= 0:
        return
    v1.comp(cv, v1.with_alpha(v1.rect_img(W, H, (12, 8, 9)), p * 0.92), 0, 0)
    fl = v1.wave_flag(v1.flag_flat(400), t + 3, 15, 320, 4.2)
    fx, fy = W / 2 - fl.width / 2 + 14, 400 - fl.height / 2
    v1.comp(cv, v1.with_alpha(v1.rect_img(10, 560, (200, 190, 175)), p), fx - 12, fy - 10)
    v1.comp(cv, v1.with_alpha(v1.dot_img(), p), fx - 27, fy - 32)
    v1.comp(cv, v1.with_alpha(fl, p), fx, fy)
    a, dy = v1.el(t, 0.5, 1.0)
    v1.draw_text(cv, "Saygı, minnet ve özlemle…", "serif-italic", 46, CREAM, W / 2, 700 + dy, a,
                 "center")


# --------------------------------------------------------------------------
# Kare üretimi
# --------------------------------------------------------------------------

@lru_cache(maxsize=1)
def missing_card():
    cv = v1.background("warm").copy()
    v1.draw_text(cv, "fotoğraf bekleniyor", "sans-medium", 30, GOLD, W / 2, 520, 0.8, "center", 6)
    return cv.convert("RGB")


def render_shot(idx, lt):
    name, start, dur, kind, o = SHOTS[idx]
    lt = clamp(lt, 0, dur + XFADE)
    if kind == "map":
        mdur, fn = maps.MAP_SCENES[o["scene"]]
        return fn(min(lt, mdur - 1e-3))
    shot = photo_shot(idx)
    if shot is None and name == "veda":
        # Dolmabahçe fotoğrafı yoksa v1'in 09.05'te duran saat sahnesini kullan
        img = v1.render(48.0 + min(lt, 5.0))
        o = dict(o, tag=None)
    else:
        img = shot.render(min(lt, shot.duration - 1e-3)) if shot else missing_card()
    if o.get("title"):
        img = overlay(img, lambda cv: title_card(cv, lt))
    if o.get("tag"):
        fa = 1 - smooth((lt - o["flag_at"] + 0.2) / 0.5) if o.get("flag_at") else 1.0
        img = overlay(img, lambda cv: date_tag(cv, lt - 0.15, *o["tag"], alpha=fa))
    if o.get("flag_at") is not None and lt >= o["flag_at"]:
        img = overlay(img, lambda cv: flag_end(cv, lt - o["flag_at"]))
    return img


def render(t):
    idx = max(i for i, s in enumerate(SHOTS) if t >= s[1] - 1e-9)
    start = SHOTS[idx][1]
    img = render_shot(idx, t - start)
    if idx > 0 and t - start < XFADE / 2:
        prev = SHOTS[idx - 1]
        img_prev = render_shot(idx - 1, t - prev[1])
        u = smooth((t - start + XFADE / 2) / XFADE)
        img = Image.blend(img_prev, img, u)
    elif idx < len(SHOTS) - 1 and SHOTS[idx + 1][1] - t < XFADE / 2:
        nxt = SHOTS[idx + 1]
        img_next = render_shot(idx + 1, 0.0)
        u = smooth((t - nxt[1] + XFADE / 2) / XFADE)
        img = Image.blend(img, img_next, u)
    img = overlay(img, lambda cv: subtitles(cv, t))
    black = max(1 - smooth(t / 0.6), smooth((t - (DURATION - 0.9)) / 0.9))
    if black > 0.001:
        a = np.asarray(img, dtype=np.float32) * (1 - black) + v1.fade_noise()
        img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGB")
    return img


def render_frame(i):
    return render(i / FPS).tobytes()


def init_worker():
    if hasattr(photofx, "init_worker"):
        photofx.init_worker()


# --------------------------------------------------------------------------
# Ses: anlatım + müzik (anlatım altında müzik kısılır)
# --------------------------------------------------------------------------

def read_wav(path):
    with wave.open(path) as w:
        sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        x = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float64) / 32768
    x = x.reshape(-1, ch).T
    if ch == 1:
        x = np.vstack([x, x])
    if sr != music.SR:
        idx = np.arange(int(x.shape[1] * music.SR / sr)) * sr / music.SR
        x = np.vstack([np.interp(idx, np.arange(x.shape[1]), c) for c in x])
    return x


def soundtrack(path):
    sr = music.SR
    n = int(sr * DURATION)
    starts = [s[1] for s in SHOTS[:10]]
    durs = [s[2] for s in SHOTS[:10]]
    mus = music.score(starts, durs, DURATION, SHOTS[10][1])
    narr_p = os.path.join(NARR, "narration.wav")
    narr = np.zeros((2, n))
    if os.path.exists(narr_p):
        x = read_wav(narr_p)[:, :n]
        narr[:, : x.shape[1]] = x
    # müzik kısma zarfı (sidechain benzeri)
    env = np.abs(narr).max(axis=0)
    win = int(0.03 * sr)
    env = np.convolve(env, np.ones(win) / win, mode="same")
    env = (env > 0.01).astype(np.float64)
    k = int(0.35 * sr)
    env = np.convolve(env, np.hanning(2 * k) / np.hanning(2 * k).sum(), mode="same")
    env = np.clip(env * 1.6, 0, 1)
    duck = 1 - 0.62 * env
    has_narr = narr.any()
    mix = mus * (0.30 if has_narr else 0.85) * duck[None, :] + narr * 0.95
    t = np.arange(n) / sr
    mix *= np.clip(t / 0.3, 0, 1) * np.clip((DURATION - t) / 1.4, 0, 1) ** 1.5
    peak = np.abs(mix).max()
    mix = np.tanh(1.2 * mix / peak) / np.tanh(1.2) * 0.9
    pcm = (mix.T * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


# --------------------------------------------------------------------------

def warm_up():
    """Fotoğraf hazırlıklarını (kesme maskesi vb.) ana süreçte bir kez yapıp diske önbellekle."""
    for i, s in enumerate(SHOTS):
        if s[3] == "photo":
            sh = photo_shot(i)
            if sh is not None:
                sh.render(0.5)


def encode(out, frames, wav, crf):
    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"]
    if wav:
        cmd += ["-i", wav]
    cmd += ["-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-tune", "grain",
            "-pix_fmt", "yuv420p"]
    if wav:
        cmd += ["-c:a", "aac", "-b:a", "192k", "-af", "loudnorm=I=-15:TP=-1.5:LRA=11",
                "-ar", "44100", "-shortest"]
    cmd += ["-movflags", "+faststart", out]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    # fork, OpenCV'nin iş parçacıkları açıkken kilitlenir; temiz süreçlerle başla
    ctx = multiprocessing.get_context("spawn")
    with ctx.Pool(os.cpu_count() or 2, initializer=init_worker) as pool:
        for k, fr in enumerate(pool.imap(render_frame, frames, chunksize=4)):
            proc.stdin.write(fr)
            if k % 150 == 0:
                print(f"  {k / FPS:5.1f} sn", flush=True)
    proc.stdin.close()
    if proc.wait() != 0:
        sys.exit("ffmpeg başarısız oldu")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=os.path.join(HERE, "ataturk-hayati-v2.mp4"))
    ap.add_argument("--stills")
    ap.add_argument("--stills-dir", default="stills")
    ap.add_argument("--preview", help="başlangıç-bitiş saniyesi, örn. 0-20")
    ap.add_argument("--crf", type=int, default=18)
    args = ap.parse_args()

    if args.stills:
        os.makedirs(args.stills_dir, exist_ok=True)
        for s in args.stills.split(","):
            p = os.path.join(args.stills_dir, f"v2_{float(s):05.2f}.png")
            render(float(s)).save(p)
            print(p)
        return

    warm_up()
    if args.preview:
        a, b = (float(v) for v in args.preview.split("-"))
        frames = range(int(a * FPS), int(b * FPS))
        out = os.path.splitext(args.out)[0] + f"_onizleme_{int(a)}-{int(b)}.mp4"
        encode(out, frames, None, 23)
        print("Önizleme:", out)
        return

    wav = os.path.splitext(args.out)[0] + ".wav"
    print("Ses hazırlanıyor…")
    soundtrack(wav)
    print("Kareler işleniyor…")
    encode(args.out, range(NFRAMES), wav, args.crf)
    os.remove(wav)
    print("Hazır:", args.out)


if __name__ == "__main__":
    main()
