# Mustafa Kemal Atatürk — 1 Dakikalık Hayat Videosu

`ataturk-hayati.mp4` — 1920×1080, 30 fps, tam 60 saniye, H.264 + AAC stereo müzik.

Görüntüler (tipografi ve çizimler) ile müzik `generate.py` tarafından kodla
üretilir; dışarıdan fotoğraf, video ya da ses dosyası kullanılmamıştır.

## Akış

| Süre        | Sahne                                                          |
|-------------|----------------------------------------------------------------|
| 0:00–0:04   | Açılış: Mustafa Kemal ATATÜRK (1881–1938)                      |
| 0:04–0:09   | 1881 · Selanik’te doğdu                                        |
| 0:09–0:13   | 1905 · Harp Akademisi’ni kurmay yüzbaşı olarak bitirdi         |
| 0:13–0:18   | 1915 · Çanakkale Cephesi                                       |
| 0:18–0:23   | 19 Mayıs 1919 · Samsun, Millî Mücadele                         |
| 0:23–0:28   | 23 Nisan 1920 · TBMM’nin açılışı                               |
| 0:28–0:33   | 1921–1922 · Sakarya ve Büyük Taarruz                           |
| 0:33–0:38   | 29 Ekim 1923 · Cumhuriyet’in ilanı                             |
| 0:38–0:43   | 1924–1934 · Devrimler ve yeni Türk alfabesi                    |
| 0:43–0:48   | 1934 · “Atatürk” soyadı                                        |
| 0:48–0:53   | 10 Kasım 1938 · 09.05                                          |
| 0:53–1:00   | Kapanış sözü ve dalgalanan Türk bayrağı                        |

## Yeniden üretmek

Gereksinimler: Python 3, `numpy`, `Pillow` ve libx264/aac destekli `ffmpeg`.

```bash
pip install numpy pillow
python3 generate.py                     # ataturk-hayati.mp4 dosyasını yeniden üretir
python3 generate.py --stills 7,35,58    # belirtilen saniyelerden PNG önizleme kareleri
```

4 çekirdekli bir makinede üretim yaklaşık 3 dakika sürer.

## Yazı tipleri

`fonts/` klasöründeki Playfair Display ve Montserrat, SIL Open Font License 1.1
ile dağıtılır (lisans metinleri aynı klasörde).
