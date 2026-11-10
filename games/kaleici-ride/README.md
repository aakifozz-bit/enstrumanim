# Kaleiçi — Antalya Motosiklet Sürüşü

Antalya'nın tarihi Kaleiçi semtinde, **gerçek sokak planı** üzerinde geçen küçük bir
tarayıcı sürüş oyunu. Derleme adımı yok, harici varlık (model/doku/ses) yok: her şey
yükleme anında prosedürel olarak üretilir.

## Çalıştırma

ES modülleri `file://` üzerinden yüklenmediği için basit bir statik sunucu gerekir:

```bash
cd games/kaleici-ride
python3 -m http.server 8080      # veya: npx serve .
# http://localhost:8080
```

WebGL2 destekleyen güncel bir tarayıcı ve ayrık/iyi bir tümleşik GPU önerilir.
Kare hızı düşerse kalite kendiliğinden bir kademe iner; menüden de değiştirilebilir.
Adrese `#low`, `#med`, `#high` veya `#ultra` ekleyerek başlangıç kalitesi seçilebilir.

## Kontroller

| Tuş | İşlev |
| --- | --- |
| `W` / `↑` | Gaz |
| `S` / `↓` / `Boşluk` | Fren (dururken: geri geri it) |
| `A` `D` / `←` `→` | Yatır / dön |
| `C` | Kamera (takip / kask içi) |
| `T` | Günün saati (altın saat → öğleden sonra → mavi saat) |
| `R` | Son güvenli noktaya dön |
| `M` | Ses aç/kapa |
| `Esc` | Menü |

Oyun kolu (sol çubuk + tetikler) ve dokunmatik ekran düğmeleri de desteklenir.

## Neler gerçek?

- **Sokaklar, bina oturumları, kıyı çizgisi, iskeleler, surlar, parklar:** OpenStreetMap
  (36.8795–36.8885° K, 30.700–30.710° D; ~890 × 995 m). 1 059 bina, 381 yol parçası.
- **Arazi:** NASA SRTM 30 m yükseklik verisi — limana inen yokuşlar ve falezler buradan gelir.
- **Simge yapılar** gerçek konumlarında, elle (prosedürel) modellendi: Hadrian Kapısı,
  Yivli Minare, Saat Kulesi, Kesik Minare, Hıdırlık Kulesi, Kale Kapısı Burcu. Camiler ve
  harabeler kendi oturumlarında üretilir.
- **Sokak adları** sürüş sırasında OSM'den gösterilir.

Cepheler, pencere düzeni, cumbalar, bahçe duvarları, bitkiler ve tekneler ise Kaleiçi'nin
mimari diline göre *üretilmiştir*; tek tek binaların gerçek görünüşünü yansıtmaz.

## Yapı

```
index.html          Arayüz (menü, HUD, dokunmatik düğmeler)
src/main.js         Açılış, oyun döngüsü, kamera, girdi, mini harita, keşifler
src/textures.js     Prosedürel PBR dokular (renk + normal + AO/pürüzlülük)
src/terrain.js      SRTM arazisi, kıyı, zemin karışım gölgelendiricisi, deniz, Beydağları
src/city.js         Evler, cumbalar, panjurlar, çatılar, bahçe duvarları, surlar, begonviller
src/landmarks.js    Anıtlar, camiler, harabeler
src/props.js        Ağaçlar, palmiyeler, tekneler
src/bike.js         Motosiklet modeli ve sürüş fiziği
src/env.js          Gökyüzü, güneş, IBL, gölgeler, günün saati, post-processing
src/audio.js        Sentezlenmiş motor / rüzgâr / ağustos böceği sesi
data/kaleici.js     Pişirilmiş harita verisi (tools/bake_osm.py çıktısı)
tools/bake_osm.py   OSM + SRTM verisini indirip oyun formatına çevirir
vendor/             three.js r187 ve kullanılan eklentiler (tek dosyada paketli, MIT)
```

Harita verisini yenilemek için: `python3 tools/bake_osm.py`

## Atıf ve lisanslar

- Harita verisi © [OpenStreetMap](https://www.openstreetmap.org/copyright) katkıcıları, ODbL.
- Yükseklik verisi: NASA SRTM (opentopodata.org üzerinden).
- [three.js](https://threejs.org) — MIT (bkz. `vendor/THREE-LICENSE`).
