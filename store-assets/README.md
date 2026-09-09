# Mağaza görselleri

İngilizce mağaza tanıtımı için hazırlanmıştır. Simge mevcut uzantı simgesidir. Beş ekran görüntüsü, uygulamanın gerçek HTML/CSS/JavaScript arayüzlerinin yerel Chrome'da örnek verilerle çekilmiş görüntüleridir; gerçek hesaba veya özel sohbete ait veri içermez. Tanıtım başlıkları arayüzün dışında yer alır. Bunlar canlı ChatGPT oturum testi değildir.

| Dosya | Kullanım | Boyut |
| --- | --- | --- |
| store-icon-128.png | Mağaza simgesi | 128 × 128 |
| 01-export-formats.png | Ekran görüntüsü 1: dışa aktarma | 1280 × 800 |
| 02-image-preview.png | Ekran görüntüsü 2: görselli önizleme | 1280 × 800 |
| 03-code-preview.png | Ekran görüntüsü 3: kod önizleme | 1280 × 800 |
| 04-clipboard.png | Ekran görüntüsü 4: pano | 1280 × 800 |
| 05-settings.png | Ekran görüntüsü 5: dil ve tema | 1280 × 800 |
| promo-440x280.png | Küçük tanıtım kutucuğu | 440 × 280 |

Mağazaya PNG dosyalarını ayrı ayrı yükleyin. `store-assets.zip` görselleri toplu taşımak içindir; uzantı paketi değildir.

Ölçüler: https://developer.chrome.com/docs/webstore/cws-dashboard-listing ve https://developer.chrome.com/docs/webstore/images

Tekrar oluşturma: proje kökünden `node store-assets/source/generate.mjs`. Windows'ta yerel Chrome gerekir; farklı yol için `STORE_CHROME` ortam değişkeni kullanılabilir. Araç yalnızca 127.0.0.1 üzerinde geçici sunucu açar ve kendine ait geçici tarayıcı profilini temizler. Bu klasör uzantının yayın ZIP'lerine dahil edilmez.
