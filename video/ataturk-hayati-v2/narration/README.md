# Narration: Atatürk'ün Hayatı (60 s)

## Files
- `line01.wav` … `line11.wav`: one processed clip per scene (44.1 kHz, mono, 24-bit).
- `narration.wav`: the full 60.000 s track. Each line starts at its scene start + 0.25 s. It measures -16.1 LUFS integrated with a -1.5 dBTP true peak.
- `timings.json`: one entry per line with `line`, `text_displayed` (subtitle text with digits), `text_spoken`, `start` and `end` in seconds on the 60 s track.

## Engine and voice
- **Engine:** VITS (Coqui TTS 0.27.5, `coqui-tts` on PyPI), run on the CPU.
- **Voice:** [`multilingual-tts/VITS-OpenBible-Turkish`](https://huggingface.co/multilingual-tts/VITS-OpenBible-Turkish). It is a male voice (median F0 about 89 Hz), trained from scratch on Turkish Open.Bible read speech.
- **License:** **CC BY-SA 4.0**, as stated on the model card. Commercial use is allowed, but the video needs attribution. Suggested credit for the description: *"Seslendirme: VITS-OpenBible-Turkish (multilingual-tts, CC BY-SA 4.0), Open.Bible verilerinden eğitilmiştir."* Share-alike may apply to the audio itself.

### Voices considered
- **Piper `tr_TR-dfki-medium`:** a male voice (F0 about 105 Hz) with clean Whisper transcripts. It was not chosen because its dataset is **CC BY-NC-SA 4.0**, which forbids commercial use and so conflicts with a monetized YouTube channel. It is also brighter and thinner than the voice we used.
- **Piper `fahrettin` and `fettah`:** not used. On 2025-12-30 they were removed from `rhasspy/piper-voices` "at request of contributors" (commit b145f2ac). Only third-party mirrors still carry them.
- **Chatterbox Multilingual (MIT):** too slow on 4 CPU cores (about 190 s for a 4 s line), and its default voice is not a Turkish male narrator.

## Settings
- `length_scale`: 0.95 is the base pace. Dense lines were sped up only as far as needed, with 0.85 as the floor:
  - line 2: 0.88
  - line 6: 0.863
  - line 7: 0.908
  - line 8: 0.85
  - line 11: 0.883
- Noise scale 0.667, duration noise 0.8, and a fixed seed for each line, so renders are reproducible.
- Sentences are synthesized one at a time, with a 0.22 s pause between them (0.15 s in line 2). Leading and trailing silence is trimmed at -40 dB, keeping 50 ms of padding before the speech and 80 ms after it.
- Text is written out for TTS:
  - Numbers and dates are spelled out as words, for example "bin sekiz yüz seksen birde".
  - Apostrophes and quotation marks are removed, for example "Selanikte".
  - Lowercasing is Turkish-aware (İ→i).
- Post-processing (ffmpeg):
  - resample to 44.1 kHz (soxr)
  - high-pass at 80 Hz
  - light `afftdn` denoise
  - EQ: +2 dB at 180 Hz for warmth, +1 dB at 3.2 kHz, -1.5 dB at 7.5 kHz
  - compression at 2.5:1 from -21 dB
  - loudness matched per clip, then one gain for the whole track to reach -16 LUFS
  - true-peak limiter at -1.5 dBFS

## Wording changes (for timing)
Lines 2 and 8 did not fit their windows at a natural pace, so their wording was shortened slightly. `text_displayed` follows the spoken wording so that subtitles match the audio.
- Line 2. The original was "…Matematik öğretmeni ona “Kemal” adını verdi." It now reads "“Kemal” adını matematik öğretmeni verdi." Only "ona" was dropped, and the meaning is the same.
- Line 8. The original was "…Cumhuriyet’i ilan etti ve ilk Cumhurbaşkanı oldu." It now reads "Cumhuriyet’i kurup ilk Cumhurbaşkanı oldu." This saves 3 syllables, but "kurup" (founded) replaces "ilan etti" (proclaimed), so the meaning is close rather than identical.
