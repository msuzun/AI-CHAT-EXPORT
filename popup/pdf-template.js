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

  /** Normalize ChatGPT markup while preserving semantic content. */
  const lightNormalizeForPdf = (html) => {
    const div = document.createElement('div');
    div.replaceChildren(DOMPurify.sanitize(html || '', { RETURN_DOM_FRAGMENT: true, FORCE_BODY: true, ADD_TAGS: ['style'] }));
    div.querySelectorAll(
      ['script', 'style', 'link[rel="stylesheet"]', 'iframe', 'input', 'textarea', 'select', 'option', '[hidden]', '[aria-hidden="true"]'].join(',')
    ).forEach((el) => el.remove());
    div.querySelectorAll('button,[role="button"]').forEach((el) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const hasMedia = !!el.querySelector('img,[data-export-attachment],a[href]');
      if (!hasMedia && !/\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip)\b/i.test(text)) {
        el.remove();
        return;
      }
      const replacement = document.createElement('span');
      if (/\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip|rar|7z)\b/i.test(text)) {
        replacement.setAttribute('data-export-attachment', 'true');
      }
      while (el.firstChild) replacement.appendChild(el.firstChild);
      el.replaceWith(replacement);
    });
    div.querySelectorAll('*').forEach((el) => {
      const tag = (el.tagName || '').toLowerCase();
      const rawClass = String(el.getAttribute('class') || '');
      const keptClasses =
        tag === 'code' || tag === 'pre'
          ? rawClass.split(/\s+/).filter((c) => /^language-|^lang-|^tok-/.test(c)).join(' ')
          : '';
      if (keptClasses) el.setAttribute('class', keptClasses);
      else el.removeAttribute('class');
      if (el.style.whiteSpace.startsWith('pre')) el.setAttribute('data-export-whitespace', 'true');
      el.removeAttribute('style');
      if (tag === 'img' || tag === 'video' || tag === 'canvas') {
        el.removeAttribute('width');
        el.removeAttribute('height');
      }
      if (tag === 'img') {
        el.removeAttribute('srcset');
        el.removeAttribute('sizes');
        el.removeAttribute('loading');
      }
      if (el.getAttribute('aria-hidden') === 'true') el.removeAttribute('aria-hidden');
    });
    return div.innerHTML;
  };

  const hasVisibleContent = (html) => {
    const d = document.createElement('div');
    d.replaceChildren(DOMPurify.sanitize(html || '', { RETURN_DOM_FRAGMENT: true, FORCE_BODY: true, ADD_TAGS: ['style'] }));
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
    .pdf-wrapper{display:block;width:794px!important;max-width:794px!important;box-sizing:border-box!important;overflow:hidden!important}
    .pdf-wrapper *,
    .pdf-wrapper *::before,
    .pdf-wrapper *::after{box-sizing:border-box;max-width:100%}
    .pdf-wrapper .msg-block{break-inside:auto;page-break-inside:auto;margin-bottom:1.5em}
    .pdf-wrapper [data-export-whitespace]{white-space:pre-wrap}
    .pdf-wrapper .msg-content{display:block;width:100%;min-width:0;word-break:break-word;word-wrap:break-word;overflow-wrap:anywhere;orphans:3;widows:3;color:#1e293b!important;-webkit-text-fill-color:#1e293b!important}
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
    .pdf-wrapper .msg-content [data-export-attachment]{display:inline-block;max-width:100%;margin:.35em 0;padding:.55em .75em;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#334155!important;overflow-wrap:anywhere}
    .pdf-wrapper .msg-content pre{background:#f1f5f9;padding:1em;border-radius:6px;overflow:hidden;white-space:pre-wrap;word-break:break-word;break-inside:auto;page-break-inside:auto}
    .pdf-wrapper .msg-content table{display:table;width:100%!important;table-layout:fixed;border-collapse:collapse;overflow-wrap:anywhere}
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
