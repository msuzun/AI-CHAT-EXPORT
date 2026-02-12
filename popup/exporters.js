/**
 * Chat export formatlari
 */
function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function normalizeExportOptions(options) {
  return {
    messageFilter: options?.messageFilter || 'all',
    labelLanguage: options?.labelLanguage || 'tr',
    dateStampMode: options?.dateStampMode || 'none',
    dateRangeStart: options?.dateRangeStart || '',
    dateRangeEnd: options?.dateRangeEnd || '',
    syntaxHighlight: options?.syntaxHighlight !== false,
    exportedAt: options?.exportedAt || new Date().toISOString(),
  };
}

function getRoleLabel(role, labelLanguage) {
  const isEn = labelLanguage === 'en';
  if (role === 'user') return isEn ? 'User' : 'Kullanici';
  return isEn ? 'Assistant' : 'Asistan';
}

function isMessageIncluded(role, messageFilter) {
  if (role === 'meta') return true;
  if (messageFilter === 'user') return role === 'user';
  if (messageFilter === 'assistant') return role === 'assistant';
  return true;
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

function shouldShowContentDateStamp(dateStampMode) {
  return dateStampMode === 'content' || dateStampMode === 'both';
}

function withContentDateStamp(title, opts) {
  if (!shouldShowContentDateStamp(opts.dateStampMode)) return title;
  const stamp = formatStampDateHuman(opts.exportedAt, opts.labelLanguage);
  if (!stamp) return title;
  return `${title} - ${stamp}`;
}

function detectCodeLanguage(codeEl) {
  const classText = `${codeEl.className || ''} ${codeEl.parentElement?.className || ''}`;
  const m = classText.match(/(?:language|lang)-([a-z0-9]+)/i);
  return (m?.[1] || 'plain').toLowerCase();
}

function highlightCodeText(rawCode, lang) {
  let text = escapeHtml(rawCode || '');
  if (!text) return '';

  const keywordMap = {
    js: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'new', 'await', 'async', 'try', 'catch'],
    javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'new', 'await', 'async', 'try', 'catch'],
    ts: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'new', 'await', 'async', 'try', 'catch', 'interface', 'type'],
    typescript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'new', 'await', 'async', 'try', 'catch', 'interface', 'type'],
    py: ['def', 'return', 'if', 'elif', 'else', 'for', 'while', 'class', 'import', 'from', 'as', 'try', 'except', 'with', 'lambda'],
    python: ['def', 'return', 'if', 'elif', 'else', 'for', 'while', 'class', 'import', 'from', 'as', 'try', 'except', 'with', 'lambda'],
    bash: ['if', 'then', 'else', 'fi', 'for', 'do', 'done', 'echo', 'export'],
    sh: ['if', 'then', 'else', 'fi', 'for', 'do', 'done', 'echo', 'export'],
    json: [],
  };
  const keywords = keywordMap[lang] || keywordMap.javascript;

  text = text.replace(/(\"[^\"\n]*\"|'[^'\n]*'|`[^`\n]*`)/g, '<span class="tok-str">$1</span>');
  text = text.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-num">$1</span>');

  if (lang === 'python' || lang === 'py' || lang === 'bash' || lang === 'sh') {
    text = text.replace(/(^|\s)(#.*)$/gm, '$1<span class="tok-com">$2</span>');
  } else {
    text = text.replace(/(\/\/.*)$/gm, '<span class="tok-com">$1</span>');
  }

  if (keywords.length) {
    const kwRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
    text = text.replace(kwRegex, '<span class="tok-kw">$1</span>');
  }

  return text;
}

function applySyntaxHighlightToHtml(html, enabled) {
  if (!enabled) return html || '';
  const div = document.createElement('div');
  div.innerHTML = html || '';
  const blocks = div.querySelectorAll('pre code, code[class*="language-"], code[class*="lang-"]');
  blocks.forEach((codeEl) => {
    const lang = detectCodeLanguage(codeEl);
    const highlighted = highlightCodeText(codeEl.textContent || '', lang);
    if (highlighted) {
      codeEl.innerHTML = highlighted;
      codeEl.classList.add('syntax-ready');
    }
  });
  return div.innerHTML;
}

function htmlToText(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div.textContent || div.innerText || '';
}

function htmlToMarkdown(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  let md = '';
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName?.toLowerCase();
    let inner = '';
    for (const c of node.childNodes) inner += walk(c);
    if (tag === 'pre') return '\n```\n' + inner.trim() + '\n```\n';
    if (tag === 'code') return '`' + inner + '`';
    if (tag === 'strong' || tag === 'b') return '**' + inner + '**';
    if (tag === 'em' || tag === 'i') return '*' + inner + '*';
    if (tag === 'p' || tag === 'div') return inner ? inner + '\n\n' : '';
    if (tag === 'br') return '\n';
    if (tag === 'img') return '![](' + (node.getAttribute('src') || '') + ')';
    if (tag === 'a') return '[' + inner + '](' + (node.getAttribute('href') || '') + ')';
    if (tag === 'h1') return '# ' + inner + '\n\n';
    if (tag === 'h2') return '## ' + inner + '\n\n';
    if (tag === 'h3') return '### ' + inner + '\n\n';
    if (tag === 'ul') return inner;
    if (tag === 'ol') return inner;
    if (tag === 'li') return '- ' + inner.trim() + '\n';
    return inner;
  };
  md = walk(div).replace(/\n{3,}/g, '\n\n').trim();
  return md;
}

function buildBaseHtml(data, appName, options) {
  const opts = normalizeExportOptions(options);
  const { messages } = data;
  const stampedTitle = withContentDateStamp(data?.title || appName + ' Sohbet', opts);

  const blocks = (messages || [])
    .filter((msg) => isMessageIncluded(msg.role, opts.messageFilter))
    .map((msg) => {
      if (msg.role === 'meta') {
        return `<div class="msg-block meta"><div class="msg-content">${msg.html || ''}</div></div>`;
      }

      const label = getRoleLabel(msg.role, opts.labelLanguage);
      const cls = msg.role === 'user' ? 'msg-block user' : 'msg-block';
      const highlightedHtml = applySyntaxHighlightToHtml(msg.html || '', opts.syntaxHighlight);
      return `<div class="${cls}">
        <div class="msg-label">${escapeHtml(label)}</div>
        <div class="msg-content">${highlightedHtml}</div>
      </div>`;
    })
    .join('');

  const t = escapeHtml(stampedTitle);
  return { blocks, title: t };
}

function exportMarkdown(data, appName, options) {
  const { blocks, title } = buildBaseHtml(data, appName, options);
  const md = buildMarkdownTextFromBlocks(blocks, title);
  return new Blob([md], { type: 'text/markdown;charset=utf-8' });
}

function buildMarkdownText(data, appName, options) {
  const { blocks, title } = buildBaseHtml(data, appName, options);
  return buildMarkdownTextFromBlocks(blocks, title);
}

function buildMarkdownTextFromBlocks(blocks, title) {
  let md = `# ${title}\n\n`;
  const div = document.createElement('div');
  div.innerHTML = blocks;
  const blocksEl = div.querySelectorAll('.msg-block');
  blocksEl.forEach((b) => {
    const label = b.querySelector('.msg-label')?.textContent || '';
    const content = b.querySelector('.msg-content')?.innerHTML || '';
    if (label) md += `## ${label}\n\n`;
    md += htmlToMarkdown(content) + '\n\n';
  });
  return md.trim();
}

function exportHtml(data, appName, options) {
  const { blocks, title } = buildBaseHtml(data, appName, options);
  const full = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;padding:24px;max-width:800px;margin:0 auto}
    .msg-block{margin:1em 0;padding:1em;background:#f8fafc;border-left:4px solid #e2e8f0;border-radius:8px}
    .msg-block.user{background:#f0f4ff;border-color:#bfdbfe}
    .msg-block.meta{background:#fff;border-color:#cbd5e1}
    .msg-label{font-size:0.75em;font-weight:600;color:#64748b;margin-bottom:0.5em}
    .msg-content img{max-width:100%;height:auto}
    .msg-content pre{background:#f1f5f9;padding:1em;border-radius:6px;overflow-x:auto}
    .msg-content code{background:#f1f5f9;padding:.2em .4em;border-radius:4px}
    .tok-kw{color:#1d4ed8;font-weight:600}
    .tok-str{color:#b45309}
    .tok-num{color:#0f766e}
    .tok-com{color:#64748b;font-style:italic}
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${blocks}
</body>
</html>`;
  return new Blob([full], { type: 'text/html;charset=utf-8' });
}

function exportPlainText(data, appName, options) {
  const { blocks, title } = buildBaseHtml(data, appName, options);
  const txt = buildPlainTextFromBlocks(blocks, title);
  return new Blob([txt], { type: 'text/plain;charset=utf-8' });
}

function buildPlainText(data, appName, options) {
  const { blocks, title } = buildBaseHtml(data, appName, options);
  return buildPlainTextFromBlocks(blocks, title);
}

function buildPlainTextFromBlocks(blocks, title) {
  let txt = title + '\n\n' + '='.repeat(title.length) + '\n\n';
  const div = document.createElement('div');
  div.innerHTML = blocks;
  const blocksEl = div.querySelectorAll('.msg-block');
  blocksEl.forEach((b) => {
    const label = b.querySelector('.msg-label')?.textContent || '';
    const content = b.querySelector('.msg-content')?.innerHTML || '';
    if (label) txt += `${label}:\n`;
    txt += `${htmlToText(content)}\n\n`;
  });
  return txt.trim();
}

function exportWord(data, appName, options) {
  const { blocks, title } = buildBaseHtml(data, appName, options);
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
  <meta charset="UTF-8">
  <meta name="ProgId" content="Word.Document">
  <meta name="Generator" content="Microsoft Word">
  <title>${escapeHtml(title)}</title>
  <style>
    body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5}
    .msg-block{margin:1em 0;padding:1em}
    .msg-label{font-size:9pt;font-weight:bold;color:#555;margin-bottom:0.5em}
    .msg-content img{max-width:100%}
    .tok-kw{color:#1d4ed8;font-weight:600}
    .tok-str{color:#b45309}
    .tok-num{color:#0f766e}
    .tok-com{color:#64748b;font-style:italic}
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${blocks}
</body>
</html>`;
  return new Blob(['\ufeff' + html], { type: 'application/msword' });
}

