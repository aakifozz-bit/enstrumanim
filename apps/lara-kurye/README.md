# Lara Kurye

Antalya / Lara esintili, tarayıcıda çalışan birinci şahıs (FPS) motokurye oyunu. Oyun **2147. Sokak**'ta başlar.

- three.js (vendor klasöründe, derleme adımı yok), tüm dokular canvas ile üretilir
- Yürü, motora bin, restorandan siparişi al, adrese süre dolmadan teslim et
- Masaüstü (klavye + fare) ve dokunmatik kontroller

## Çalıştırma

```bash
npx http-server apps/lara-kurye -p 8080
# http://localhost:8080
```

`?low` düşük kalite, `?auto=1` başlangıç ekranını atlar.

Not: Sokak düzeni gerçek haritanın birebir kopyası değildir; Lara'nın karakterine (bulvarlar, numaralı sokaklar, falezler, Beydağları manzarası) göre tasarlanmıştır.
