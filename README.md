# Chat Export for ChatGPT

Bağımsız bir uzantıdır; OpenAI ile bağlantılı değildir, OpenAI tarafından geliştirilmez veya desteklenmez. “ChatGPT” adı desteklenen hizmeti belirtir; adın kullanılması için bir marka izni alındığı iddia edilmez.

ChatGPT sohbetlerini PDF, Markdown, Word, HTML ve düz metin olarak dışa aktaran Chrome uzantısı. Yalnızca `chatgpt.com` ve `chat.openai.com` üzerinde çalışır.

## Kurulum

1. Kararlı Node.js LTS ile `npm ci`, ardından `npm run build` çalıştırın. Güncel PDF bağımlılıkları yerel olarak derlenir.
2. Chrome’da `chrome://extensions` sayfasını açın ve geliştirici modunu etkinleştirin.
3. **Paketlenmemiş öğe yükle** ile `dist/chromium` klasörünü seçin. Firefox paketi `dist/firefox` altında oluşturulur.
4. Zaten yüklüyse uzantının **Yenile** düğmesine basın ve açık ChatGPT sekmesini yenileyin.

## Kullanım

Sohbeti açın, yanıtın tamamlanmasını bekleyin ve uzantıdan biçimi seçip dışa aktarın. Önizleme, mesaj filtresi, pano ve toplu dışa aktarma seçenekleri korunmuştur. Toplu aktarım, sayfada yüklenmiş sohbet bağlantılarına bağlıdır.

Sağ tık menüsünün dili **Ayarlar → Arayüz dili → Kaydet** seçimiyle değişir. Türkçe ve İngilizce desteklenir; değişiklik için tarayıcıyı yeniden başlatmak gerekmez. 1.3.2 sürümü ayrıca kod renklendirmenin kaynak metne HTML parçaları eklemesine neden olan hatayı düzeltir.

## Aktarım davranışı

- Dışa aktarmadan önce sohbetin sonuna ve ardından başına doğru ilerlenir. Gecikmeli yüklenen mesajlar beklenir; ekrandan kaldırılan mesajlar kimlikleriyle bellekte tutulur. Sayfadaki durum kutusu toplanan mesaj sayısını gösterir.
- Sohbetin başında yükleme durulana kadar PDF üretimine geçilmez. Mesaj sıralarında boşluk görülürse veya yükleme 45 saniye ilerlemezse eksik dosya oluşturmak yerine hata gösterilir.
- Uzun kullanıcı mesajlarındaki göster/gizle kontrolleri içerikten çıkarılır; satır sonları korunur.
- Mesajın yanındaki yüklenmiş/üretilmiş görseller, canvas ve görsel önizlemeler aktarım kapsamına alınır. Görseller mümkün olduğunda dosyaya gömülür.
- ChatGPT’nin oturum içi sohbet verisi erişilebilirse tam kullanıcı metni, ekler ve ekranda bulunmayan mesajlar aktif sohbet dalından tamamlanır. Eşleştirme mesaj kimliği üzerinden yapılır; alternatif yanıt dalları birleştirilmez.
- PDF sayfa boyutundaki parçalar halinde çizilir; tek bir uzun mesaj için devasa canvas oluşturulmaz. Metin satırlarının ortasından bölünmesi mümkün olduğunca önlenir.
- Erişilemeyen medya için ek bilgisi gösterilir. Dosya eki kartı, dosyanın bütün sayfalarının veya içeriğinin aktarılması anlamına gelmez.

## Sınırlar

ChatGPT’nin sayfa yapısı ve oturum içi uç noktaları değişebilir. Bunlar resmi, kararlı bir sohbet dışa aktarma API’si değildir. Sohbet verisine erişilemediğinde kaydırarak toplanan sayfa içeriği kullanılır. Sayfanın yüklenme ve mesaj kimliği işaretleri değişirse yükleyicinin güncellenmesi gerekebilir. Paylaşılan sohbetlerde de sayfa içeriği kullanılır.

PDF mevcut html2pdf tabanlı motorla görüntü olarak üretilir; metin seçilebilir değildir. Düzenlenebilir metin için Word, Markdown veya HTML tercih edilebilir. Çok büyük sohbetlerde PDF üretimi zaman alabilir.

1.3.1 sürümünde bulut bağlantıları ve ilgili izinler kaldırılmıştır. Ayarlar doğrulanır; Türkçe/İngilizce arayüz ve açık/koyu/sistem teması desteklenir. Sohbet önizlemeleri geçici yerel depolamada tutulur; saklama ve temizleme ayrıntıları [gizlilik metninde](PRIVACY.md) açıklanmıştır.

Yayın paketleri ve kısa mağaza adımları: [PUBLISHING.md](PUBLISHING.md). Paket hazırlamak mağaza onayı veya bütün tarayıcılarda gerçek hesap testinin tamamlandığı anlamına gelmez.

Geliştirici kontrolleri: `npm run check`, `npm test`, `npm audit`, `npm run build`. Firefox 140+ masaüstü için ayrı manifest üretilir; bu ortamda Firefox gerçek tarayıcı testi yapılamamıştır.

## Doğrulama

Geçmiş yükleyicisi; son mesajdan başlama, gecikmeli eklenen eski mesajlar, 11 saniyelik yükleme gecikmesi, ekrandan kaldırılan mesajlar, aynı metinli ayrı promptlar ve takılı yükleme senaryolarıyla yerel Chrome’da kontrol edildi. İlk prompt ve dosya ekiyle birlikte bütün mesajların doğru sırada PDF üretimine ulaşması, takılmada ise kısmi çıktı verilmemesi doğrulandı.

Yerel Chrome örneklerinde 150.110 karakterlik / 3.600 satırlık prompt ve iki görsel 75 sayfalık PDF’e aktarıldı; boş sayfa bulunmadı ve görsellerin çizimi doğrulandı. Çoklu görsel/canvas, arayüz düğmesi temizliği, tam prompt kurtarma ve aktif sohbet dalı eşleştirmesi de kontrol edildi. Bu kontroller oturum açılmış gerçek ChatGPT hesabındaki uçtan uca doğrulamanın yerine geçmez.

Eski çoklu platform adaptörleri, kullanılmayan yardımcı modüller, geliştirme belgeleri ve test örnekleri dağıtım ağacından kaldırılmıştır.
