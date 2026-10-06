#!/usr/bin/env python3
"""ElevenLabs ile Türkçe anlatım (eleven_multilingual_v2 / eleven_v3).

API anahtarı iki yoldan biriyle gelir:
  - ortamın "API credentials" ayarı (api.elevenlabs.io için xi-api-key başlığı; ara sunucu ekler), ya da
  - ELEVENLABS_API_KEY ortam değişkeni.

Kullanım:
    python3 tts_eleven.py --voices                          # kullanılabilir sesleri listele
    python3 tts_eleven.py --sample VOICE_ID out.wav "metin"  # tek örnek
    python3 tts_eleven.py --script research/script_lively.json --voice VOICE_ID --outdir narration

Çıktı: narration/seg_<id>.wav (44.1 kHz mono 16-bit, -16 LUFS), subs.json (cümle/öbek zamanları),
narration.json. Alt yazı zamanları ElevenLabs'ın karakter hizalamasından (with-timestamps) gelir.
"""
import argparse
import base64
import json
import os
import re
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request

import numpy as np

API = "https://api.elevenlabs.io/v1"
SR = 44100
CA = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
CTX = ssl.create_default_context(cafile=CA) if os.path.exists(CA) else ssl.create_default_context()


def _req(method, path, body=None, timeout=180):
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    key = os.environ.get("ELEVENLABS_API_KEY")
    if key:
        headers["xi-api-key"] = key
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(5):
        req = urllib.request.Request(API + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="replace")[:400]
            if e.code in (429, 500, 502, 503) and attempt < 4:
                time.sleep(2 * (attempt + 1))
                continue
            raise SystemExit(f"ElevenLabs HTTP {e.code}: {msg}")


def voices():
    return _req("GET", "/voices")["voices"]


def _decode_mp3(b):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", "-", "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         input=b, capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def _lufs(x):
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".wav") as tf:
        _write(tf.name, x)
        out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", tf.name, "-af", "ebur128",
                              "-f", "null", "-"], capture_output=True, text=True).stderr
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", out)
    return float(m[-1]) if m else -23.0


def _write(path, x):
    import wave
    pcm = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def synth(text, voice_id, model="eleven_multilingual_v2", stability=0.45, similarity=0.8, style=0.35,
          speed=1.0, prev=None, nxt=None):
    """-> (audio float mono 44.1k, chars, starts, ends)"""
    body = {"text": text, "model_id": model,
            "voice_settings": {"stability": stability, "similarity_boost": similarity, "style": style,
                               "use_speaker_boost": True, "speed": speed}}
    if prev:
        body["previous_text"] = prev
    if nxt:
        body["next_text"] = nxt
    r = _req("POST", f"/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128", body)
    audio = _decode_mp3(base64.b64decode(r["audio_base64"]))
    al = r.get("normalized_alignment") or r.get("alignment") or {}
    return audio, al.get("characters", []), al.get("character_start_times_seconds", []), \
        al.get("character_end_times_seconds", [])


def trim(x, thr_db=-45):
    thr = 10 ** (thr_db / 20)
    idx = np.nonzero(np.abs(x) > thr)[0]
    if not len(idx):
        return x, 0.0
    a = max(0, idx[0] - int(0.04 * SR))
    b = min(len(x), idx[-1] + int(0.08 * SR))
    return x[a:b], a / SR


def chunks_from_alignment(text, chars, starts, ends, offset, max_chars=70):
    """Karakter hizalamasından ≤70 karakterlik alt yazı öbekleri (orijinal metinle)."""
    if not chars:
        return []
    s = "".join(chars)
    # metni cümle/öbeklere böl
    parts = re.split(r"(?<=[.!?…])\s+", text.strip())
    out = []
    pos = 0
    for p in parts:
        words = p.split()
        line = ""
        lines = []
        for w in words:
            cand = (line + " " + w).strip()
            if line and len(cand) > max_chars:
                lines.append(line)
                line = w
            else:
                line = cand
        if line:
            lines.append(line)
        for ln in lines:
            i = s.find(ln[:8], pos)
            if i < 0:
                i = pos
            j = min(len(starts) - 1, i + len(ln) - 1)
            out.append({"start": round(max(0.0, starts[i] - offset), 3),
                        "end": round(max(0.0, ends[j] - offset), 3), "text": ln})
            pos = i + len(ln)
    return out


def synth_script(script, voice_id, outdir, model, speed, style, stability):
    segs = json.load(open(script, encoding="utf-8"))
    os.makedirs(outdir, exist_ok=True)
    subs, meta = {}, {}
    for k, seg in enumerate(segs):
        text = seg["narration_tr"]
        prev = segs[k - 1]["narration_tr"][-300:] if k else None
        nxt = segs[k + 1]["narration_tr"][:300] if k + 1 < len(segs) else None
        x, chars, st, en = synth(text, voice_id, model, stability=stability, style=style, speed=speed,
                                 prev=prev, nxt=nxt)
        x, off = trim(x)
        g = 10 ** ((-16.0 - _lufs(x)) / 20)
        x = x * g
        pk = np.abs(x).max()
        if pk > 0.89:
            x = x * 0.89 / pk
        out = os.path.join(outdir, f"seg_{seg['id']}.wav")
        _write(out, x)
        subs[seg["id"]] = chunks_from_alignment(text, chars, st, en, off)
        meta[seg["id"]] = {"duration": round(len(x) / SR, 2), "target_sec": seg["target_sec"]}
        print(f"{seg['id']:18s} {len(x) / SR:6.2f}s (hedef {seg['target_sec']})", flush=True)
    with open(os.path.join(outdir, "subs.json"), "w", encoding="utf-8") as f:
        json.dump(subs, f, ensure_ascii=False, indent=1)
    with open(os.path.join(outdir, "narration.json"), "w", encoding="utf-8") as f:
        json.dump({"engine": "elevenlabs", "model": model, "voice_id": voice_id,
                   "total_sec": round(sum(m["duration"] for m in meta.values()), 2), "segments": meta},
                  f, ensure_ascii=False, indent=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voices", action="store_true")
    ap.add_argument("--sample", nargs=3, metavar=("VOICE_ID", "OUT", "TEXT"))
    ap.add_argument("--script")
    ap.add_argument("--voice")
    ap.add_argument("--outdir", default="narration")
    ap.add_argument("--model", default="eleven_multilingual_v2")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--style", type=float, default=0.35)
    ap.add_argument("--stability", type=float, default=0.45)
    a = ap.parse_args()
    if a.voices:
        for v in voices():
            lab = v.get("labels") or {}
            print(v["voice_id"], "|", v["name"], "|", lab.get("gender"), lab.get("accent"), lab.get("age"),
                  lab.get("use_case") or lab.get("descriptive"))
        return
    if a.sample:
        vid, out, text = a.sample
        x, *_ = synth(text, vid, a.model, stability=a.stability, style=a.style, speed=a.speed)
        x, _ = trim(x)
        _write(out, x * 10 ** ((-16.0 - _lufs(x)) / 20))
        print(out, round(len(x) / SR, 2), "s")
        return
    if a.script:
        if not a.voice:
            sys.exit("--voice gerekli")
        synth_script(a.script, a.voice, a.outdir, a.model, a.speed, a.style, a.stability)
        return
    ap.print_help()


if __name__ == "__main__":
    main()
