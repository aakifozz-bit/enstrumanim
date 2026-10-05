#!/usr/bin/env python3
"""Türkçe erkek anlatıcı sesi: Microsoft Edge sinir ağı sesi tr-TR-AhmetNeural (edge-tts).

Kullanım (CLI):
    python3 tts.py "metin" out.wav [--rate 1.0] [--pitch 0] [--gap 0.25] [--subs out.json] [--raw]

Python:
    from tts import synth
    dur = synth(text, "out.wav", rate=1.0)      # -> süre (saniye)

Çıktı: 44.1 kHz, mono, 16-bit PCM WAV.

Ayrıntılar
- Metin cümlelere bölünür; her cümle ayrı istenir (paralel, yeniden denemeli),
  baş/son sessizlik kırpılır, cümleler arasına ~0.25 s duraklama konur
  (boş satırla ayrılmış paragraflar arasında ~0.6 s). Kenarlarda kısa fade: tık yok.
- İngilizce özel adlar Türkçe ses için fonetik yazıma çevrilir (PRON tablosu);
  `--raw` / `respell=False` bunu kapatır. Kesme işaretli ekler korunur:
  "Govan'ın" -> "Gavın'ın".
- Ağ: edge-tts wss:// kullanır; aiohttp wss için WSS_PROXY arar, bulamayınca doğrudan
  bağlanır ve sandbox bunu 403 (x-deny-reason: host_not_allowed) ile reddeder. Bu yüzden
  HTTPS_PROXY açıkça `proxy=` olarak verilir ve TLS için CCR CA paketi kullanılır.
"""
import argparse
import asyncio
import json
import os
import re
import ssl
import subprocess
import sys
from math import gcd

import numpy as np

import edge_tts
from edge_tts import communicate as _comm

VOICE = "tr-TR-AhmetNeural"
SR_OUT = 44100
SR_EDGE = 24000  # edge-tts: audio-24khz-48kbitrate-mono-mp3
GAP = 0.25        # cümleler arası sessizlik (s)
PARA_GAP = 0.60   # paragraflar arası sessizlik (s)
EDGE_PAD = 0.03   # kırpmada konuşma başına/sonuna bırakılan pay (s)
CONCURRENCY = 4
RETRIES = 5

_ca = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
if os.path.exists(_ca):
    _comm._SSL_CTX = ssl.create_default_context(cafile=_ca)
PROXY = (os.environ.get("WSS_PROXY") or os.environ.get("HTTPS_PROXY")
         or os.environ.get("https_proxy") or None)

# İngilizce adlar -> Ahmet'in doğru okuyacağı yazım (wav2vec2 IPA tanıma ile kontrol edildi).
# Sıra önemli: uzun kalıplar önce.
PRON = [
    (r"\bGuthrie\b", "Gatri"),            # /ˈɡʌθri/  (ham: "Gutiri")
    (r"\bGovan\b", "Gavın"),              # /ˈɡʌvən/  (ham: "Govan")
    (r"\bThe Aristocrats\b", "Di Aristokrats"),
    (r"\bSteven\b", "Stiven"),
    (r"\bWilson\b", "Vilson"),
    (r"\bErotic Cakes\b", "Erotik Keyks"),  # ham: "Erotik Çakes"
    (r"\bCakes\b", "Keyks"),
    (r"\bChelmsford\b", "Çelmsfırd"),       # ham: "Şamşard" benzeri
    (r"\bMarco\b", "Marko"),
    (r"\bMinnemann\b", "Minneman"),
    # Ham hali zaten iyi okunanlar: Bryan Beller ("Brayan Beller"), Hans Zimmer ("Hans Zimır").
    # Yeni ad eklerken ekin ünlü uyumunu bozmayın: "Zimmer'le" -> "Zimır'le" kötü olurdu.
]


def respell(text):
    for pat, rep in PRON:
        text = re.sub(pat, rep, text)
    return text


# --- cümle bölme --------------------------------------------------------------
_ABBR = {"dr", "prof", "st", "mr", "mrs", "ms", "vb", "vs", "örn", "bkz", "no", "yy", "jr", "sr"}
_UP = "A-ZÇĞİÖŞÜ"


def split_sentences(text):
    """[(cümle, paragraf_sonu_mu)] döndürür."""
    out = []
    paras = [p for p in re.split(r"\n\s*\n", text.strip()) if p.strip()]
    for pi, para in enumerate(paras):
        para = re.sub(r"\s+", " ", para).strip()
        cands = re.split(rf"(?<=[.!?…])[\"”’»)]*\s+(?=[\"“‘«(]?[{_UP}0-9])", para)
        sents = []
        for c in cands:
            if sents:
                prev = sents[-1]
                m = re.search(r"(\w+)\.$", prev)
                if m and m.group(1).lower() in _ABBR:
                    sents[-1] = prev + " " + c
                    continue
            sents.append(c)
        # çok uzun cümleleri ; veya , noktasında böl (edge isteği küçük kalsın)
        fin = []
        for s in sents:
            while len(s) > 350:
                cut = max(s.rfind("; ", 0, 350), s.rfind(", ", 0, 350))
                if cut < 100:
                    break
                fin.append(s[: cut + 1])
                s = s[cut + 2:]
            fin.append(s)
        for si, s in enumerate(fin):
            if s.strip():
                out.append((s.strip(), si == len(fin) - 1 and pi < len(paras) - 1))
    return out


# --- ses işleme ---------------------------------------------------------------
def _decode_mp3(data):
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", "pipe:0", "-f", "f32le", "-ac", "1",
                        "-ar", str(SR_EDGE), "pipe:1"], input=data, capture_output=True, check=True)
    return np.frombuffer(p.stdout, np.float32).copy()


def _trim(x, sr, thr_db=-50.0, pad=EDGE_PAD):
    fr = int(0.01 * sr)
    n = len(x) // fr
    if n == 0:
        return x
    rms = np.sqrt(np.mean(x[: n * fr].reshape(n, fr) ** 2, axis=1) + 1e-12)
    idx = np.where(20 * np.log10(rms) > thr_db)[0]
    if len(idx) == 0:
        return x[:0]
    s = max(0, idx[0] * fr - int(pad * sr))
    e = min(len(x), (idx[-1] + 1) * fr + int(2 * pad * sr))
    return x[s:e]


def _fade(x, sr, ms=6):
    k = min(len(x) // 2, int(sr * ms / 1000))
    if k > 0:
        r = np.linspace(0.0, 1.0, k, dtype=np.float32)
        x[:k] *= r
        x[-k:] *= r[::-1]
    return x


def _resample(x, sr_in, sr_out):
    if sr_in == sr_out:
        return x
    from scipy.signal import resample_poly
    g = gcd(sr_in, sr_out)
    return resample_poly(x, sr_out // g, sr_in // g).astype(np.float32)


def _write_wav(path, x, sr):
    import soundfile as sf
    d = os.path.dirname(os.path.abspath(path))
    os.makedirs(d, exist_ok=True)
    sf.write(path, np.clip(x, -1.0, 1.0), sr, subtype="PCM_16")


# --- edge-tts -----------------------------------------------------------------
def _rate_str(rate):
    pct = int(round((rate - 1.0) * 100))
    return f"{pct:+d}%"


async def _edge_one(text, voice, rate, pitch, sem):
    async with sem:
        last = None
        for attempt in range(RETRIES):
            try:
                c = edge_tts.Communicate(text, voice, rate=_rate_str(rate), pitch=f"{int(pitch):+d}Hz",
                                         proxy=PROXY)
                buf = bytearray()
                async for ch in c.stream():
                    if ch["type"] == "audio":
                        buf.extend(ch["data"])
                if not buf:
                    raise RuntimeError("boş ses")
                return bytes(buf)
            except Exception as e:  # ağ / servis hatası -> bekle, tekrar dene
                last = e
                await asyncio.sleep(1.5 * (attempt + 1))
        raise RuntimeError(f"edge-tts başarısız ({text[:40]!r}...): {last}")


async def _edge_all(texts, voice, rate, pitch):
    sem = asyncio.Semaphore(CONCURRENCY)
    return await asyncio.gather(*[_edge_one(t, voice, rate, pitch, sem) for t in texts])


def synth(text, out_wav, rate=1.0, pitch=0, gap=GAP, para_gap=PARA_GAP, respell_names=True,
          subs=None, voice=VOICE):
    """Metni seslendirip out_wav'a yazar (44.1 kHz mono 16-bit). Süreyi (s) döndürür.

    rate: 1.0 = sesin doğal hızı (~2.4 kelime/s), 1.1 = %10 hızlı.
    pitch: Hz cinsinden perde kayması (ör. -5).
    subs: verilirse cümle zamanlamaları (orijinal metinle) JSON olarak yazılır.
    voice: başka bir edge sesi (ör. en-US-BrianMultilingualNeural); tr-TR dışı seslerde
           fonetik yazım uygulanmaz (çok dilli sesler İngilizce adları kendisi doğru okur).
    """
    sents = split_sentences(text)
    if not sents:
        raise ValueError("boş metin")
    do_respell = respell_names and voice.startswith("tr-")
    spoken = [respell(s) if do_respell else s for s, _ in sents]
    loop_ran = False
    try:
        asyncio.get_running_loop()
        loop_ran = True
    except RuntimeError:
        pass
    if loop_ran:  # çağıran zaten bir event loop içindeyse ayrı thread'de çalıştır
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(1) as ex:
            mp3s = ex.submit(asyncio.run, _edge_all(spoken, voice, rate, pitch)).result()
    else:
        mp3s = asyncio.run(_edge_all(spoken, voice, rate, pitch))

    sr = SR_EDGE
    parts, timings, pos = [], [], 0
    for i, ((orig, para_end), data) in enumerate(zip(sents, mp3s)):
        a = _fade(_trim(_decode_mp3(data), sr), sr)
        parts.append(a)
        timings.append({"text": orig, "start": round(pos / sr, 3), "end": round((pos + len(a)) / sr, 3)})
        pos += len(a)
        if i < len(sents) - 1:
            g = para_gap if para_end else gap
            # kırpma payları (EDGE_PAD + 2*EDGE_PAD) duraklamanın parçası sayılır
            n = max(0, int((g - 3 * EDGE_PAD) * sr))
            parts.append(np.zeros(n, np.float32))
            pos += n
    y = _resample(np.concatenate(parts), sr, SR_OUT)
    _write_wav(out_wav, y, SR_OUT)
    dur = len(y) / SR_OUT
    if subs:
        with open(subs, "w", encoding="utf-8") as f:
            json.dump({"duration": round(dur, 3), "sentences": timings}, f, ensure_ascii=False, indent=1)
    return dur


def main():
    ap = argparse.ArgumentParser(description="Türkçe anlatım (tr-TR-AhmetNeural) -> 44.1 kHz WAV")
    ap.add_argument("text", help="metin, ya da @dosya.txt")
    ap.add_argument("out")
    ap.add_argument("--rate", type=float, default=1.0)
    ap.add_argument("--pitch", type=int, default=0, help="Hz")
    ap.add_argument("--gap", type=float, default=GAP)
    ap.add_argument("--subs", help="cümle zamanlamaları JSON")
    ap.add_argument("--raw", action="store_true", help="İngilizce adları fonetik yazıma çevirme")
    ap.add_argument("--voice", default=VOICE)
    a = ap.parse_args()
    text = a.text
    if text.startswith("@") and os.path.exists(text[1:]):
        text = open(text[1:], encoding="utf-8").read()
    d = synth(text, a.out, rate=a.rate, pitch=a.pitch, gap=a.gap, respell_names=not a.raw, subs=a.subs,
              voice=a.voice)
    print(f"{a.out}: {d:.2f} s")


if __name__ == "__main__":
    sys.exit(main())
