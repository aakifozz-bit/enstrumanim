#!/usr/bin/env python3
"""Türkçe erkek anlatıcı sesi: Microsoft Edge sinir ağı sesi tr-TR-AhmetNeural (edge-tts).

Kullanım (CLI):
    python3 tts.py "metin" out.wav [--rate 1.0] [--pitch 0] [--gap 0.25] [--subs out.json] [--raw] [--lufs -16]
    python3 tts.py "@metin.txt" out.wav
    python3 tts.py --script research/script.json --outdir narration [--lufs -16]

Python:
    from tts import synth
    dur = synth(text, "out.wav", rate=1.0)      # -> süre (saniye)

Çıktı: 44.1 kHz, mono, 16-bit PCM WAV.

Ayrıntılar
- Metin cümlelere bölünür; her cümle ayrı istenir (paralel, yeniden denemeli),
  baş/son sessizlik kırpılır, cümleler arasına ~0.25 s duraklama konur
  (boş satırla ayrılmış paragraflar arasında ~0.6 s). Kenarlarda kısa fade: tık yok.
- İngilizce özel adlar Türkçe ses için fonetik yazıma çevrilir (PRON tablosu);
  `--raw` / `respell_names=False` bunu kapatır. Kesme işaretli ekler korunur:
  "Govan'ın" -> "Gavın'ın". Altyazılar (subs) her zaman ORİJİNAL yazımı kullanır;
  zamanlar edge-tts WordBoundary olaylarından gelir.
- Ağ: edge-tts wss:// kullanır; aiohttp wss için WSS_PROXY arar, bulamayınca doğrudan
  bağlanır ve sandbox bunu 403 (x-deny-reason: host_not_allowed) ile reddeder. Bu yüzden
  HTTPS_PROXY açıkça `proxy=` olarak verilir ve TLS için CCR CA paketi kullanılır.
"""
import argparse
import asyncio
import concurrent.futures
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
EDGE_PAD = 0.03   # cümle kırpmada konuşma başına bırakılan pay (s); sona 2x
FILE_PAD = 0.04   # dosyanın başında/sonunda bırakılan sessizlik (s)
BASE_RATE = 1.05  # rate=1.0 -> edge "+5%": test paragrafında ~2.45 kelime/s (hedef 2.3-2.6)
CONCURRENCY = 4
RETRIES = 5
PEAK_LIMIT = 10 ** (-1.0 / 20)  # -1 dBFS

_ca = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
if os.path.exists(_ca):
    _comm._SSL_CTX = ssl.create_default_context(cafile=_ca)
PROXY = (os.environ.get("WSS_PROXY") or os.environ.get("HTTPS_PROXY")
         or os.environ.get("https_proxy") or None)

# İngilizce adlar -> Ahmet'in doğru okuyacağı yazım. Ham okumalar wav2vec2 IPA tanıma ile
# kontrol edildi; ham hali iyi olanlar (Facebook, McDonald's, Oxford, Charvel, Chuck Berry,
# Joe Pass, Hendrix, Elvis, Bryan Beller, Hans Zimmer, legato, country, shred, hybrid
# picking, Seth...) listede yok. Yeni ad eklerken ekin ünlü uyumunu bozmayın
# ("Zimmer'le" -> "Zimır'le" kötü olurdu). Eşleşme tam kelime/öbek, büyük-küçük harf duyarlı.
PRON = {
    "Guthrie": "Gatri",                 # ham: "Gutiri"
    "Govan": "Gavın",                   # /ˈɡʌvən/
    "The Aristocrats": "Di Aristokrats",
    "Steven": "Stiven",
    "Wilson": "Vilson",
    "Erotic Cakes": "Erotik Keyks",     # ham: "Erotik Çakes"
    "Chelmsford": "Çelmsfırd",          # ham: "Şamşard" benzeri
    "Marco Minnemann": "Marko Minneman",
    "Essex": "Eseks",
    "Glasgow": "Glazgo",
    "Beatles": "Bitıls",
    "Cream": "Krim",
    "Tom Jenkinson": "Tom Cenkinsın",
    "Squarepusher": "Skuerpuşır",
    "Shrapnel": "Şrapnıl",
    "Guitarist dergisinin": "Gitarist dergisinin",
    "Wonderful Slippery Thing": "Vandırful Slipıri Ting",
    "Guitar Techniques": "Gitar Tekniks",
    "Hank Marvin": "Henk Marvin",
    "Shawn Lane": "Şon Leyn",
    "ACM": "Ey Si Em",
    "BIMM": "Bim",
    "Creative Guitar": "Kriyeytiv Gitar",
    "Asia": "Eyşa",
    "Aura": "Ora",
    "John Payne": "Con Peyn",
    "Jay Schellen": "Cey Şelen",
    "GPS": "Ci Pi Es",
    "The Young Punx": "Dı Yang Panks",
    "Dizzee Rascal": "Dizi Raskıl",
    "Paul Cornford": "Pol Kornfırd",
    "Richie Kotzen": "Riçi Kotzen",
    "Los Angeles": "Los Ancılıs",
    "Pete Riley": "Pit Rayli",
    "The Simpsons": "Dı Simpsıns",
    "Homer": "Homır",
    "NAMM": "Nem",
    "Bass Bash": "Beys Beş",
    "Greg Howe": "Greg Hau",
    "Duck": "Dak",
    "Porcupine Tree": "Porkyupayn Tri",
    "The Raven That Refused to Sing": "Dı Reyvın Det Rifyuzd Tu Sing",
    "Jazzmaster": "Cezmastır",
    "Drive Home": "Drayv Hom",
    "Hand. Cannot. Erase.": "Hend, Kenot, İreyz",
    "YouTube": "Yutyub",
    "Hans Zimmer Live": "Hans Zimmer Layv",
    "Dune": "Dyun",
    "Denis Villeneuve": "Döni Vilnöv",
    "tapping": "teping",
    "volume pedalı": "volyum pedalı",
    "Victory": "Viktori",
    "Fractal": "Fraktıl",
    "Karnivool": "Karnivul",
}
_PRON_RE = re.compile(r"(?<!\w)(" + "|".join(sorted(map(re.escape, PRON), key=len, reverse=True))
                      + r")(?!\w)")
# Cümle bölücünün içinden bölmemesi gereken öbekler
NOSPLIT = ["Hand. Cannot. Erase."]
_NS = "\u2060"  # word joiner (boşluk değil)


def respell_map(text, enabled=True):
    """(söylenen_metin, eşleme) döndürür; eşleme = [(sp0, sp1, or0, or1)] değiştirilen aralıklar."""
    if not enabled:
        return text, []
    out, segs, last, sp = [], [], 0, 0
    for m in _PRON_RE.finditer(text):
        out.append(text[last:m.start()])
        sp += m.start() - last
        rep = PRON[m.group(1)]
        segs.append((sp, sp + len(rep), m.start(), m.end()))
        out.append(rep)
        sp += len(rep)
        last = m.end()
    out.append(text[last:])
    return "".join(out), segs


def respell(text):
    return respell_map(text)[0]


def _sp2or(i, segs):
    shift = 0
    for s0, s1, o0, o1 in segs:
        if i < s0:
            break
        if i < s1:
            return o0
        shift = o1 - s1
    return i + shift


# --- cümle bölme --------------------------------------------------------------
_ABBR = {"dr", "prof", "st", "mr", "mrs", "ms", "vb", "vs", "örn", "bkz", "no", "yy", "jr", "sr"}
_UP = "A-ZÇĞİÖŞÜ"


def split_sentences(text):
    """[(cümle, paragraf_sonu_mu)] döndürür."""
    for ph in NOSPLIT:
        text = text.replace(ph, ph.replace(" ", _NS))
    out = []
    paras = [p for p in re.split(r"\n\s*\n", text.strip()) if p.strip()]
    for pi, para in enumerate(paras):
        para = re.sub(r"\s+", " ", para).strip()
        cands = re.split(rf"(?:(?<=[.!?…])|(?<=[.!?…][\"”’»)']))\s+(?=[\"“‘«(']?[{_UP}0-9])", para)
        sents = []
        for c in cands:
            if sents:
                prev = sents[-1]
                m = re.search(r"(\w+)\.$", prev)
                if m and m.group(1).lower() in _ABBR:
                    sents[-1] = prev + " " + c
                    continue
            sents.append(c)
        fin = []  # çok uzun cümleleri ; veya , noktasında böl (edge isteği küçük kalsın)
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
                out.append((s.strip().replace(_NS, " "), si == len(fin) - 1 and pi < len(paras) - 1))
    return out


def chunk_text(s, max_chars=70):
    """Altyazı için cümleyi <= max_chars dengeli parçalara böler; [(başlangıç, bitiş)] karakter aralıkları.
    Noktalama sonrası ve bağlaç öncesi kesmeyi tercih eder, özel adları (art arda büyük harfli
    kelimeleri) bölmemeye çalışır."""
    toks = [(m.start(), m.end()) for m in re.finditer(r"\S+", s)]
    conj = {"ve", "ama", "ile", "ya", "veya", "ise", "yani", "ancak", "fakat", "çünkü"}
    out, i = [], 0
    while i < len(toks):
        a = toks[i][0]
        rest = toks[-1][1] - a
        if rest <= max_chars:
            out.append((a, toks[-1][1]))
            break
        n = -(-rest // max_chars)
        ideal = rest / n
        best, best_k = None, None
        for k in range(i, len(toks) - 1):
            L = toks[k][1] - a
            if L > max_chars:
                break
            w, nxt = s[toks[k][0]:toks[k][1]], s[toks[k + 1][0]:toks[k + 1][1]]
            sc = -abs(L - ideal) / ideal
            if re.search(r"[,;:—–][\"'”’]?$", w):
                sc += 1.0
            if nxt.lower() in conj:
                sc += 0.4
            if w[:1].isupper() and nxt[:1].isupper() and not re.search(r"[,;:.]$", w):
                sc -= 1.5
            if toks[-1][1] - toks[k + 1][0] < 12:
                sc -= 1.0
            if best is None or sc > best:
                best, best_k = sc, k
        if best_k is None:
            best_k = i
        out.append((a, toks[best_k][1]))
        i = best_k + 1
    return out


# --- ses işleme ---------------------------------------------------------------
def _decode_mp3(data):
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", "pipe:0", "-f", "f32le", "-ac", "1",
                        "-ar", str(SR_EDGE), "pipe:1"], input=data, capture_output=True, check=True)
    return np.frombuffer(p.stdout, np.float32).copy()


def _active_range(x, sr, thr_db=-50.0):
    fr = int(0.01 * sr)
    n = len(x) // fr
    if n == 0:
        return 0, len(x)
    rms = np.sqrt(np.mean(x[: n * fr].reshape(n, fr) ** 2, axis=1) + 1e-12)
    idx = np.where(20 * np.log10(rms) > thr_db)[0]
    if len(idx) == 0:
        return 0, 0
    return idx[0] * fr, (idx[-1] + 1) * fr


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


def measure_lufs(x, sr):
    """EBU R128 entegre yükseklik (ffmpeg ebur128)."""
    p = subprocess.run(["ffmpeg", "-nostats", "-hide_banner", "-f", "f32le", "-ar", str(sr), "-ac", "1",
                        "-i", "pipe:0", "-af", "ebur128", "-f", "null", "-"],
                       input=np.asarray(x, np.float32).tobytes(), capture_output=True)
    m = re.findall(r"I:\s+(-?[\d.]+|-inf) LUFS", p.stderr.decode(errors="ignore"))
    return float(m[-1]) if m and m[-1] != "-inf" else float("-inf")


def _limit(x, sr, limit=PEAK_LIMIT, look_ms=3.0):
    """Basit ileri-bakışlı tepe sınırlayıcı (yalnızca eşiği aşan tepelerde devreye girer)."""
    if np.max(np.abs(x)) <= limit:
        return x
    from scipy.ndimage import maximum_filter1d, uniform_filter1d
    L = max(1, int(sr * look_ms / 1000))
    env = maximum_filter1d(np.abs(x), size=2 * L + 1)
    g = np.minimum(1.0, limit / np.maximum(env, 1e-9))
    g = uniform_filter1d(g, size=2 * L - 1 if L > 1 else 1)
    return (x * g).astype(np.float32)


def loudnorm(x, sr, target=-16.0):
    for _ in range(3):
        cur = measure_lufs(x, sr)
        if not np.isfinite(cur) or abs(cur - target) < 0.15:
            break
        x = _limit((x * 10 ** ((target - cur) / 20)).astype(np.float32), sr)
    return x


def _write_wav(path, x, sr):
    import soundfile as sf
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    sf.write(path, np.clip(x, -1.0, 1.0), sr, subtype="PCM_16")


# --- edge-tts -----------------------------------------------------------------
def _rate_str(rate):
    pct = int(round((rate * BASE_RATE - 1.0) * 100))
    return f"{pct:+d}%"


async def _edge_one(text, voice, rate, pitch, sem):
    async with sem:
        last = None
        for attempt in range(RETRIES):
            try:
                c = edge_tts.Communicate(text, voice, rate=_rate_str(rate), pitch=f"{int(pitch):+d}Hz",
                                         boundary="WordBoundary", proxy=PROXY)
                buf, words = bytearray(), []
                async for ch in c.stream():
                    if ch["type"] == "audio":
                        buf.extend(ch["data"])
                    elif ch["type"] == "WordBoundary":
                        words.append((ch["offset"] / 1e7, (ch["offset"] + ch["duration"]) / 1e7, ch["text"]))
                if not buf:
                    raise RuntimeError("boş ses")
                return bytes(buf), words
            except Exception as e:  # ağ / servis hatası -> bekle, tekrar dene
                last = e
                await asyncio.sleep(1.5 * (attempt + 1))
        raise RuntimeError(f"edge-tts başarısız ({text[:40]!r}...): {last}")


async def _edge_all(texts, voice, rate, pitch, conc):
    sem = asyncio.Semaphore(conc)
    return await asyncio.gather(*[_edge_one(t, voice, rate, pitch, sem) for t in texts])


def _run(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    with concurrent.futures.ThreadPoolExecutor(1) as ex:  # çağıran bir event loop içindeyse
        return ex.submit(asyncio.run, coro).result()


def render(text, rate=1.0, pitch=0, gap=GAP, para_gap=PARA_GAP, respell_names=True, voice=VOICE,
           lufs=None, max_chars=70, conc=CONCURRENCY):
    """Sesi üretir. (ses_44k_float32, altyazı_satırları, bilgi) döndürür."""
    sents = split_sentences(text)
    if not sents:
        raise ValueError("boş metin")
    do_resp = respell_names and voice.startswith("tr-")
    maps = [respell_map(s, do_resp) for s, _ in sents]
    res = _run(_edge_all([m[0] for m in maps], voice, rate, pitch, conc))

    sr = SR_EDGE
    parts, cues, pos, speech, gaps = [], [], 0, 0.0, 0.0
    for i, ((orig, para_end), (spoken, segs), (mp3, words)) in enumerate(zip(sents, maps, res)):
        x = _decode_mp3(mp3)
        a0, a1 = _active_range(x, sr)
        s0 = max(0, a0 - int(EDGE_PAD * sr))
        s1 = min(len(x), a1 + int(2 * EDGE_PAD * sr))
        a = _fade(x[s0:s1].copy(), sr)
        t_base = (pos - s0) / sr
        # kelime sınırları -> orijinal metindeki karakter konumları
        wl, cur = [], 0
        for t0, t1, w in words:
            k = spoken.find(w, cur)
            if k < 0:
                continue
            cur = k + len(w)
            wl.append((_sp2or(k, segs), t0 + t_base, t1 + t_base))
        sent_t0, sent_t1 = pos / sr, (pos + len(a)) / sr
        for c0, c1 in chunk_text(orig, max_chars):
            ws = [w for w in wl if c0 <= w[0] < c1]
            if ws:
                st, en = min(w[1] for w in ws), max(w[2] for w in ws)
            else:  # olmaması gerekir; orantılı tahmin
                st = sent_t0 + (sent_t1 - sent_t0) * c0 / len(orig)
                en = sent_t0 + (sent_t1 - sent_t0) * c1 / len(orig)
            cues.append({"start": st, "end": en, "text": orig[c0:c1]})
        parts.append(a)
        speech += len(a) / sr
        pos += len(a)
        if i < len(sents) - 1:
            g = para_gap if para_end else gap
            n = max(0, int((g - 3 * EDGE_PAD) * sr))  # kırpma payları duraklamanın parçası
            parts.append(np.zeros(n, np.float32))
            pos += n
            gaps += n / sr
    y = np.concatenate(parts)
    # dosya başı/sonu: FILE_PAD kadar sessizlik bırak
    a0, a1 = _active_range(y, sr)
    lead = max(0, a0 - int(FILE_PAD * sr))
    tail = min(len(y), a1 + int(FILE_PAD * sr))
    y = y[lead:tail]
    if lead:
        y[: int(0.004 * sr)] *= np.linspace(0, 1, int(0.004 * sr), dtype=np.float32)
    y = _resample(y, sr, SR_OUT)
    dur = len(y) / SR_OUT
    for c in cues:
        c["start"] = round(max(0.0, c["start"] - lead / sr), 3)
        c["end"] = round(min(dur, c["end"] - lead / sr), 3)
    if lufs is not None:
        y = loudnorm(y, SR_OUT, lufs)
    else:
        y = _limit(y, SR_OUT)
    info = {"duration": round(dur, 3), "speech": round(speech, 3), "gaps": round(gaps, 3), "rate": rate,
            "edge_rate": _rate_str(rate), "sentences": len(sents)}
    return y, cues, info


def synth(text, out_wav, rate=1.0, pitch=0, gap=GAP, para_gap=PARA_GAP, respell_names=True,
          subs=None, voice=VOICE, lufs=None):
    """Metni seslendirip out_wav'a yazar (44.1 kHz mono 16-bit). Süreyi (s) döndürür.

    rate: 1.0 = belgesel hızı (~2.45 kelime/s; sesin kendi hızının %5 üstü), 1.1 = %10 daha hızlı.
    pitch: Hz cinsinden perde kayması (ör. -5).
    subs: verilirse altyazı satırları (orijinal yazım, <=70 karakter) JSON olarak yazılır.
    voice: başka bir edge sesi (ör. en-US-BrianMultilingualNeural); tr-TR dışı seslerde
           fonetik yazım uygulanmaz (çok dilli sesler İngilizce adları kendisi doğru okur).
    lufs: verilirse çıktı bu entegre yüksekliğe (LUFS) normalize edilir (tepe <= -1 dBFS).
    """
    y, cues, info = render(text, rate, pitch, gap, para_gap, respell_names, voice, lufs)
    _write_wav(out_wav, y, SR_OUT)
    if subs:
        with open(subs, "w", encoding="utf-8") as f:
            json.dump({"duration": info["duration"], "lines": cues}, f, ensure_ascii=False, indent=1)
    return info["duration"]


# --- senaryo modu ---------------------------------------------------------------
def synth_script(script_json, outdir, lufs=-16.0, pad_sec=1.0, min_rate=0.92, max_rate=1.12, workers=3):
    """script.json'daki her segmenti narration/seg_<id>.wav olarak üretir; süreyi target_sec - pad_sec'e
    yaklaştırmak için hızı segment başına hafifçe ayarlar. subs.json ve narration.json yazar."""
    segs = json.load(open(script_json, encoding="utf-8"))
    if isinstance(segs, dict):
        segs = segs["segments"]
    os.makedirs(outdir, exist_ok=True)

    def one(seg):
        target = float(seg["target_sec"]) - pad_sec
        rate, tries = 1.0, []
        for _ in range(3):
            y, cues, info = render(seg["narration_tr"], rate=rate, lufs=lufs, conc=3)
            tries.append((abs(info["duration"] - target), rate, y, cues, info))
            err = info["duration"] - target
            if -0.6 <= err <= 0.3:
                break
            new = rate * info["speech"] / max(1.0, target - info["gaps"])
            new = min(max_rate, max(min_rate, new))
            if abs(new - rate) < 0.005:
                break
            rate = round(new, 3)
        _, rate, y, cues, info = min(tries, key=lambda t: t[0])
        out = os.path.join(outdir, f"seg_{seg['id']}.wav")
        _write_wav(out, y, SR_OUT)
        info.update(file=os.path.basename(out), target_sec=seg["target_sec"],
                    lufs=round(measure_lufs(y, SR_OUT), 1),
                    peak_dbfs=round(20 * np.log10(np.max(np.abs(y)) + 1e-9), 1))
        print(f"{seg['id']:18s} {info['duration']:6.2f}s (hedef {target:.1f}) rate {rate:.3f} "
              f"[{info['edge_rate']}] {info['lufs']} LUFS", flush=True)
        return seg["id"], cues, info

    with concurrent.futures.ThreadPoolExecutor(workers) as ex:
        results = list(ex.map(one, segs))
    subs = {sid: cues for sid, cues, _ in results}
    meta = {sid: info for sid, _, info in results}
    with open(os.path.join(outdir, "subs.json"), "w", encoding="utf-8") as f:
        json.dump(subs, f, ensure_ascii=False, indent=1)
    with open(os.path.join(outdir, "narration.json"), "w", encoding="utf-8") as f:
        json.dump({"voice": VOICE, "total_sec": round(sum(m["duration"] for m in meta.values()), 2),
                   "segments": meta}, f, ensure_ascii=False, indent=1)
    return meta


def main():
    ap = argparse.ArgumentParser(description="Türkçe anlatım (tr-TR-AhmetNeural) -> 44.1 kHz WAV")
    ap.add_argument("text", nargs="?", help="metin, ya da @dosya.txt")
    ap.add_argument("out", nargs="?")
    ap.add_argument("--rate", type=float, default=1.0)
    ap.add_argument("--pitch", type=int, default=0, help="Hz")
    ap.add_argument("--gap", type=float, default=GAP)
    ap.add_argument("--subs", help="altyazı satırları JSON")
    ap.add_argument("--raw", action="store_true", help="İngilizce adları fonetik yazıma çevirme")
    ap.add_argument("--voice", default=VOICE)
    ap.add_argument("--lufs", type=float, default=None, help="ör. -16 (senaryo modunda varsayılan -16)")
    ap.add_argument("--script", help="script.json (segment başına seg_<id>.wav üretir)")
    ap.add_argument("--outdir", default="narration")
    a = ap.parse_args()
    if a.script:
        meta = synth_script(a.script, a.outdir, lufs=-16.0 if a.lufs is None else a.lufs)
        print(f"toplam {sum(m['duration'] for m in meta.values()):.2f} s")
        return 0
    if not (a.text and a.out):
        ap.error("metin ve çıktı dosyası gerekli (ya da --script)")
    text = a.text
    if text.startswith("@") and os.path.exists(text[1:]):
        text = open(text[1:], encoding="utf-8").read()
    d = synth(text, a.out, rate=a.rate, pitch=a.pitch, gap=a.gap, respell_names=not a.raw, subs=a.subs,
              voice=a.voice, lufs=a.lufs)
    print(f"{a.out}: {d:.2f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
