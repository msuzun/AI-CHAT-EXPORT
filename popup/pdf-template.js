/**
 * Builds HTML for PDF from extracted chat data.
 * Sadece body icerigi - html2canvas icin uygun.
 */
function buildPdfHtml(data, appName, options) {
  const opts = {
    messageFilter: options?.messageFilter || 'all',
    labelLanguage: options?.labelLanguage || 'tr',
  };

  const messages = Array.isArray(data?.messages) ? data.messages : [];
  const title = data?.title || appName + ' Sohbet';

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
      return `<div class="msg-block" style="margin:1em 0 1.5em 0;padding:1em;background:${bg};border-left:4px solid ${borderColor};border-radius:8px;">
        <div class="msg-label" style="font-size:0.75em;font-weight:600;color:#64748b;margin-bottom:0.5em;">${escapeHtml(label)}</div>
        <div class="msg-content">${msg.html || ''}</div>
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
