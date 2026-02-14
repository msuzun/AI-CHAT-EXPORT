# Yeni AI Platformu Ekleme Prompt'u

Bu belge, yeni bir AI chat platformunu uzantıya eklemek için kullanılacak analiz adımlarını ve prompt şablonunu içerir.

---

## 1. Platform Analizi (Inspector ile)

Yeni platform eklemeden önce siteyi açıp DevTools (F12) ile inceleyin:

| Adım | Kontrol | Nasıl Bulunur? |
|------|---------|----------------|
| 1 | **Mesaj container'ları** | DOM'da sohbet mesajlarını saran ana element. `article`, `div[class*="message"]`, `[data-role]` gibi |
| 2 | **User mesaj ayırt edici** | Kullanıcı mesajlarında olan class/attribute: `data-message-author-role="user"`, `[class*="user"]`, `[data-role="user"]` |
| 3 | **Assistant mesaj ayırt edici** | Asistan mesajlarında olan class/attribute: `data-message-author-role="assistant"`, `[class*="model"]`, `[data-role="model"]` |
| 4 | **Timestamp** | Varsa: `time[datetime]`, `[data-time]`, `[data-timestamp]` |
| 5 | **Title** | Sohbet başlığı: `h1`, `[class*="title"]`, `[class*="ConversationTitle"]` |
| 6 | **İçerik selector** | Mesaj metninin bulunduğu element: `[class*="markdown"]`, `[class*="content"]`, `.prose` |
| 7 | **Sohbet URL pattern** | Örn: `/c/`, `/chat/`, `/app/` — link toplama için |

**İpucu:** `document.querySelectorAll('selector')` ile Console'da test edin.

---

## 2. Prompt Şablonu

Aşağıdaki şablonu doldurup AI asistanına verin (veya manuel implemente edin):

```
[PLATFORM_ADI].com sitesi için extractor oluştur.

Site yapısı:
- Host(lar): [örn: chat.platform.com, platform.com]
- Mesaj container selector: [BULDUĞUN_SELECTOR]
- User mesaj ayırt edici: [USER_CLASS veya ATTRIBUTE - örn: data-role="user", [class*="user"]]
- Assistant mesaj ayırt edici: [ASSISTANT_CLASS veya ATTRIBUTE]
- İçerik selector: [örn: [class*="markdown"], .prose]
- Timestamp selector: [time[datetime], [data-time] veya yok]
- Title selector: [h1, [class*="title"]]
- Sohbet URL path pattern: [/chat/, /c/ vb.]
- defaultTitle: "[Platform Adı] Conversation"

Buna göre:
1. platforms/platformManager.js - PLATFORMS objesine platform config ekle
2. content/adapters/[platformid].js - Yeni adapter dosyası oluştur (BaseAdapter extend veya extractXxx fonksiyonu)
3. content/adapters/AdapterFactory.js - DEFAULT_EXTRACTORS'a yeni extractor'ı register et
4. content/content.js - extractors objesine ekle, PLATFORMS ve getPlatformFromUrl güncelle
5. popup/popup.js - SITES objesine ekle, isLikelyChatUrl'e path pattern ekle
6. manifest.json - host_permissions ve content_scripts.matches'a yeni host pattern ekle
7. Test et: İlgili chat sayfasında export'u dene
```

---

## 3. Örnek Kullanım (Doldurulmuş)

```
Perplexity.ai sitesi için extractor oluştur.

Site yapısı:
- Host(lar): perplexity.ai, www.perplexity.ai
- Mesaj container selector: [class*="message"], [data-role], article
- User mesaj ayırt edici: [class*="user"], [data-role="user"]
- Assistant mesaj ayırt edici: [class*="assistant"], [data-role="model"]
- İçerik selector: [class*="markdown"], [class*="content"], .prose
- Timestamp selector: time[datetime]
- Title selector: h1, [class*="title"]
- Sohbet URL path pattern: /search/, /thread/
- defaultTitle: "Perplexity Conversation"

Buna göre:
1. platforms/platformManager.js - PLATFORMS objesine perplexity config ekle
2. content/adapters/perplexity.js - extractPerplexity() fonksiyonu oluştur
3. content/adapters/AdapterFactory.js - perplexity: extractPerplexity ekle
4. content/content.js - extractors, PLATFORMS, getPlatformFromUrl güncelle
5. popup/popup.js - SITES, isLikelyChatUrl güncelle
6. manifest.json - host_permissions, content_scripts.matches güncelle
7. Test et
```

---

## 4. Güncellenecek Dosyalar Özeti

| Dosya | Değişiklik |
|-------|------------|
| `platforms/platformManager.js` | `PLATFORMS` objesine yeni entry |
| `content/adapters/[id].js` | Yeni adapter dosyası |
| `content/adapters/AdapterFactory.js` | Import + `DEFAULT_EXTRACTORS` |
| `content/content.js` | `extractors`, `PLATFORMS`, `getPlatformFromUrl` |
| `popup/popup.js` | `SITES`, `isLikelyChatUrl` |
| `manifest.json` | `host_permissions`, `content_scripts[].matches` |

---

## 5. Platform Config Şeması (platformManager.js)

```javascript
platformid: {
  id: 'platformid',
  name: 'Platform Adı',
  hosts: ['chat.platform.com', 'platform.com'],
  hostContains: 'platform',  // opsiyonel: *.platform.com için
  pathPattern: (p) => p.includes('/chat/') || p.includes('/c/'),
  chatPathMatchers: ['/chat/', '/c/'],
  selectors: {
    messageBlocks: '...',
    content: '...',
    title: '...',
  },
  defaultTitle: 'Platform Conversation',
},
```
