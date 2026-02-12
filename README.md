# AI Chat Export

ChatGPT, Gemini, DeepSeek ve Claude sohbetlerini çeşitli formatlarda dışa aktaran Chrome uzantısı.

## Özellikler

- **Giriş yok** – Zaten açık olan chat sayfasında çalışır
- **Otomatik tespit** – Hangi AI uygulamasında olduğunuzu algılar
- **Çoklu format** – PDF, Markdown, Word, HTML veya Plain Text seçerek kaydedin
- **Görseller, matematik, özel karakterler** – Tam destek (PDF/HTML)
- **Kayıt konumu** – İndirirken kullanıcı klasör seçer (saveAs)

## Desteklenen Formatlar

| Format | Uzantı | Kullanım |
|--------|--------|----------|
| PDF | .pdf | Evrensel, yazdırma |
| Markdown | .md | Notion, Obsidian, GitHub |
| Word | .doc | Microsoft Word |
| HTML | .html | Tarayıcıda açma |
| Plain Text | .txt | Düz metin |

## Kurulum

1. Bağımlılıkları yükleyin:
   ```bash
   npm install
   ```
   (html2pdf.js kütüphanesi lib/ klasörüne kopyalanır)

2. Chrome'da `chrome://extensions` adresine gidin

3. **Geliştirici modu**nu açın

4. **Paketlenmemiş öğe yükle** ile bu klasörü seçin

## Kullanım

1. ChatGPT, Gemini, DeepSeek veya Claude chat sayfasını açın
2. İstediğiniz sohbeti görüntüleyin
3. Uzantı ikonuna tıklayın
4. **Kaydetme biçimi** açılır menüsünden format seçin (PDF, Markdown, Word, HTML, Plain Text)
5. "Aktar" butonuna basın
6. Kaydetmek istediğiniz yeri seçin

## Desteklenen Siteler

- chat.openai.com / chatgpt.com
- gemini.google.com
- chat.deepseek.com
- claude.ai

## Notlar

- Her site farklı DOM kullanır; UI değişirse adapter'lar güncellenebilir
- İkon eklemek için `icons/` klasörüne 16, 48 ve 128px PNG dosyaları ekleyip manifest.json'da icon alanlarını tanımlayın
