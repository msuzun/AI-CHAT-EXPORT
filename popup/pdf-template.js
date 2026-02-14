/**
 * Builds HTML for PDF from extracted chat data.
 * Sadece body icerigi - html2canvas icin uygun.
 */
function buildPdfHtml(data, appName, options) {
  const opts = {
    messageFilter: options?.messageFilter || 'all',
    labelLanguage: options?.labelLanguage || 'tr',
    dateStampMode: options?.dateStampMode || 'none',
    exportedAt: options?.exportedAt || new Date().toISOString(),
    syntaxHighlight: options?.syntaxHighlight !== false,
  };

  const messages = Array.isArray(data?.messages) ? data.messages : [];

  /** Sadece tehlikeli etiketleri kaldirir; layout dokunmaz. normalizeForPdf bos verdiginde fallback. */
  const lightNormalizeForPdf = (html) => {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    div.querySelectorAll(
      ['script', 'style', 'link[rel="stylesheet"]', 'iframe', '[hidden]', '[aria-hidden="true"]'].join(',')
    ).forEach((el) => el.remove());
    div.querySelectorAll('*').forEach((el) => {
      const tag = (el.tagName || '').toLowerCase();
      const rawClass = String(el.getAttribute('class') || '');
      const keptClasses =
        tag === 'code' || tag === 'pre'
          ? rawClass.split(/\s+/).filter((c) => /^language-|^lang-|^tok-/.test(c)).join(' ')
          : '';
      if (keptClasses) el.setAttribute('class', keptClasses);
      else el.removeAttribute('class');
      el.removeAttribute('style');
      if (el.getAttribute('aria-hidden') === 'true') el.removeAttribute('aria-hidden');
    });
    return div.innerHTML;
  };

  const normalizeForPdf = (html) => {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    div.querySelectorAll(
      [
        'script',
        'style',
        'link[rel="stylesheet"]',
        'iframe',
        '[hidden]',
        '[aria-hidden="true"]',
      ].join(',')
    ).forEach((el) => el.remove());

    // Chat sayfasindan gelen tam ekran/layout wrapper'lari PDF'te bos sayfa olusturmamasi icin temizle.
    div.querySelectorAll(
      [
        '[class*="min-h-screen"]',
        '[class*="h-screen"]',
        '[class*="fixed"]',
        '[class*="sticky"]',
        '[class*="absolute"]',
        '[style*="position: fixed"]',
        '[style*="position:fixed"]',
        '[style*="position: absolute"]',
        '[style*="position:absolute"]',
      ].join(',')
    ).forEach((el) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const hasMedia = !!el.querySelector?.('img,picture,video,canvas,math,table,pre,code,ul,ol,li,blockquote,p');
      if (!text && !hasMedia) {
        el.remove();
      } else {
        el.style.position = 'static';
        el.style.minHeight = '0';
        el.style.height = 'auto';
      }
    });

    // Chat UI sinif/stilleri PDF'te metni gorunmez yapabildigi icin semantik sadeleştirme.
    div.querySelectorAll('*').forEach((el) => {
      const tag = (el.tagName || '').toLowerCase();
      const rawClass = String(el.getAttribute('class') || '');
      const keptClasses =
        tag === 'code' || tag === 'pre'
          ? rawClass
              .split(/\s+/)
              .filter((c) => /^language-|^lang-|^tok-/.test(c))
              .join(' ')
          : '';
      if (keptClasses) el.setAttribute('class', keptClasses);
      else el.removeAttribute('class');

      el.removeAttribute('style');
      el.removeAttribute('hidden');
      if (el.getAttribute('aria-hidden') === 'true') el.removeAttribute('aria-hidden');
    });

    return div.innerHTML;
  };

  const isRenderable = (msg) => {
    if (!msg) return false;
    if (msg.role === 'meta') return !!String(msg.html || '').trim();
    const div = document.createElement('div');
    div.innerHTML = msg.html || '';
    div.querySelectorAll('script,style,svg,[aria-hidden="true"]').forEach((el) => el.remove());
    const plain = (div.textContent || '').replace(/\s+/g, ' ').trim();
    const roleOnly = /^(kullanici|asistan|assistant|user|you|chatgpt)$/i.test(plain);
    if (plain && !roleOnly) return true;
    return !!div.querySelector('img,picture,video,canvas,math,table,pre,code,ul,ol,li,blockquote');
  };

  const hasVisibleContent = (html) => {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    d.querySelectorAll('script,style').forEach((el) => el.remove());
    return ((d.textContent || '').replace(/\s+/g, ' ').trim().length > 0) || !!d.querySelector('img,picture,video,canvas,math,table,pre,code,ul,ol,li,blockquote');
  };
  const baseTitle = data?.title || appName + ' Sohbet';
  const stamp = formatStampDateHuman(opts.exportedAt, opts.labelLanguage);
  const title =
    (opts.dateStampMode === 'content' || opts.dateStampMode === 'both') && stamp
      ? `${baseTitle} - ${stamp}`
      : baseTitle;

  const isMessageIncluded = (role) => {
    if (role === 'meta') return true;
    if (opts.messageFilter === 'user') return role === 'user';
    if (opts.messageFilter === 'assistant') return role === 'assistant';
    return true;
  };

  const blocks = messages
    .filter((msg) => msg && isMessageIncluded(msg.role))
    .map((msg) => {
      if (msg.role === 'meta') {
        if (!hasVisibleContent(msg.html || '')) return null;
        return `<div class="msg-block" style="margin:1em 0 1.5em 0;padding:1em;background:#ffffff;border-left:4px solid #cbd5e1;border-radius:8px;">
          <div class="msg-content">${msg.html || ''}</div>
        </div>`;
      }

      const isUser = msg.role === 'user';
      const label = isUser
        ? opts.labelLanguage === 'en'
          ? 'User'
          : 'Kullanici'
        : opts.labelLanguage === 'en'
          ? 'Assistant'
          : 'Asistan';
      const bg = isUser ? '#f0f4ff' : '#f8fafc';
      const borderColor = isUser ? '#bfdbfe' : '#e2e8f0';
      // Onizleme ile ayni icerik: sadece light normalize (script/style/class temizleme), agresif layout kaldirma yok.
      const normalized = lightNormalizeForPdf(msg.html || '');
      const highlightedHtml =
        typeof applySyntaxHighlightToHtml === 'function'
          ? applySyntaxHighlightToHtml(normalized, opts.syntaxHighlight)
          : normalized;
      if (!hasVisibleContent(highlightedHtml)) return null;
      return `<div class="msg-block" style="margin:1em 0 1.5em 0;padding:1em;background:${bg};border-left:4px solid ${borderColor};border-radius:8px;">
        <div class="msg-label" style="font-size:0.75em;font-weight:600;color:#64748b;margin-bottom:0.5em;">${escapeHtml(label)}</div>
        <div class="msg-content">${highlightedHtml}</div>
      </div>`;
    })
    .filter(Boolean)
    .join('');

  return `<style>
    .pdf-wrapper .msg-block{break-inside:avoid;page-break-inside:avoid;margin-bottom:1.5em}
    .pdf-wrapper .msg-content{word-wrap:break-word;overflow-wrap:anywhere;orphans:3;widows:3;color:#1e293b!important;-webkit-text-fill-color:#1e293b!important}
    .pdf-wrapper .msg-content *{color:inherit!important;opacity:1!important;visibility:visible!important}
    .pdf-wrapper .msg-content *{max-width:100%}
    .pdf-wrapper .msg-content [style*="position:fixed"],
    .pdf-wrapper .msg-content [style*="position: fixed"],
    .pdf-wrapper .msg-content [style*="position:absolute"],
    .pdf-wrapper .msg-content [style*="position: absolute"]{position:static!important}
    .pdf-wrapper .msg-content p,
    .pdf-wrapper .msg-content li{page-break-inside:avoid;break-inside:avoid;padding-bottom:.06em}
    .pdf-wrapper .msg-content h1,
    .pdf-wrapper .msg-content h2,
    .pdf-wrapper .msg-content h3,
    .pdf-wrapper .msg-content h4{page-break-after:avoid}
    .pdf-wrapper .msg-content img{max-width:100%;height:auto}
    .pdf-wrapper .msg-content pre{background:#f1f5f9;padding:1em;border-radius:6px;overflow-x:auto;break-inside:avoid;page-break-inside:avoid}
    .pdf-wrapper .msg-content code{font-family:ui-monospace,monospace;background:#f1f5f9;padding:.2em .4em;border-radius:4px}
    .pdf-wrapper .msg-content pre code{background:none;padding:0}
    .pdf-wrapper .tok-kw{color:#1d4ed8!important;font-weight:600}
    .pdf-wrapper .tok-str{color:#b45309!important}
    .pdf-wrapper .tok-num{color:#0f766e!important}
    .pdf-wrapper .tok-com{color:#64748b!important;font-style:italic}
  </style>
  <div class="pdf-wrapper" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;padding:24px;max-width:100%;">
    <div class="pdf-title" style="font-size:20px;font-weight:700;margin-bottom:1em;color:#0f172a;">${escapeHtml(title)}</div>
    ${blocks}
  </div>`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatStampDateHuman(iso, labelLanguage) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString(labelLanguage === 'en' ? 'en-US' : 'tr-TR', {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return d.toISOString();
  }
}

