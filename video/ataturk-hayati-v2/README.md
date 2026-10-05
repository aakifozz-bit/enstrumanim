# Mustafa Kemal Atatürk — 1 Dakikalık Belgesel (v2)

`ataturk-hayati-v2.mp4`: 1920×1080, 30 fps, 60 saniye, Türkçe anlatım, alt yazı ve müzik.

Tarih anlatan YouTube kanallarının tarzında hazırlandı. Arşiv fotoğrafları
2.5D derinlik efekti, yavaş kamera hareketi ve masaya bırakılmış baskı
görünümüyle hareketlendirildi. Aralara kamera hareketli animasyonlu haritalar
girdi.

## Akış

| Süre | Sahne |
|---|---|
| 0:00 | Açılış portresi: Mustafa Kemal Atatürk, 1881–1938 |
| 0:05 | Harita: Selanik, 1881 |
| 0:10 | 1905: Harp Akademisi, kurmay yüzbaşı (fotoğraf baskısı) |
| 0:15 | Harita: Çanakkale 1915, Arıburnu, Conkbayırı, Anafartalar |
| 0:21 | Harita: Millî Mücadele, İstanbul → Samsun → Amasya → Erzurum → Sivas → Ankara |
| 0:28 | 23 Nisan 1920: Meclis'in açılışı |
| 0:32 | Harita: Sakarya ve Büyük Taarruz, Kocatepe → Dumlupınar → İzmir |
| 0:38 | 29 Ekim 1923: Cumhuriyet |
| 0:43 | 1928: Harf Devrimi |
| 0:49 | 1934: Soyadı Kanunu |
| 0:54 | 10 Kasım 1938: Dolmabahçe, ardından bayrak ve kapanış |

## Dosyalar

- `build.py`: bütün parçaları birleştirip videoyu üretir.
- `maps.py`: animasyonlu haritalar. Veri `data/region.json` dosyasında, `data/build_geodata.py` ile yeniden üretilir.
- `photofx.py`: fotoğraf animasyonu (derinlik efekti, kamera hareketi, baskı görünümü, arşiv filmi dokusu).
- `music.py`: arka plan müziği. Anlatım sırasında müziğin sesi otomatik olarak kısılır.
- `photos/`: arşiv fotoğrafları. Kaynakları ve lisansları `photos/credits.json` dosyasında.
- `narration/`: Türkçe anlatım. Satır satır ses dosyaları, `narration.wav` ve `timings.json`.

Videoyu yeniden üretmek için:

```bash
pip install -r requirements.txt
python3 build.py                     # tam video, 4 çekirdekte yaklaşık 10 dakika
python3 build.py --stills 3,20,45    # seçilen saniyelerden önizleme kareleri
python3 build.py --preview 0-20      # sessiz, hızlı önizleme klibi
```

Arayüz yazıları için `../ataturk-hayati/` klasöründeki yazı tipleri ve yardımcılar kullanılır.

## Kaynaklar ve lisanslar

- **Fotoğraflar:** Hepsi Wikimedia Commons'tan alındı ve kamu malıdır. Dolmabahçe fotoğrafı CC0 lisanslıdır (Rijksmuseum koleksiyonu). Her dosyanın Commons sayfası ve lisansı `photos/credits.json` dosyasında.
- **Harita verisi:** Natural Earth v4.1.0 (kamu malı). npm üzerinden `world-atlas` ve `sane-topojson` paketleriyle alındı.
- **Anlatım sesi:** [`multilingual-tts/VITS-OpenBible-Turkish`](https://huggingface.co/multilingual-tts/VITS-OpenBible-Turkish) modeliyle üretildi. Model **CC BY-SA 4.0** lisanslı.
  - Videoyu paylaşırken açıklamaya şu notu ekleyin: *"Seslendirme: VITS-OpenBible-Turkish (multilingual-tts, CC BY-SA 4.0)."*
- **Yazı tipleri:** Playfair Display ve Montserrat (SIL OFL 1.1).
- **Müzik:** Kodla üretildi (`music.py`).
