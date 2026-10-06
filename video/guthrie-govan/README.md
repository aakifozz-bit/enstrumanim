# Guthrie Govan: Gitaristlerin Gitaristi (yaklaşık 5 dk belgesel)

`guthrie-govan_1080p.mp4`: 1920×1080, 30 fps, yaklaşık 4:57. Türkçe anlatım, alt yazı ve müzik var.
Kişisel izleme için hazırlandı.

## Bölümler

1. Gitaristlerin Gitaristi (giriş)
2. Chelmsford, 1971
3. Kulaktan Öğrenen Çocuk
4. Oxford mu, Gitar mı?
5. Yılın Gitaristi: 1993
6. Bir Neslin Öğretmeni
7. Asia, GPS ve Sahne
8. Erotic Cakes
9. The Aristocrats
10. Steven Wilson ve Drive Home
11. Hans Zimmer'dan Gelen Mesaj
12. Onu Farklı Kılan Ne?
13. Ekipman
14. Miras
15. Final

## Nasıl üretildi

Klasördeki parçalar, her biri ayrı bir alt ajanın işiyle:

| Klasör / dosya | İçerik |
|---|---|
| `research/` | Kaynaklı araştırma notları (`research.md`), senaryo (`script.json`), daha canlı anlatım metni (`script_lively.json`) |
| `narration/` | Bölüm başına Türkçe anlatım (edge-tts, `tr-TR-AhmetNeural`), alt yazı zamanlamaları (`subs.json`) |
| `media/` | Fotoğraflar, albüm kapakları, ekipman görselleri; her birinin kaynağı `media/manifest.json` dosyasında |
| `music/` | Müzik yatağı ve geçiş efektleri; parçalar ve lisanslar `music/CREDITS.md` dosyasında |
| `storyboard.json` | Sahne planı: hangi bölümde hangi görsel, kart ve kinetik yazının olacağı, anlatıma senkron işaretler |
| `build.py`, `colorfx.py` | Birleştirici ve renkli fotoğraf animasyonu (paralaks, Ken Burns) |

## Yeniden üretmek

```bash
pip install numpy pillow opencv-python-headless edge-tts
python3 tts.py --script research/script_lively.json --outdir narration --rate 1.06 --pitch 8   # anlatım
python3 music/scripts/make_sfx.py && python3 music/scripts/build_bed.py                       # müzik yatağı
python3 build.py                        # guthrie-govan.mp4 (4 çekirdekte yaklaşık 15 dk)
python3 build.py --stills 10,60,200     # önizleme kareleri
python3 build.py --range 0-30           # 30 sn sesli önizleme
```

Atatürk v2 klasöründeki `photofx.py` kişi maskesi için kullanılır.

## Kaynaklar

- **Fotoğraflar ve kapaklar:** Wikimedia Commons, Flickr, resmî siteler, plak şirketleri ve dergiler. Bir kısmı telifli ve yalnızca kişisel izleme için kullanıldı. Kaynak bağlantıları `media/manifest.json` dosyasında.
- **Müzik:** Kevin MacLeod (incompetech.com) ve Scott Buckley parçaları, CC BY 4.0. Atıf metinleri `music/CREDITS.md` dosyasında. Geçiş efektleri kodla üretildi.
- **Anlatım sesi:** Microsoft Edge "Ahmet" sinir ağı sesi (edge-tts üzerinden).
- **Yazı tipleri:** Bebas Neue, Oswald, Montserrat (SIL OFL).
