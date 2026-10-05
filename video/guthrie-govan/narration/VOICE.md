# Narration voice

## Choice
- **Engine:** Microsoft Edge "Read Aloud" neural TTS via `edge-tts` 7.2.8 (`tts.py`)
- **Voice:** `tr-TR-AhmetNeural`, a native Turkish male voice. Default pitch. Rate: `rate=1.0` maps to edge `+5%`.
- **Speed:** about 2.45 words/s on the test paragraph. The 15 script segments average about 2.46 words/s (717 words in 291 s).
- **Synthesis speed:** the service does the synthesis, so speed depends on the network. A 16 s paragraph takes about 3 s. The whole 291 s script takes about 25 s, including up to 3 rate-fitting passes per segment. That is about 0.03–0.2 s of compute per second of audio.
- **License:** this is an unofficial client for Microsoft's free Edge Read Aloud service. Microsoft gives no license for using the output; it is fine for private, non-commercial viewing. The `edge-tts` library is LGPL/GPL-3.0. The service needs internet access and could change or break at any time.

## Fix for the 403 error
`edge-tts` connects to a `wss://` URL. aiohttp only checks a `WSS_PROXY` env var for that scheme, and this sandbox doesn't set one, so it connected directly. The sandbox refused the direct connection with `403` (`x-deny-reason: host_not_allowed`), not Microsoft. The fix is to pass `HTTPS_PROXY` explicitly as `Communicate(..., proxy=...)` and use the CCR CA bundle (`/root/.ccr/ca-bundle.crt`) for TLS. The Sec-MS-GEC and version headers were fine. Custom SSML (`<lang>`, `<phoneme>`, `<break>`) is rejected by the service, so English names have to be respelled.

## Test paragraph comparison (faster-whisper large-v3-turbo, language="tr")
Samples are in `narration/samples/`. w/s is words per second over 40 words of text.

| sample | WER / CER | w/s | F0 median | notes |
|---|---|---|---|---|
| **edge_ahmet_respelled** (chosen) | 0.07 / 0.03 | 2.47 | 137 Hz | most natural Turkish. Whisper language-ID is 0.999 tr with the best log-prob, and pauses come out at exactly 0.24 s |
| edge_ahmet_raw (no respelling) | 0.05 / 0.02 | 2.46 | 137 Hz | reads "Gutiri Govan", "Şamşard" for Chelmsford, and "Erotik Çakes" |
| edge_ahmet_respelled_pitch-6Hz | 0.07 / 0.03 | 2.47 | 132 Hz | a slightly deeper option (`--pitch -6`) |
| edge Brian / Andrew / Remy / Florian Multilingual | ≈0.05 / 0.02 | 2.1–2.3 | 100–137 Hz | English names pronounced natively. Turkish sounds slightly accented (Andrew lang-ID 0.94, Brian 0.998). A fallback via `--voice en-US-BrianMultilingualNeural` |
| xtts_v2 (Coqui; Eugenio Mataracı, Viktor Menelaos, Damien Black, Craig Gutsy) | 0.02–0.05 / 0.01–0.03 | 2.0–2.2 | 100–164 Hz | runs locally but takes 2–6× real time on CPU (≈10–30 min for 5 min of audio). Peaks reach −0.2 dBFS. Prosody is less steady. CPML non-commercial license |
| piper_dfki_medium | 0.18 / 0.06 | 2.21 | 103 Hz | flat (6.5 semitone pitch range) and robotic, with 5 clipped samples. "James Ford", "T. Aristo Jatz" |

Rejected: VITS-OpenBible (too robotic), Piper fahrettin/fettah (withdrawn), gTTS (female), and the Korean Hyunsu Multilingual voice (truncated output).

## English names (in the `PRON` table in `tts.py`)
I checked the raw readings with wav2vec2 IPA phoneme recognition and Whisper. Names that already sound fine are left raw: Hans Zimmer, Bryan Beller, Facebook, McDonald's, Oxford, Charvel, Chuck Berry, Joe Pass, Hendrix, Elvis, legato, shred, country, hybrid picking, Bass Bash, Aura and Govan. The rest are respelled for the voice only. Subtitles always keep the original spelling.

Main respellings: Guthrie→Gatri, The Aristocrats→Di Aristokrats, Steven Wilson→Stiven Vilson, Erotic Cakes→Erotik Keyks, Chelmsford→Çelmsfırd, Marco Minnemann→Marko Minneman, Beatles→Bitıls, Cream→Krim, Asia→Eyşa, ACM/BIMM→Ey Si Em/Bim, GPS→Ci Pi Es, John Payne→Con Peyn, Jazzmaster→Cezmastır, Drive Home→Drayv Hom, The Raven That Refused to Sing→Dı Reyvın Det Rifyuzd Tu Sing, "Hand. Cannot. Erase."→"Hend, Kenot, İreyz", YouTube→Yutyub, Dune→Dyun, Denis Villeneuve→Döni Vilnöv, and others.

Things I tried and dropped:
- "Gatri Gavın": Whisper heard it as "Gatrik alın". "Gatri Govan" was the clearest.
- "Ora'da" for Aura: it sounds like *orada*.
- "Beys Beş" for Bass Bash: it was heard as *beş* (five).

## Script render (`python3 tts.py --script research/script.json --outdir narration`)
- Each segment gets its own `seg_<id>.wav`: 44.1 kHz mono 16-bit, 40 ms of silence at the start and end, 0.25 s between sentences, normalized to −16.0 LUFS with a −1 dBFS peak limiter.
- Each segment's rate is fitted to `target_sec − 1` within 0.92–1.12. Four segments hit the 1.12 cap (edge +18%) and still run 1.1–1.5 s over: s02, s05, s06 and s11. The total is 291 s.
- `subs.json` holds 117 cues of at most 70 characters, in the original spelling, timed from edge WordBoundary events. Each cue is clamped to its sentence's audio.
- `narration.json` lists each segment's duration, rate, LUFS and peak.
- Whisper check over all 15 segments: CER 2.8% in total (per segment 0–6.9%). The worst is s07 (Asia → "Aisha", John Payne → "Compain"). The first name alone ("Gatri", in s02 and s03) is sometimes heard as "Datı" or "Gatre"; in full, "Gatri Govan" is heard as "Gatrigovan".
