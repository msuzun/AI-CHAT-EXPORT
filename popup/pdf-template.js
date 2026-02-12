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
  const baseTitle = data?.title || appName + ' Sohbet';
  const stamp = formatStampDateHuman(opts.exportedAt, opts.labelLanguage);
  const title =
    (opts.dateStampMode === 'content' || opts.dateStampMode === 'both') && stamp
      ? `${baseTitle} - ${stamp}`
      : baseTitle;

  const blocks = messages
    .filter((msg) => {
      if (msg.role === 'meta') return true;
      if (opts.messageFilter === 'user') return msg.role === 'user';
      if (opts.messageFilter === 'assistant') return msg.role === 'assistant';
      return true;
    })
    .map((msg) => {
      if (msg.role === 'meta') {
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
      const highlightedHtml =
        typeof applySyntaxHighlightToHtml === 'function'
          ? applySyntaxHighlightToHtml(msg.html || '', opts.syntaxHighlight)
          : msg.html || '';
      return `<div class="msg-block" style="margin:1em 0 1.5em 0;padding:1em;background:${bg};border-left:4px solid ${borderColor};border-radius:8px;">
        <div class="msg-label" style="font-size:0.75em;font-weight:600;color:#64748b;margin-bottom:0.5em;">${escapeHtml(label)}</div>
        <div class="msg-content">${highlightedHtml}</div>
      </div>`;
    })
    .join('');

  return `<style>
    .pdf-wrapper .msg-block{break-inside:avoid;page-break-inside:avoid;margin-bottom:1.5em}
    .pdf-wrapper .msg-content{word-wrap:break-word;orphans:2;widows:2}
    .pdf-wrapper .msg-content img{max-width:100%;height:auto}
    .pdf-wrapper .msg-content pre{background:#f1f5f9;padding:1em;border-radius:6px;overflow-x:auto;break-inside:avoid}
    .pdf-wrapper .msg-content code{font-family:ui-monospace,monospace;background:#f1f5f9;padding:.2em .4em;border-radius:4px}
    .pdf-wrapper .msg-content pre code{background:none;padding:0}
    .pdf-wrapper .tok-kw{color:#1d4ed8;font-weight:600}
    .pdf-wrapper .tok-str{color:#b45309}
    .pdf-wrapper .tok-num{color:#0f766e}
    .pdf-wrapper .tok-com{color:#64748b;font-style:italic}
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

