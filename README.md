# AI Chat PDF Export

ChatGPT, Gemini, DeepSeek ve Claude sohbetlerini PDF olarak dışa aktaran Chrome uzantısı.

## Özellikler

- **Giriş yok** – Zaten açık olan chat sayfasında çalışır
- **Otomatik tespit** – Hangi AI uygulamasında olduğunuzu algılar
- **Onay mesajı** – Örn: "ChatGPT için aktif chat'i PDF'e aktarmak ister misiniz?"
- **Görseller, matematik, özel karakterler** – Tam destek
- **Kayıt konumu** – İndirirken kullanıcı klasör seçer (saveAs)

## Kurulum

1. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```
   (Bu komut html2pdf.js kütüphanesini lib/ klasörüne kopyalar)

2. Chrome'da `chrome://extensions` adresine gidin

3. **Geliştirici modu**nu açın

4. **Paketlenmemiş öğe yükle** ile bu klasörü seçin

## Kullanım

1. ChatGPT, Gemini, DeepSeek veya Claude chat sayfasını açın
2. İstediğiniz sohbeti görüntüleyin
3. Tarayıcı araç çubuğundaki uzantı ikonuna tıklayın
4. "PDF'e Aktar" butonuna basın
5. Kaydetmek istediğiniz yeri seçin

## Desteklenen Siteler

- chat.openai.com / chatgpt.com
- gemini.google.com
- chat.deepseek.com
- claude.ai

## Notlar

- Her site farklı DOM kullanır; UI değişirse adapter'lar güncellenebilir
- İkon eklemek için `icons/` klasörüne 16, 48 ve 128px PNG dosyaları ekleyip manifest.json'da icon alanlarını tanımlayın
