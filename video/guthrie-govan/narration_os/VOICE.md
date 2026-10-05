# Narration voice (open-source, CPU)

## Choice
- **Engine:** Chatterbox Multilingual, `chatterbox-tts` 0.1.7, from Resemble AI. The model is `ResembleAI/chatterbox` `t3_mtl23ls_v2` with `language_id="tr"`. It runs on CPU with torch 2.6.0+cpu in float32.
- **License:** MIT for both the code and the weights. Each output carries Resemble's built-in Perth watermark, which you cannot hear.
- **Voice:** zero-shot from a synthetic reference clip only. The clip is 15.7 s of edge-tts `tr-TR-AhmetNeural` at rate −4% and pitch −6 Hz, reading a neutral Turkish sentence (it is in the scratchpad at `os/ref/ahmet.wav`). The result is a male voice with a median F0 of about 120 Hz. Chatterbox creates its own prosody, so the result is livelier than Edge, with wider pitch movement on questions and exclamations.
- **Settings:** `exaggeration=0.6`, `cfg_weight=0.5`, temperature 0.8, `repetition_penalty` 2.0, `min_p` 0.05, seed 0. Retakes use seeds 1 and 2.
- **Text prep:** numbers are spelled out in Turkish with their suffixes ("1971'de" becomes "bin dokuz yüz yetmiş birde"). English names use the `PRON` respellings from `tts.py`. Quote marks are removed. Sentences shorter than 22 characters are merged with the next one into a single synthesis unit, which makes 76 units in total.

## Post-processing (per segment)
1. Each unit is trimmed at −40 dB with 30 ms kept. Internal pauses longer than 0.2 s are shortened to 0.2 s, and units are joined with 0.25 s gaps.
2. Chatterbox speaks slowly in Turkish, about 13.6 chars/s compared with Edge at about 17. Each segment is time-compressed with ffmpeg `atempo` toward `target_sec − 1`, capped at **×1.30**. 13 of the 15 segments hit the cap; s08 used ×1.23 and s12 used ×1.28.
3. The audio is resampled to 44.1 kHz mono 16-bit with 40 ms of edge silence. It is normalised to −16.0 LUFS with a −1.05 dBFS sample-peak limiter.
4. `subs.json` has 126 cues of at most 70 characters, in the original script spelling. Times are spread across each unit by character count.

## Durations (s), target−1 in brackets
s01 15.99 [16] · s02 24.54 [23] · s03 19.75 [19] · s04 22.99 [21] · s05 15.41 [14] · s06 17.09 [17] · s07 18.02 [16] · s08 18.94 [19] · s09 28.22 [27] · s10 26.10 [25] · s11 26.66 [24] · s12 25.95 [26] · s13 11.96 [11] · s14 15.05 [14] · s15 13.97 [13] — **total 300.6 s**.
Four segments run more than 1.5 s over even at ×1.30: s04 (+2.0), s07 (+2.0), s11 (+2.7) and s02 (+1.5).

## ASR check (faster-whisper large-v3-turbo, language="tr", beam 5)
- Every unit was transcribed. The take with the lowest CER was kept; among takes within 0.03 of the best CER, the shortest one won.
- **Overall CER is 2.0%**. By segment it ranges from 0% to 7.3%, and s07 is the worst because of names: "Con Peyn" → "Compain" and "Eyşa" → "Aisha", the same problem as with Edge.
- Five units were re-synthesised. s02 "Ya 9 yaşında? Kardeşi Seth'le…" was cut off in its first take (CER 0.69 → 0.02). s11 "Döni Vilnöv" went from 0.10 to 0.02. The others were re-run to get faster pacing.
- No hallucinated words or clipping were found.

## Speed
- On 4 CPU cores, Chatterbox runs at about 5× real time: about 9 T3 tokens/s, and S3Gen takes as long again.
- The full script took about 38 min wall time with 2 processes × 2 threads. Retakes took about 5 min and the ASR checks about 12 min.

## Samples (`samples/`, s01_hook text)
- `chatterbox_mtl_tr_ahmetref_s01.mp3`: the chosen voice (the final s01 segment).
- `omnivoice_design_male_lowpitch_s01.mp3`: k2-fsa OmniVoice with voice design "male, middle-aged, low pitch" and 32 steps. Pitch movement is flat (8 st range against 22 st for Chatterbox), and it runs at about 8.5× real time on this CPU. It was rejected.
- `edge_ahmet_reference_s01.mp3`: the current Edge narration, for comparison.
- XTTS-v2 was not re-rendered because time was short. Earlier XTTS samples, which use a different text, are in `../narration/samples/xtts_v2_*.wav`. Its CPML licence is non-commercial, and its prosody was less steady.
