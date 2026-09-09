# Yayın rehberi — 1.3.3

## Paketler

- `dist/chat-export-for-chatgpt-1.3.3-chromium.zip`: Chrome ve Edge için.
- `dist/chat-export-for-chatgpt-1.3.3-firefox.zip`: Firefox masaüstü 140+ için ayrı arka plan tanımı.
- `dist/chat-export-for-chatgpt-1.3.3-source.zip`: Kaynak incelemesi/yeniden derleme için; mağazaya uzantı paketi olarak yüklemeyin.

Node.js 22 LTS veya daha yeni kararlı LTS sürümüyle yeniden üretme:

```sh
npm ci
npm run build
npm run check
npm test
npm audit
```

Derleme yalnızca yerel npm bağımlılıklarını pakete gömer. Tarayıcıda uzaktan kod yüklenmez. Esbuild, hedef tarayıcıların desteklediği `globalThis` için core-js'nin eski Function-constructor fallback'ini kaldırır. Bağımlılık sürümleri kilit dosyasında, lisansları `lib/THIRD_PARTY_LICENSES.txt` içindedir.

## Yayın öncesi son kontrol

Ad, istek üzerine **Chat Export for ChatGPT** olarak güncellenmiştir. “for” ifadesi veya bağımsızlık açıklaması marka kullanım izni yerine geçmez. [OpenAI marka yönergesindeki](https://openai.com/brand/) adlandırma kısıtlarını yayın öncesinde değerlendirin; marka içermeyen **Chat Export** seçeneği bu özel riski azaltır. Mevcut ikon genel bir belge/dışa aktarma simgesidir; OpenAI logosu kullanılmamaktadır. Bu inceleme kapsamlı bir marka benzerliği araştırması değildir.

Üçüncü taraf kütüphanelerin lisans ve telif bildirimleri korunmuştur; bunları paketten silmeyin. Mağaza görsellerinde yalnızca size ait veya kullanım izniniz bulunan örnek içerikleri kullanın. Dışa aktarılan sohbet ve eklerdeki mevcut kaynak/telif bildirimlerini kaldırmak bu uzantının amacı değildir.

Yerel testler tüm gerçek hesap ve tarayıcıları kapsamaz. Özellikle Firefox bu çalışma ortamında kurulu olmadığı için gerçek Firefox testi yapılmadı. Aşağıdaki kontrolü her hedef masaüstü tarayıcıda tamamlayın:

1. Paket klasörünü geçici yükleyin; ChatGPT sekmesini yenileyin ve site erişimini verin.
2. Ayarlarda dil/tema/renklendirmeyi değiştirip kaydedin; popup'ta uygulandığını doğrulayın.
3. Uzun ve görselli gerçek sohbeti sonundan başlayarak dışa aktarın; ilk/son mesajı, görselleri ve mesaj sırasını karşılaştırın.
4. PDF, HTML, Markdown, Word ve pano aktarımını deneyin. Kaydetme penceresini iptal edip tekrar deneyin.
5. Sağ tık aktarımını ve seçili sohbetleri deneyin. Kaynak sohbet sekmesinin yükleme sırasında değiştirilmesi halinde eksik dosya oluşmadığını kontrol edin.

PDF raster biçimindedir; seçilebilir metin vaadinde bulunmayın. Word çıktısı `.doc` uzantılı HTML'dir; `.docx` olarak tanıtmayın. Toplu liste yalnızca sayfada bulunabilen sohbet bağlantılarını kapsar. ChatGPT arayüzü ve oturum içi uç noktaları değişebilir. Android ve Safari test edilmedi; bu sürümü mobil/Safari uyumlu olarak tanıtmayın.

## Mağazaya gönderme

Hazır simge, beş ekran görüntüsü ve küçük tanıtım görseli `store-assets` klasöründedir. Dosya eşleştirmesi ve yeniden oluşturma bilgisi `store-assets/README.md` içindedir; görselleri uzantı ZIP'i yerine mağazanın ilgili görsel alanlarına ayrı ayrı yükleyin.

1. Bir geliştirici hesabı açın, mağazanın istediği hesap/kimlik doğrulamasını tamamlayın.
2. `PRIVACY.md` metnini herkesin erişebildiği bir web sayfasında yayınlayın. Mağazada gerçek geliştirici adınızı ve destek adresinizi girin.
3. İlgili ZIP'i yükleyin. Gerçek uygulamadan ekran görüntüleri, kısa açıklama ve kategori ekleyin; OpenAI ile resmi bağlantı olmadığını açıkça belirtin.
4. Gizlilik/izin beyanlarını gerçek davranışla eşleştirin: sohbeti kullanıcı isteğiyle yerel dışa aktarma, geçici önizleme saklama, isteğe bağlı pano kullanımı ve tarayıcı ayar senkronizasyonu. Geliştirici sunucusuna veri gönderilmez.
5. İncelemeye gönderin; inceleme sonucunda istenen düzeltmeleri yapın. Firefox kaynak dosya isterse kaynak ZIP'i ve yukarıdaki derleme komutlarını sağlayın. Firefox manifestindeki sabit uzantı kimliğini sonraki sürümlerde değiştirmeyin.

Resmi yönergeler: [Chrome](https://developer.chrome.com/docs/webstore/publish/), [Firefox](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/), [Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension).

Safari ayrı paketleme ve Apple incelemesi gerektirir: [Apple dağıtım belgeleri](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect).

## İncelemeci notları

### 1.3.3 — Blue Argon düzeltmesi

Ret bildirimindeki CDN adresi jsPDF'nin kullanılmayan `pdfobjectnewwindow` özelliğinden geliyordu. `scripts/pdf-local-only.mjs`, bu özelliği ve harici görüntüleyici açabilen `pdfjsnewwindow` kodunu kaynak seviyesinde çıkarır. URL değiştirilmez veya gizlenmez; yükleyici uygulamaları dağıtım paketinde bulunmaz. Sohbet PDF aktarımı yerel `pdf.output('blob')` akışını kullanmaya devam eder.

Derleme ve `npm run check`, PDF paketinde bu yükleyicilerin veya uzak JavaScript/WASM adreslerinin yeniden bulunması halinde hata verir. Bağımlılığın ilgili kaynak yapısı değişirse derleme durur ve yamanın gözden geçirilmesini ister. Ayrıntı: [Chrome uzaktan kod yönergesi](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code).

Yeniden inceleme notu olarak kullanılabilir:

> Removed the unused jsPDF PDFObject and external PDF.js viewer implementations from the bundled library at build time, including the reported CDN script loader. PDF export uses locally bundled code and Blob output. Added build checks and PDF generation regression tests. Please review version 1.3.3.

Bu çalışma sırasında `npm audit` 0 güvenlik açığı, `web-ext lint` 0 hata ve yalnızca üçüncü taraf kütüphanelerde 5 HTML/DOM inceleme uyarısı bildirdi. Ayarlar sayfasında yükleme, kayıt, sıfırlama, hata durumu, tema ve dil; popup'ta ayarların aktarım isteğine taşınması yerel Chrome örneklerinde doğrulandı. Güncel PDF motoru 31 sayfalık uzun metin/görsel testini geçti. Bunlar gerçek Firefox veya gerçek ChatGPT oturum testi değildir.

`content/content.js`, sayfa işaretlemesini DOMPurify 3.4.15 ile temizler. Uygulama tarafındaki HTML eklemeleri temizlenmiş DocumentFragment üzerinden yapılır. PDF motoru html2pdf.js 0.14.0 kaynaklarından, kilitlenmiş güncel jsPDF/DOMPurify alt bağımlılıklarıyla yeniden derlenir. Minify edilmiş üçüncü taraf kütüphanelerindeki DOM işlemleri Mozilla denetleyicisinde manuel inceleme uyarıları üretebilir; bunlar kaynak paketiyle incelenebilir. Mağaza onayı garanti edilmez.
