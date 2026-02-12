/**
 * Cloud provider integrations: Notion, Google Drive, OneDrive
 */

/* ================================================================
   NOTION
   ================================================================ */

function normalizeNotionPageId(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return '';

  let candidate = value;

  // Notion page URL verilirse ID parcasini al.
  if (/^https?:\/\//i.test(candidate)) {
    try {
      const url = new URL(candidate);
      const lastSegment = (url.pathname.split('/').pop() || '').trim();
      candidate = lastSegment || candidate;
    } catch (_) {}
  }

  // URL hash/query gibi eklentileri temizle.
  candidate = candidate.split('#')[0].split('?')[0].trim();

  // UUID disi karakterleri at.
  candidate = candidate.replace(/[^a-fA-F0-9-]/g, '');
  if (!candidate) return '';

  // 32 hex ID ise UUID formatina cevir.
  const compact = candidate.replace(/-/g, '');
  if (/^[a-fA-F0-9]{32}$/.test(compact)) {
    return (
      `${compact.slice(0, 8)}-` +
      `${compact.slice(8, 12)}-` +
      `${compact.slice(12, 16)}-` +
      `${compact.slice(16, 20)}-` +
      `${compact.slice(20)}`
    ).toLowerCase();
  }

  // Zaten UUID formatindaysa normalize et.
  if (/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(candidate)) {
    return candidate.toLowerCase();
  }

  return '';
}

function notionTextChunks(text, maxLen = 2000) {
  const value = String(text || '');
  if (!value) return [' '];
  const out = [];
  for (let i = 0; i < value.length; i += maxLen) {
    out.push(value.slice(i, i + maxLen));
  }
  return out.length ? out : [' '];
}

function notionRichText(text, annotations = {}, link = null) {
  return notionTextChunks(text).map((chunk) => {
    const item = {
      type: 'text',
      text: { content: chunk },
      annotations: {
        bold: !!annotations.bold,
        italic: !!annotations.italic,
        strikethrough: !!annotations.strikethrough,
        underline: !!annotations.underline,
        code: !!annotations.code,
        color: 'default',
      },
    };
    if (link) {
      item.text.link = { url: link };
    }
    return item;
  });
}

function notionEquationRichText(expression) {
  const expr = String(expression || '').trim();
  if (!expr) return [];
  return [{ type: 'equation', equation: { expression: expr } }];
}

function extractLatexExpression(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return '';

  const directAttrs = ['data-tex', 'data-latex', 'data-math'];
  for (const attr of directAttrs) {
    const val = node.getAttribute?.(attr);
    if (val && val.trim()) return val.trim();
  }

  const annotation =
    node.querySelector?.('annotation[encoding="application/x-tex"]') ||
    node.querySelector?.('annotation');
  if (annotation?.textContent?.trim()) return annotation.textContent.trim();

  const scriptLatex =
    node.querySelector?.('script[type="math/tex"]') ||
    node.querySelector?.('script[type="math/tex; mode=display"]');
  if (scriptLatex?.textContent?.trim()) return scriptLatex.textContent.trim();

  return '';
}

function isMathNode(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  const tag = String(node.tagName || '').toLowerCase();
  if (tag === 'math') return true;
  const cls = String(node.className || '').toLowerCase();
  return cls.includes('katex') || cls.includes('mathjax') || cls.includes('mjx');
}

function isDisplayMathNode(node) {
  if (!isMathNode(node)) return false;
  const cls = String(node.className || '').toLowerCase();
  if (cls.includes('katex-display') || cls.includes('math-display')) return true;
  const mode = String(node.getAttribute?.('mode') || '').toLowerCase();
  return mode === 'display';
}

function mergeAnnotations(base, patch) {
  return {
    bold: !!(base.bold || patch.bold),
    italic: !!(base.italic || patch.italic),
    strikethrough: !!(base.strikethrough || patch.strikethrough),
    underline: !!(base.underline || patch.underline),
    code: !!(base.code || patch.code),
  };
}

function trimNotionRichText(items) {
  if (!Array.isArray(items) || !items.length) return [];
  const out = [...items];
  while (out.length && !richTextHasContent(out[0])) out.shift();
  while (out.length && !richTextHasContent(out[out.length - 1])) out.pop();
  return out;
}

function richTextHasContent(item) {
  if (!item) return false;
  if (item.type === 'equation') return !!String(item.equation?.expression || '').trim();
  return !!String(item.text?.content || '').trim();
}

function richTextKey(item) {
  if (item?.type === 'equation') {
    return `eq|${item?.equation?.expression || ''}`;
  }
  const ann = item?.annotations || {};
  const link = item?.text?.link?.url || '';
  return [
    ann.bold ? '1' : '0',
    ann.italic ? '1' : '0',
    ann.strikethrough ? '1' : '0',
    ann.underline ? '1' : '0',
    ann.code ? '1' : '0',
    link,
  ].join('|');
}

function compactNotionRichText(items, maxItems = 100) {
  const trimmed = trimNotionRichText(items);
  if (!trimmed.length) return [];

  const merged = [];
  for (const item of trimmed) {
    if (!richTextHasContent(item)) continue;

    if (item.type !== 'text') {
      merged.push(item);
      continue;
    }

    const content = item.text?.content || '';

    const currentKey = richTextKey(item);
    const prev = merged[merged.length - 1];
    if (prev && richTextKey(prev) === currentKey) {
      const prevText = prev.text?.content || '';
      const combined = prevText + content;
      if (combined.length <= 2000) {
        prev.text.content = combined;
      } else {
        const chunks = notionTextChunks(combined, 2000);
        prev.text.content = chunks[0];
        for (let i = 1; i < chunks.length; i++) {
          merged.push({
            ...item,
            text: {
              ...item.text,
              content: chunks[i],
            },
          });
        }
      }
    } else {
      merged.push(item);
    }
  }

  if (merged.length <= maxItems) return merged;

  const keepCount = Math.max(1, maxItems - 1);
  const head = merged.slice(0, keepCount);
  const overflowText = merged.slice(keepCount).map((i) => {
    if (i?.type === 'equation') return ` ${i?.equation?.expression || ''} `;
    return i?.text?.content || '';
  }).join('');
  const maxTailLen = 1997; // + "..." = 2000
  const tailContent = overflowText.length > maxTailLen ? `${overflowText.slice(0, maxTailLen)}...` : overflowText;

  head.push({
    type: 'text',
    text: {
      content: tailContent || '...',
    },
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color: 'default',
    },
  });

  return head;
}

function inlineNodeToRichText(node, annotations = {}, link = null) {
  if (!node) return [];

  if (node.nodeType === Node.TEXT_NODE) {
    return notionRichText(node.nodeValue || '', annotations, link);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  if (isMathNode(node)) {
    const latex = extractLatexExpression(node);
    if (latex) return notionEquationRichText(latex);
  }

  const tag = String(node.tagName || '').toLowerCase();
  if (tag === 'br') {
    return notionRichText('\n', annotations, link);
  }

  let nextAnnotations = { ...annotations };
  let nextLink = link;

  if (tag === 'strong' || tag === 'b') nextAnnotations = mergeAnnotations(nextAnnotations, { bold: true });
  if (tag === 'em' || tag === 'i') nextAnnotations = mergeAnnotations(nextAnnotations, { italic: true });
  if (tag === 'u') nextAnnotations = mergeAnnotations(nextAnnotations, { underline: true });
  if (tag === 's' || tag === 'del') nextAnnotations = mergeAnnotations(nextAnnotations, { strikethrough: true });
  if (tag === 'code') nextAnnotations = mergeAnnotations(nextAnnotations, { code: true });
  if (tag === 'a') nextLink = node.getAttribute('href') || nextLink;

  const out = [];
  for (const child of node.childNodes) {
    out.push(...inlineNodeToRichText(child, nextAnnotations, nextLink));
  }
  return out;
}

function blockWithRichText(type, richText, extra = {}) {
  const trimmed = compactNotionRichText(richText, 100);
  if (!trimmed.length && type !== 'divider') return null;
  const block = { object: 'block', type };
  block[type] = { rich_text: trimmed, ...extra };
  return block;
}

function splitLiContent(li) {
  const inlineRoot = document.createElement('div');
  const nested = [];

  for (const child of Array.from(li.childNodes)) {
    if (
      child.nodeType === Node.ELEMENT_NODE &&
      (child.tagName?.toLowerCase() === 'ul' || child.tagName?.toLowerCase() === 'ol')
    ) {
      nested.push(child);
    } else {
      inlineRoot.appendChild(child.cloneNode(true));
    }
  }
  return { inlineRoot, nested };
}

function listElementToNotionBlocks(listEl) {
  const listTag = listEl.tagName.toLowerCase();
  const itemType = listTag === 'ol' ? 'numbered_list_item' : 'bulleted_list_item';
  const blocks = [];

  const items = Array.from(listEl.children).filter((el) => el.tagName?.toLowerCase() === 'li');
  items.forEach((li) => {
    const { inlineRoot, nested } = splitLiContent(li);
    const rich = inlineNodeToRichText(inlineRoot);
    const itemBlock = blockWithRichText(itemType, rich);
    if (!itemBlock) return;

    const childBlocks = [];
    nested.forEach((nestedList) => childBlocks.push(...listElementToNotionBlocks(nestedList)));
    if (childBlocks.length) itemBlock[itemType].children = childBlocks;

    blocks.push(itemBlock);
  });

  return blocks;
}

function hasBlockChildren(node) {
  return Array.from(node.children || []).some((c) => {
    const t = c.tagName?.toLowerCase();
    return ['p', 'div', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'pre', 'blockquote', 'hr'].includes(t);
  });
}

function detectNotionCodeLanguage(node) {
  const classText = `${node?.className || ''} ${node?.parentElement?.className || ''}`.toLowerCase();
  const m = classText.match(/(?:language|lang)-([a-z0-9#+-]+)/i);
  const lang = (m?.[1] || 'plain text').toLowerCase();
  const map = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    sh: 'bash',
    shell: 'bash',
    yml: 'yaml',
    cs: 'c#',
    csharp: 'c#',
    cpp: 'c++',
  };
  const normalized = map[lang] || lang;
  const allowed = new Set([
    'plain text', 'abap', 'arduino', 'bash', 'basic', 'c', 'c#', 'c++', 'clojure', 'coffeescript',
    'css', 'dart', 'diff', 'docker', 'elixir', 'elm', 'erlang', 'flow', 'fortran', 'f#', 'gherkin',
    'glsl', 'go', 'graphql', 'groovy', 'haskell', 'html', 'java', 'javascript', 'json', 'julia',
    'kotlin', 'latex', 'less', 'lisp', 'livescript', 'lua', 'makefile', 'markdown', 'markup', 'matlab',
    'mermaid', 'nix', 'objective-c', 'ocaml', 'pascal', 'perl', 'php', 'powershell', 'prolog',
    'protobuf', 'python', 'r', 'reason', 'ruby', 'rust', 'sass', 'scala', 'scheme', 'scss',
    'shell', 'sql', 'swift', 'toml', 'typescript', 'vb.net', 'verilog', 'vhdl', 'visual basic',
    'webassembly', 'xml', 'yaml', 'java/c/c++/c#',
  ]);
  return allowed.has(normalized) ? normalized : 'plain text';
}

function htmlNodeToNotionBlocks(node) {
  if (!node) return [];

  if (node.nodeType === Node.TEXT_NODE) {
    const txt = node.nodeValue || '';
    if (!txt.trim()) return [];
    return [blockWithRichText('paragraph', notionRichText(txt))].filter(Boolean);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  const tag = String(node.tagName || '').toLowerCase();

  if (isDisplayMathNode(node)) {
    const latex = extractLatexExpression(node);
    if (latex) {
      return [{ object: 'block', type: 'equation', equation: { expression: latex } }];
    }
  }

  if (tag === 'hr') return [{ object: 'block', type: 'divider', divider: {} }];

  if (tag === 'h1' || tag === 'h2') {
    const block = blockWithRichText('heading_2', inlineNodeToRichText(node));
    return block ? [block] : [];
  }

  if (tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
    const block = blockWithRichText('heading_3', inlineNodeToRichText(node));
    return block ? [block] : [];
  }

  if (tag === 'ul' || tag === 'ol') {
    return listElementToNotionBlocks(node);
  }

  if (tag === 'pre') {
    const codeText = node.textContent || '';
    const codeEl = node.querySelector('code') || node;
    const lang = detectNotionCodeLanguage(codeEl);
    const block = blockWithRichText('code', notionRichText(codeText), { language: lang || 'plain text' });
    return block ? [block] : [];
  }

  if (tag === 'code') {
    const codeText = node.textContent || '';
    if (codeText.includes('\n')) {
      const lang = detectNotionCodeLanguage(node);
      const block = blockWithRichText('code', notionRichText(codeText), { language: lang || 'plain text' });
      return block ? [block] : [];
    }
  }

  if (tag === 'blockquote') {
    const block = blockWithRichText('quote', inlineNodeToRichText(node));
    return block ? [block] : [];
  }

  if (tag === 'p') {
    const block = blockWithRichText('paragraph', inlineNodeToRichText(node));
    return block ? [block] : [];
  }

  if (tag === 'div' || tag === 'section' || tag === 'article') {
    if (hasBlockChildren(node)) {
      const blocks = [];
      for (const child of node.childNodes) {
        blocks.push(...htmlNodeToNotionBlocks(child));
      }
      return blocks;
    }
    const block = blockWithRichText('paragraph', inlineNodeToRichText(node));
    return block ? [block] : [];
  }

  const paragraph = blockWithRichText('paragraph', inlineNodeToRichText(node));
  if (paragraph) return [paragraph];

  const fallback = [];
  for (const child of node.childNodes) {
    fallback.push(...htmlNodeToNotionBlocks(child));
  }
  return fallback;
}

function htmlToNotionBlocks(html) {
  const root = document.createElement('div');
  root.innerHTML = html || '';
  const blocks = [];
  for (const node of root.childNodes) {
    blocks.push(...htmlNodeToNotionBlocks(node));
  }
  return blocks;
}

function buildNotionBlocks(messages, exportOptions) {
  const opts =
    typeof normalizeExportOptions === 'function'
      ? normalizeExportOptions(exportOptions)
      : {
          messageFilter: 'all',
          labelLanguage: exportOptions?.labelLanguage || 'tr',
        };

  const blocks = [];

  for (const msg of messages || []) {
    if (typeof isMessageIncluded === 'function' && !isMessageIncluded(msg.role, opts.messageFilter)) {
      continue;
    }

    if (msg.role !== 'meta') {
      const label =
        typeof getRoleLabel === 'function'
          ? getRoleLabel(msg.role, opts.labelLanguage)
          : msg.role === 'user'
            ? 'Kullanici'
            : 'Asistan';

      const labelBlock = blockWithRichText('heading_3', notionRichText(label));
      if (labelBlock) blocks.push(labelBlock);
    }

    blocks.push(...htmlToNotionBlocks(msg.html || ''));
    blocks.push({ object: 'block', type: 'divider', divider: {} });
  }

  return blocks;
}

async function notionAppendChildren(token, blockId, children) {
  if (!children?.length) return;
  const res = await fetch(`https://api.notion.com/v1/blocks/${blockId}/children`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({ children }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Notion API hatasi: ${res.status}`);
  }
}

async function notionCreatePage(token, parentPageId, title, messages, exportOptions) {
  const normalizedParentPageId = normalizeNotionPageId(parentPageId);
  if (!normalizedParentPageId) {
    throw new Error(
      "Gecersiz Notion Hedef Sayfa ID. Ayarlar > Notion alanina sadece Page ID (UUID) veya sayfa URL'si girin ve entegrasyonu o sayfaya davet edin."
    );
  }

  const opts =
    typeof normalizeExportOptions === 'function'
      ? normalizeExportOptions(exportOptions)
      : { labelLanguage: exportOptions?.labelLanguage || 'tr', dateStampMode: 'none', exportedAt: new Date().toISOString() };
  const pageTitle =
    typeof withContentDateStamp === 'function'
      ? withContentDateStamp(title || 'AI Chat Export', opts)
      : title || 'AI Chat Export';
  const allBlocks = buildNotionBlocks(messages, opts);
  const firstBatch = allBlocks.slice(0, 100);
  const rest = allBlocks.slice(100);

  const body = {
    parent: { type: 'page_id', page_id: normalizedParentPageId },
    properties: {
      title: {
        title: [{ type: 'text', text: { content: pageTitle } }],
      },
    },
    children: firstBatch,
  };

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Notion API hatasi: ${res.status}`);
  }

  const created = await res.json();
  const pageId = created?.id;
  if (pageId && rest.length) {
    for (let i = 0; i < rest.length; i += 100) {
      await notionAppendChildren(token, pageId, rest.slice(i, i + 100));
    }
  }

  return created;
}

/* ================================================================
   GOOGLE DRIVE
   ================================================================ */

async function googleDriveUpload(token, filename, blob, mimeType) {
  const metadata = {
    name: filename,
    mimeType: mimeType || blob.type || 'application/octet-stream',
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Google Drive hatasi: ${res.status}`);
  }

  return res.json();
}

/* ================================================================
   ONEDRIVE
   ================================================================ */

async function oneDriveUpload(token, filename, blob) {
  const safeName = (filename || 'chat_export.pdf').replace(/[<>:"/\\|?*]/g, '_');

  if (blob.size <= 4 * 1024 * 1024) {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(safeName)}:/content`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': blob.type || 'application/octet-stream',
        },
        body: blob,
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `OneDrive hatasi: ${res.status}`);
    }
    return res.json();
  }

  const sessionRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(safeName)}:/createUploadSession`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ item: { name: safeName } }),
    }
  );

  if (!sessionRes.ok) {
    throw new Error(`OneDrive upload session olusturulamadi: ${sessionRes.status}`);
  }

  const { uploadUrl } = await sessionRes.json();
  const chunkSize = 5 * 1024 * 1024;
  const totalSize = blob.size;

  for (let offset = 0; offset < totalSize; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, totalSize);
    const chunk = blob.slice(offset, end);
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': `${end - offset}`,
        'Content-Range': `bytes ${offset}-${end - 1}/${totalSize}`,
      },
      body: chunk,
    });

    if (!res.ok && res.status !== 202) {
      throw new Error(`OneDrive chunk upload hatasi: ${res.status}`);
    }
  }

  return { name: safeName };
}

/* ================================================================
   CLOUD STATUS HELPERS
   ================================================================ */

async function getCloudTokens() {
  const data = await chrome.storage.local.get({
    notionToken: '',
    notionWorkspaceName: '',
    notionParentPageId: '',
    gdriveConnected: false,
    onedriveToken: '',
    onedriveRefreshToken: '',
    onedriveExpiry: 0,
    onedriveUserName: '',
  });
  return data;
}

async function clearCloudToken(provider) {
  if (provider === 'notion') {
    await chrome.storage.local.remove(['notionToken', 'notionWorkspaceName', 'notionParentPageId']);
  } else if (provider === 'gdrive') {
    await chrome.storage.local.remove(['gdriveConnected']);
    try { await chrome.identity.clearAllCachedAuthTokens(); } catch (_) {}
  } else if (provider === 'onedrive') {
    await chrome.storage.local.remove(['onedriveToken', 'onedriveRefreshToken', 'onedriveExpiry', 'onedriveUserName']);
  }
}

async function isCloudConnected(provider) {
  const tokens = await getCloudTokens();
  if (provider === 'notion') return !!tokens.notionToken;
  if (provider === 'gdrive') return !!tokens.gdriveConnected;
  if (provider === 'onedrive') return !!tokens.onedriveToken && tokens.onedriveExpiry > Date.now();
  return false;
}
