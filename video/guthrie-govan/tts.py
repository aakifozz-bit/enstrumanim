#!/usr/bin/env python3
"""Microsoft Edge sinir ağı Türkçe sesiyle (tr-TR-AhmetNeural) anlatım üretir.

Kullanım: python3 tts.py "metin" cikti.mp3 [--rate +5%] [--subs cikti.json]
Kurumsal ara sunucu (proxy) varsa SSL_CERT_FILE / CCR CA paketi kullanılır.
"""
import argparse
import asyncio
import json
import os
import ssl

import edge_tts
from edge_tts import communicate as _comm

_ca = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
if os.path.exists(_ca):
    _comm._SSL_CTX = ssl.create_default_context(cafile=_ca)

VOICE = "tr-TR-AhmetNeural"


async def synth(text, out, rate="+0%", pitch="+0Hz", subs=None):
    c = edge_tts.Communicate(text, VOICE, rate=rate, pitch=pitch, boundary="WordBoundary")
    words = []
    with open(out, "wb") as f:
        async for chunk in c.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({"text": chunk["text"], "start": chunk["offset"] / 1e7,
                              "end": (chunk["offset"] + chunk["duration"]) / 1e7})
    if subs:
        with open(subs, "w", encoding="utf-8") as f:
            json.dump(words, f, ensure_ascii=False, indent=1)
    return words


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("text")
    ap.add_argument("out")
    ap.add_argument("--rate", default="+0%")
    ap.add_argument("--pitch", default="+0Hz")
    ap.add_argument("--subs")
    a = ap.parse_args()
    asyncio.run(synth(a.text, a.out, a.rate, a.pitch, a.subs))


if __name__ == "__main__":
    main()
