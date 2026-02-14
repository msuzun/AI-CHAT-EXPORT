const SITES = {
  'chat.openai.com': { name: 'ChatGPT', id: 'chatgpt' },
  'chatgpt.com': { name: 'ChatGPT', id: 'chatgpt' },
  'gemini.google.com': { name: 'Gemini', id: 'gemini' },
  'chat.deepseek.com': { name: 'DeepSeek', id: 'deepseek' },
  'platform.deepseek.com': { name: 'DeepSeek', id: 'deepseek' },
  'claude.ai': { name: 'Claude', id: 'claude' },
};

const FORMATS = {
  pdf: { ext: 'pdf', label: 'PDF' },
  markdown: { ext: 'md', label: 'Markdown' },
  word: { ext: 'doc', label: 'Word' },
  html: { ext: 'html', label: 'HTML' },
  txt: { ext: 'txt', label: 'Plain Text' },
};

const DEFAULT_SETTINGS = {
  defaultFormat: 'pdf',
  defaultClipboardFormat: 'markdown',
  defaultMessageFilter: 'all',
  defaultLabelLanguage: 'tr',
  defaultDateStampMode: 'none',
  defaultSyntaxHighlight: true,
  language: 'tr',
  theme: 'system',
};

const I18N = {
  tr: {
    unsupportedHint: 'ChatGPT, Gemini, DeepSeek veya Claude chat sayfasinda olmalisiniz.',
    scopeLabel: 'Kapsam:',
    exportTab: 'Export',
    clipboardTab: 'Panoya Kopyala',
    exportFormatLabel: 'Kaydetme bicimi:',
    clipboardFormatLabel: 'Panoya kopyalama bicimi:',
    messageFilterLabel: 'Mesaj filtresi:',
    labelLanguageLabel: 'Etiket dili:',
    dateStampLabel: 'Tarih damgasi:',
    dateRangeLabel: 'Zaman araligi:',
    syntaxHighlightLabel: 'Kod renklendirme (PDF/HTML)',
    exportBtn: 'Aktar',
    copyBtn: 'Panoya Kopyala',
    confirmText: (site) => `${site} icin export kapsamini secin.`,
    settingsBtn: 'Ayarlar',
  },
  en: {
    unsupportedHint: 'You should be on a ChatGPT, Gemini, DeepSeek, or Claude chat page.',
    scopeLabel: 'Scope:',
    exportTab: 'Export',
    clipboardTab: 'Copy to Clipboard',
    exportFormatLabel: 'Save format:',
    clipboardFormatLabel: 'Clipboard format:',
    messageFilterLabel: 'Message filter:',
    labelLanguageLabel: 'Label language:',
    dateStampLabel: 'Date stamp:',
    dateRangeLabel: 'Date range:',
    syntaxHighlightLabel: 'Syntax highlighting (PDF/HTML)',
    exportBtn: 'Export',
    copyBtn: 'Copy',
    confirmText: (site) => `Choose export scope for ${site}.`,
    settingsBtn: 'Settings',
  },
};

const states = {
  detecting: document.getElementById('detecting'),
  unsupported: document.getElementById('unsupported'),
  confirm: document.getElementById('confirm'),
  exporting: document.getElementById('exporting'),
  success: document.getElementById('success'),
  error: document.getElementById('error'),
};

let currentSettings = { ...DEFAULT_SETTINGS };

function showState(name) {
  Object.values(states).forEach((el) => el.classList.remove('visible'));
  if (states[name]) states[name].classList.add('visible');
}

function showError(msg) {
  states.error.querySelector('.message').textContent = msg;
  showState('error');
}

async function loadSettings() {
  try {
    const loaded = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    currentSettings = { ...DEFAULT_SETTINGS, ...loaded };
  } catch (_) {
    currentSettings = { ...DEFAULT_SETTINGS };
  }
}

function applyTheme(theme) {
  const resolved =
    theme === 'system'
      ? window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;

  document.body.classList.toggle('theme-dark', resolved === 'dark');
}

function applyLanguage(language, siteName) {
  const dict = I18N[language] || I18N.tr;
  document.documentElement.lang = language === 'en' ? 'en' : 'tr';

  const map = [
    ['unsupportedHint', dict.unsupportedHint],
    ['scopeLabel', dict.scopeLabel],
    ['exportTabBtn', dict.exportTab],
    ['clipboardTabBtn', dict.clipboardTab],
    ['exportFormatLabel', dict.exportFormatLabel],
    ['clipboardFormatLabel', dict.clipboardFormatLabel],
    ['messageFilterLabel', dict.messageFilterLabel],
    ['labelLanguageLabel', dict.labelLanguageLabel],
    ['dateStampLabel', dict.dateStampLabel],
    ['dateRangeLabel', dict.dateRangeLabel],
    ['syntaxHighlightLabel', dict.syntaxHighlightLabel],
    ['exportBtn', dict.exportBtn],
    ['copyBtn', dict.copyBtn],
    ['openSettingsBtn', dict.settingsBtn],
  ];

  map.forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el && typeof text === 'string') el.textContent = text;
  });

  if (siteName) {
    const confirmText = document.getElementById('confirmText');
    if (confirmText) confirmText.textContent = dict.confirmText(siteName);
  }
}

function setupTabs() {
  const exportTabBtn = document.getElementById('exportTabBtn');
  const clipboardTabBtn = document.getElementById('clipboardTabBtn');
  const exportPanel = document.getElementById('exportPanel');
  const clipboardPanel = document.getElementById('clipboardPanel');

  if (!exportTabBtn || !clipboardTabBtn || !exportPanel || !clipboardPanel) return;

  function activate(which) {
    const exportActive = which === 'export';
    exportTabBtn.classList.toggle('active', exportActive);
    clipboardTabBtn.classList.toggle('active', !exportActive);
    exportPanel.classList.toggle('visible', exportActive);
    clipboardPanel.classList.toggle('visible', !exportActive);
  }

  exportTabBtn.onclick = () => activate('export');
  clipboardTabBtn.onclick = () => activate('clipboard');
  activate('export');
}

function safeFilename(name) {
  let out = String(name || '').trim();
  if (!out) return 'chat_export';
  const trMap = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' };
  out = out.replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => trMap[c] || c);
  out = out
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_. ]+|[_. ]+$/g, '');

  if (!out || out.length < 2) out = 'chat_export';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(out)) out = `export_${out}`;
  return out.slice(0, 80);
}

function formatDateStampForFilename(iso) {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hh}-${mi}`;
}

function buildExportBaseName(title, exportOptions) {
  const base = safeFilename(title);
  const mode = exportOptions?.dateStampMode || 'none';
  if (mode !== 'filename' && mode !== 'both') return base;
  const stamp = formatDateStampForFilename(exportOptions?.exportedAt);
  return stamp ? `${base}_${stamp}` : base;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text || '');
  return div.innerHTML;
}

function uniqueUrls(urls) {
  const out = [];
  const seen = new Set();
  for (const raw of urls || []) {
    try {
      const normalized = new URL(raw).href;
      if (!seen.has(normalized)) {
        seen.add(normalized);
        out.push(normalized);
      }
    } catch (_) {}
  }
  return out;
}

function normalizeChatUrlForCompare(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    u.search = '';
    return u.href;
  } catch (_) {
    return String(rawUrl || '').trim();
  }
}

function isLikelyChatUrl(siteId, rawUrl) {
  try {
    const u = new URL(rawUrl);
    const p = u.pathname || '/';
    if (siteId === 'chatgpt') return /^\/c\/[^/]+/.test(p);
    if (siteId === 'gemini') return p.startsWith('/app/');
    if (siteId === 'deepseek') return p.includes('/chat/') || /^\/c\/[^/]+/.test(p);
    if (siteId === 'claude') return p.includes('/chat/');
    return p.includes('/chat/') || p.includes('/c/') || p.includes('/app/');
  } catch (_) {
    return false;
  }
}

async function generatePdf(data, appName, exportOptions) {
  const container = document.getElementById('pdfContainer');
  if (!container) throw new Error('PDF konteyneri bulunamadi.');
  const html = buildPdfHtml(data, appName, exportOptions);
  container.innerHTML = html;

  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 250));

  const wrapper = container.querySelector('.pdf-wrapper');
  const target = wrapper || container;
  const clone = target.cloneNode(true);
  clone.id = '';
  clone.style.cssText =
    'position:fixed;left:0;top:0;width:794px;min-height:1122px;background:#fff;color:#1e293b;opacity:1;z-index:2147483647;pointer-events:none;visibility:visible;';
  document.body.appendChild(clone);

  const opt = {
    margin: [12, 10, 18, 10],
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'], avoid: ['.msg-block', '.msg-content pre', '.msg-content table', '.msg-content blockquote'] },
  };

  try {
    return await html2pdf().set(opt).from(clone).outputPdf('blob');
  } finally {
    if (clone.parentNode) clone.parentNode.removeChild(clone);
  }
}

async function downloadFile(blob, filename) {
  // Yöntem 1: Blob URL + <a download>
  try {
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || 'chat_export';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
    return;
  } catch (_) {}

  // Yöntem 2: Background script üzerinden (fallback)
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  if (filename) {
    const r1 = await chrome.runtime.sendMessage({ action: 'DOWNLOAD_FILE', dataUrl, filename });
    if (r1?.ok) return;
  }

  const ext = (filename || '').split('.').pop() || 'txt';
  const fallback = `chat_export_${Date.now()}.${ext}`;
  const r2 = await chrome.runtime.sendMessage({ action: 'DOWNLOAD_FILE', dataUrl, filename: fallback });
  if (r2?.ok) return;

  const r3 = await chrome.runtime.sendMessage({ action: 'DOWNLOAD_FILE', dataUrl });
  if (!r3?.ok) throw new Error(r3?.error || 'Indirme baslatilamadi');
}

async function exportToFormat(format, data, appName, exportOptions) {
  const baseName = buildExportBaseName(data.title, exportOptions);
  switch (format) {
    case 'pdf': {
      if (typeof html2pdf === 'undefined') throw new Error('PDF kutuphanesi yuklenemedi.');
      const blob = await generatePdf(data, appName, exportOptions);
      return downloadFile(blob, `${baseName}.pdf`);
    }
    case 'markdown': {
      const blob = exportMarkdown(data, appName, exportOptions);
      return downloadFile(blob, `${baseName}.md`);
    }
    case 'word': {
      const blob = exportWord(data, appName, exportOptions);
      return downloadFile(blob, `${baseName}.doc`);
    }
    case 'html': {
      const blob = exportHtml(data, appName, exportOptions);
      return downloadFile(blob, `${baseName}.html`);
    }
    case 'txt': {
      const blob = exportPlainText(data, appName, exportOptions);
      return downloadFile(blob, `${baseName}.txt`);
    }
    default:
      throw new Error('Desteklenmeyen format.');
  }
}

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content.js'],
    });
  } catch (_) {}
}

function hasRenderableMessageContent(msg) {
  if (!msg || msg.role === 'meta') return false;
  const html = String(msg.html || '');
  if (!html.trim()) return false;

  const div = document.createElement('div');
  div.innerHTML = html;
  const plain = (div.textContent || '').replace(/\s+/g, ' ').trim();
  const roleOnly = /^(kullanici|asistan|assistant|user|you|chatgpt)$/i.test(plain);
  if (plain && !roleOnly) return true;
  if (div.querySelector('img, picture, video, canvas, math, table, pre, code, ul, ol, li, blockquote')) return true;
  return false;
}

function hasRenderableChatData(data) {
  const messages = Array.isArray(data?.messages) ? data.messages : [];
  return messages.some((m) => hasRenderableMessageContent(m));
}

function hasUserPrompt(data) {
  const messages = Array.isArray(data?.messages) ? data.messages : [];
  return messages.some((m) => m?.role === 'user' && hasRenderableMessageContent(m));
}

async function extractCurrentChat(tabId, siteId, expectedUrl = '') {
  let lastError = 'Bu sayfada chat icerigi bulunamadi.';
  const expected = expectedUrl ? normalizeChatUrlForCompare(expectedUrl) : '';
  for (let i = 0; i < 16; i++) {
    try {
      await ensureContentScript(tabId);
      const response = await chrome.tabs.sendMessage(tabId, {
        action: 'EXTRACT_CHAT',
        siteId,
      });
      const currentFromExtractor = normalizeChatUrlForCompare(response?.data?.currentUrl || '');
      const urlMatched = !expected || (currentFromExtractor && currentFromExtractor === expected);
      const contentReady = !response?.error && response?.data?.messages?.length && hasRenderableChatData(response.data);
      const userPromptReady = siteId === 'deepseek' || hasUserPrompt(response?.data);
      if (!urlMatched) {
        lastError = 'Sohbet URL henuz degismedi, tekrar deneniyor.';
      } else if (!contentReady) {
        lastError = response?.error || 'Sohbet icerigi henuz yuklenmedi, tekrar deneniyor.';
      } else if (!userPromptReady) {
        lastError = 'Kullanici promptu henuz yuklenmedi, tekrar deneniyor.';
      } else {
        return response.data;
      }
    } catch (err) {
      lastError = err?.message || lastError;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error(lastError);
}

async function getChatLinks(tabId, siteId) {
  const response = await chrome.tabs.sendMessage(tabId, {
    action: 'EXTRACT_CHAT_LINKS',
    siteId,
  });
  if (response?.error) throw new Error(response.error);
  return uniqueUrls(response?.links || []);
}

async function waitForTabComplete(tabId, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = await chrome.tabs.get(tabId);
    if (t?.status === 'complete') return t;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Sayfa yuklenmesi zaman asimina ugradi.');
}

async function waitForTabUrl(tabId, expectedUrl, timeoutMs = 20000) {
  const expected = normalizeChatUrlForCompare(expectedUrl);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = await chrome.tabs.get(tabId);
    const current = normalizeChatUrlForCompare(t?.url || '');
    if (current && current === expected) return t;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Hedef sohbet URL yuklenemedi.');
}

function mergeChatsForExport(chats, appName) {
  const mergedMessages = [];
  chats.forEach((chat, idx) => {
    const title = chat?.title || `Sohbet ${idx + 1}`;
    const sourceUrl = chat?.sourceUrl || '';
    const heading = [
      `<h2 style="margin:0 0 6px 0;">${idx + 1}. ${escapeHtml(title)}</h2>`,
      sourceUrl ? `<p style="margin:0;color:#64748b;font-size:12px;">${escapeHtml(sourceUrl)}</p>` : '',
    ].join('');

    mergedMessages.push({ role: 'meta', html: heading });
    mergedMessages.push(...(chat.messages || []));
  });

  return {
    title: `${appName} Tum Sohbetler (${chats.length})`,
    messages: mergedMessages,
  };
}

function parseDateBoundary(value, isEnd) {
  if (!value) return null;
  const d = new Date(value + (isEnd ? 'T23:59:59.999' : 'T00:00:00.000'));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseMessageTimestamp(msg) {
  if (!msg?.timestamp) return null;
  const d = new Date(msg.timestamp);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function filterDataByDateRange(data, rangeStart, rangeEnd) {
  if (!rangeStart && !rangeEnd) return { ...data };

  const start = parseDateBoundary(rangeStart, false);
  const end = parseDateBoundary(rangeEnd, true);
  if (!start && !end) return { ...data };

  const allMessages = Array.isArray(data?.messages) ? data.messages : [];

  const hasTimestamp = allMessages.some((m) => m.role !== 'meta' && !!parseMessageTimestamp(m));
  if (!hasTimestamp) {
    // Mesajlarda tarih bilgisi yoksa filtreyi atla, export'u engelleme
    console.warn('[AI Chat Export] Tarih araligi filtresi atlanacak: mesajlarda tarih bilgisi yok.');
    return { ...data, _dateRangeSkipped: true };
  }

  const filtered = allMessages.filter((m) => {
    if (m.role === 'meta') return true;
    const ts = parseMessageTimestamp(m);
    if (!ts) return true; // tarihsiz mesajlari dahil et
    if (start && ts < start) return false;
    if (end && ts > end) return false;
    return true;
  });

  const nonMeta = filtered.filter((m) => m.role !== 'meta').length;
  if (!nonMeta) {
    console.warn('[AI Chat Export] Secilen tarih araliginda mesaj bulunamadi, tum mesajlar kullanilacak.');
    return { ...data, _dateRangeSkipped: true };
  }

  return { ...data, messages: filtered };
}

async function collectAllChatsFromLinks(tab, siteInfo, exportingTextEl, progressBaseLabel) {
  const originalUrl = tab.url;

  await ensureContentScript(tab.id);
  let links = await getChatLinks(tab.id, siteInfo.id);
  if (originalUrl) links = uniqueUrls([originalUrl, ...links]);
  links = links.filter((u) => isLikelyChatUrl(siteInfo.id, u));

  if (!links.length) {
    throw new Error('Gecerli sohbet linki bulunamadi. Once sohbet gecmis listesini acin.');
  }

  const chats = [];
  const failed = [];

  for (let i = 0; i < links.length; i++) {
    const url = links[i];
    try {
      exportingTextEl.textContent = `${progressBaseLabel || 'Dosya'} hazirlaniyor... (${i + 1}/${links.length})`;

      await chrome.tabs.update(tab.id, { url });
      await waitForTabComplete(tab.id);
      await waitForTabUrl(tab.id, url);
      await new Promise((r) => setTimeout(r, 1200));

      const data = await extractCurrentChat(tab.id, siteInfo.id, url);
      chats.push({ ...data, sourceUrl: url });
    } catch (err) {
      failed.push({ url, reason: err?.message || 'Bilinmeyen hata' });
    }
  }

  if (originalUrl) {
    try {
      await chrome.tabs.update(tab.id, { url: originalUrl });
    } catch (_) {}
  }

  return { chats, failed, total: links.length };
}

async function resolveDataByScope(tab, siteInfo, scope, progressTextEl, progressLabel, progressBaseLabel) {
  await ensureContentScript(tab.id);

  let data;
  let previewChats = [];
  let infoText = 'Islem basariyla tamamlandi.';

  if (scope === 'all') {
    const result = await collectAllChatsFromLinks(tab, siteInfo, progressTextEl, progressBaseLabel);
    if (!result.chats.length) {
      const detail = result.failed[0]?.reason ? ` Ilk hata: ${result.failed[0].reason}` : '';
      throw new Error(`Hicbir sohbet islenemedi.${detail}`);
    }
    data = mergeChatsForExport(result.chats, siteInfo.name);
    previewChats = result.chats;
    if (result.failed.length > 0) {
      infoText = `${result.chats.length}/${result.total} sohbet islendi.`;
    }
  } else if (scope === 'selected') {
    const selectedIndices = getSelectedBatchIndices();
    if (!selectedIndices.length) throw new Error('Hicbir sohbet secilmedi.');
    const result = await collectSelectedChats(tab, siteInfo, selectedIndices, progressTextEl, progressBaseLabel);
    if (!result.chats.length) {
      const detail = result.failed[0]?.reason ? ` Ilk hata: ${result.failed[0].reason}` : '';
      throw new Error(`Hicbir sohbet islenemedi.${detail}`);
    }
    data = mergeChatsForExport(result.chats, siteInfo.name);
    previewChats = result.chats;
    if (result.failed.length > 0) {
      infoText = `${result.chats.length}/${result.total} sohbet islendi.`;
    }
  } else {
    if (progressTextEl && progressLabel) {
      progressTextEl.textContent = progressLabel;
    }
    data = await extractCurrentChat(tab.id, siteInfo.id);
    previewChats = [data];
  }

  return { data, infoText, previewChats };
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', 'true');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) throw new Error('Panoya kopyalama basarisiz oldu.');
}

function buildClipboardText(format, data, appName, exportOptions) {
  const options = exportOptions || getCurrentExportOptions();
  if (format === 'markdown') return buildMarkdownText(data, appName, options);
  if (format === 'txt') return buildPlainText(data, appName, options);
  throw new Error('Panoya kopyalama icin desteklenmeyen format.');
}

function getCurrentExportOptions() {
  const messageFilterEl = document.getElementById('messageFilterSelect');
  const labelLanguageEl = document.getElementById('labelLanguageSelect');
  const dateStampEl = document.getElementById('dateStampModeSelect');
  const dateStartEl = document.getElementById('dateStartInput');
  const dateEndEl = document.getElementById('dateEndInput');
  const syntaxEl = document.getElementById('syntaxHighlightToggle');

  return {
    messageFilter: messageFilterEl?.value || currentSettings.defaultMessageFilter || 'all',
    labelLanguage: labelLanguageEl?.value || currentSettings.defaultLabelLanguage || 'tr',
    dateStampMode: dateStampEl?.value || currentSettings.defaultDateStampMode || 'none',
    dateRangeStart: dateStartEl?.value || '',
    dateRangeEnd: dateEndEl?.value || '',
    syntaxHighlight: syntaxEl ? syntaxEl.checked : currentSettings.defaultSyntaxHighlight !== false,
    exportedAt: new Date().toISOString(),
  };
}

/* ================================================================
   BATCH SELECT
   ================================================================ */

let batchConversationItems = [];

async function loadBatchList(tabId, siteId) {
  const batchPanel = document.getElementById('batchPanel');
  const batchList = document.getElementById('batchList');
  const batchCount = document.getElementById('batchCount');
  if (!batchPanel || !batchList) return;

  batchList.innerHTML = '<p class="batch-loading">Sohbet listesi yukleniyor...</p>';

  try {
    await ensureContentScript(tabId);
    const response = await chrome.tabs.sendMessage(tabId, {
      action: 'GET_CONVERSATION_LIST',
      siteId,
    });
    batchConversationItems = response?.items || [];
  } catch (_) {
    batchConversationItems = [];
  }

  if (!batchConversationItems.length) {
    try {
      const tab = await chrome.tabs.get(tabId);
      let links = await getChatLinks(tabId, siteId);
      if (tab?.url) links = uniqueUrls([tab.url, ...links]);
      links = links.filter((u) => isLikelyChatUrl(siteId, u));

      batchConversationItems = links.map((href, idx) => {
        let title = `Sohbet ${idx + 1}`;
        try {
          const u = new URL(href);
          const seg = decodeURIComponent((u.pathname.split('/').pop() || '').trim());
          if (seg && seg.length > 3) title = seg.replace(/[-_]+/g, ' ').slice(0, 80);
        } catch (_) {}
        return { title, href };
      });
    } catch (_) {
      batchConversationItems = [];
    }
  }

  if (!batchConversationItems.length) {
    batchList.innerHTML = '<p class="batch-loading">Sohbet bulunamadi.</p>';
    if (batchCount) batchCount.textContent = '0 secili';
    return;
  }

  batchList.innerHTML = '';
  batchConversationItems.forEach((item, idx) => {
    const row = document.createElement('label');
    row.className = 'batch-item';
    row.innerHTML = `<input type="checkbox" data-batch-idx="${idx}" checked>
      <span class="batch-item-title">${escapeHtml(item.title || `Sohbet ${idx + 1}`)}</span>`;
    batchList.appendChild(row);
  });

  updateBatchCount();
}

function getSelectedBatchIndices() {
  const checks = document.querySelectorAll('#batchList input[type="checkbox"]');
  const indices = [];
  checks.forEach((cb) => {
    if (cb.checked) indices.push(parseInt(cb.dataset.batchIdx, 10));
  });
  return indices;
}

function updateBatchCount() {
  const batchCount = document.getElementById('batchCount');
  if (!batchCount) return;
  const selected = getSelectedBatchIndices().length;
  const total = batchConversationItems.length;
  batchCount.textContent = `${selected}/${total} secili`;
}

function setupBatchPanel() {
  const batchList = document.getElementById('batchList');
  const selectAllBtn = document.getElementById('batchSelectAllBtn');

  if (batchList) {
    batchList.addEventListener('change', updateBatchCount);
  }

  if (selectAllBtn) {
    selectAllBtn.onclick = () => {
      const checks = document.querySelectorAll('#batchList input[type="checkbox"]');
      const allChecked = Array.from(checks).every((cb) => cb.checked);
      checks.forEach((cb) => (cb.checked = !allChecked));
      selectAllBtn.textContent = allChecked ? 'Hepsini Sec' : 'Hepsini Kaldir';
      updateBatchCount();
    };
  }
}

async function collectSelectedChats(tab, siteInfo, selectedIndices, progressEl, baseLabel) {
  const chats = [];
  const failed = [];

  await ensureContentScript(tab.id);

  for (let i = 0; i < selectedIndices.length; i++) {
    const idx = selectedIndices[i];
    const item = batchConversationItems[idx];
    if (!item) continue;

    try {
      if (progressEl) {
        progressEl.textContent = `${baseLabel || 'Dosya'} hazirlaniyor... (${i + 1}/${selectedIndices.length})`;
      }

      if (item.href) {
        await chrome.tabs.update(tab.id, { url: item.href });
        await waitForTabComplete(tab.id);
        await waitForTabUrl(tab.id, item.href);
        await new Promise((r) => setTimeout(r, 1200));
        const data = await extractCurrentChat(tab.id, siteInfo.id, item.href);
        chats.push({ ...data, sourceUrl: item.href });
      } else {
        await ensureContentScript(tab.id);
        const prevFp = chats.length > 0
          ? (chats[chats.length - 1].messages || []).map((m) => (m.html || '').slice(0, 80)).join('|')
          : '';
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'EXTRACT_CHAT_AT_INDEX',
          siteId: siteInfo.id,
          index: idx,
          title: item.title || '',
          prevFingerprint: prevFp,
        });
        if (response?.data?.messages?.length) {
          chats.push({ ...response.data, sourceUrl: '' });
        }
      }
    } catch (err) {
      failed.push({ title: item.title, reason: err?.message || 'Hata' });
    }
  }

  return { chats, failed, total: selectedIndices.length };
}

/* ================================================================
   CLOUD EXPORT TARGET
   ================================================================ */

async function updateCloudTargetOptions() {
  const targetSelect = document.getElementById('exportTargetSelect');
  if (!targetSelect) return;

  try {
    const status = await chrome.runtime.sendMessage({ action: 'CLOUD_GET_STATUS' });
    if (!status?.ok) return;

    for (const opt of targetSelect.options) {
      if (opt.value === 'notion') {
        opt.disabled = !status.notion.connected;
        opt.textContent = status.notion.connected
          ? `Notion (${status.notion.label || 'Bagli'})`
          : 'Notion (Baglanmadi)';
      }
      if (opt.value === 'gdrive') {
        opt.disabled = !status.gdrive.connected;
        opt.textContent = status.gdrive.connected
          ? 'Google Drive (Bagli)'
          : 'Google Drive (Baglanmadi)';
      }
      if (opt.value === 'onedrive') {
        opt.disabled = !status.onedrive.connected;
        opt.textContent = status.onedrive.connected
          ? `OneDrive (${status.onedrive.label || 'Bagli'})`
          : 'OneDrive (Baglanmadi)';
      }
    }
  } catch (_) {}
}

async function exportToCloudTarget(target, format, data, appName, exportOptions) {
  if (target === 'local') return null;

  const tokenRes = await chrome.runtime.sendMessage({ action: 'CLOUD_GET_TOKEN', provider: target });
  if (!tokenRes?.ok) throw new Error(tokenRes?.error || `${target} token alinamadi.`);
  const token = tokenRes.token;

  if (target === 'notion') {
    const parentData = await chrome.storage.local.get('notionParentPageId');
    const parentId = parentData.notionParentPageId || '';
    const result = await notionCreatePage(
      token,
      parentId,
      data.title || `${appName} Export`,
      data.messages || [],
      exportOptions
    );
    return { provider: 'Notion', url: result.url || '' };
  }

  const baseName = buildExportBaseName(data.title, exportOptions);
  const ext = FORMATS[format]?.ext || 'txt';
  const filename = `${baseName}.${ext}`;
  let blob;

  switch (format) {
    case 'pdf':
      blob = await generatePdf(data, appName, exportOptions);
      break;
    case 'markdown':
      blob = exportMarkdown(data, appName, exportOptions);
      break;
    case 'word':
      blob = exportWord(data, appName, exportOptions);
      break;
    case 'html':
      blob = exportHtml(data, appName, exportOptions);
      break;
    case 'txt':
      blob = exportPlainText(data, appName, exportOptions);
      break;
    default:
      throw new Error('Desteklenmeyen format.');
  }

  if (target === 'gdrive') {
    const result = await googleDriveUpload(token, filename, blob, blob.type);
    return { provider: 'Google Drive', url: `https://drive.google.com/file/d/${result.id}/view` };
  }

  if (target === 'onedrive') {
    await oneDriveUpload(token, filename, blob);
    return { provider: 'OneDrive', url: '' };
  }

  throw new Error('Bilinmeyen hedef: ' + target);
}

async function openExportPreview(payload) {
  const response = await chrome.runtime.sendMessage({
    action: 'PREVIEW_SET_PAYLOAD',
    payload,
  });
  if (!response?.ok || !response?.token) {
    throw new Error(response?.error || 'Export onizleme acilamadi.');
  }

  await chrome.windows.create({
    url: chrome.runtime.getURL(`popup/preview.html?token=${encodeURIComponent(response.token)}`),
    type: 'popup',
    width: 1200,
    height: 860,
    focused: true,
  });
}

async function init() {
  try {
    await loadSettings();
    applyTheme(currentSettings.theme);
    applyLanguage(currentSettings.language);
    setupTabs();

    const settingsBtn = document.getElementById('openSettingsBtn');
    if (settingsBtn) {
      settingsBtn.onclick = () => {
        chrome.runtime.openOptionsPage();
      };
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      showState('unsupported');
      return;
    }

    let host = '';
    try {
      host = new URL(tab.url).hostname.toLowerCase();
    } catch {
      showState('unsupported');
      return;
    }

    let site = SITES[host];
    if (!site) {
      if (host.includes('deepseek')) site = { name: 'DeepSeek', id: 'deepseek' };
      else site = Object.entries(SITES).find(([h]) => host.endsWith('.' + h))?.[1];
    }
    const siteInfo = site || null;

    if (!siteInfo) {
      showState('unsupported');
      return;
    }

    applyLanguage(currentSettings.language, siteInfo.name);

    const formatSelect = document.getElementById('formatSelect');
    const clipboardFormatSelect = document.getElementById('clipboardFormatSelect');
    const messageFilterSelect = document.getElementById('messageFilterSelect');
    const labelLanguageSelect = document.getElementById('labelLanguageSelect');
    const dateStampModeSelect = document.getElementById('dateStampModeSelect');
    const syntaxHighlightToggle = document.getElementById('syntaxHighlightToggle');
    const exportBtn = document.getElementById('exportBtn');
    const copyBtn = document.getElementById('copyBtn');

    const required = {
      formatSelect,
      clipboardFormatSelect,
      exportBtn,
      copyBtn,
    };
    const missing = Object.entries(required)
      .filter(([, el]) => !el)
      .map(([key]) => key);
    if (missing.length) {
      throw new Error(`Popup UI eksik: ${missing.join(', ')}`);
    }
    if ([...formatSelect.options].some((o) => o.value === currentSettings.defaultFormat)) {
      formatSelect.value = currentSettings.defaultFormat;
    }
    if ([...clipboardFormatSelect.options].some((o) => o.value === currentSettings.defaultClipboardFormat)) {
      clipboardFormatSelect.value = currentSettings.defaultClipboardFormat;
    }
    if (messageFilterSelect && [...messageFilterSelect.options].some((o) => o.value === currentSettings.defaultMessageFilter)) {
      messageFilterSelect.value = currentSettings.defaultMessageFilter;
    }
    if (labelLanguageSelect && [...labelLanguageSelect.options].some((o) => o.value === currentSettings.defaultLabelLanguage)) {
      labelLanguageSelect.value = currentSettings.defaultLabelLanguage;
    }
    if (dateStampModeSelect && [...dateStampModeSelect.options].some((o) => o.value === currentSettings.defaultDateStampMode)) {
      dateStampModeSelect.value = currentSettings.defaultDateStampMode;
    }
    if (syntaxHighlightToggle) {
      syntaxHighlightToggle.checked = currentSettings.defaultSyntaxHighlight !== false;
    }

    // Batch panel: show/hide based on scope
    const scopeSelect = document.getElementById('scopeSelect');
    const batchPanel = document.getElementById('batchPanel');
    setupBatchPanel();

    if (scopeSelect) {
      scopeSelect.addEventListener('change', async () => {
        const isSelected = scopeSelect.value === 'selected';
        if (batchPanel) batchPanel.classList.toggle('visible', isSelected);
        if (isSelected && batchConversationItems.length === 0) {
          await loadBatchList(tab.id, siteInfo.id);
        }
      });
    }

    // Cloud target status
    updateCloudTargetOptions();

    showState('confirm');

    exportBtn.onclick = async () => {
      const format = formatSelect.value;
      const scope = document.getElementById('scopeSelect').value;
      const target = document.getElementById('exportTargetSelect')?.value || 'local';
      const exportingText = document.getElementById('exportingText');
      exportingText.textContent = `${FORMATS[format]?.label || format} olusturuluyor...`;

      showState('exporting');
      try {
        const resolved = await resolveDataByScope(
          tab,
          siteInfo,
          scope,
          exportingText,
          `${FORMATS[format]?.label || format} olusturuluyor...`,
          FORMATS[format]?.label || format
        );

        const exportOptions = getCurrentExportOptions();
        const rangeStart = exportOptions.dateRangeStart;
        const rangeEnd = exportOptions.dateRangeEnd;
        const filteredPreviewChats = (resolved.previewChats || []).map((chat) =>
          filterDataByDateRange(chat, rangeStart, rangeEnd)
        );

        const dateRangeSkipped = filteredPreviewChats.some((c) => c._dateRangeSkipped);
        let infoText = resolved.infoText;
        if (dateRangeSkipped && (rangeStart || rangeEnd)) {
          infoText += ' (Tarih araligi filtresi: mesajlarda tarih bilgisi bulunamadigi icin atlanildi.)';
        }

        const filteredExportData =
          (scope === 'all' || scope === 'selected')
            ? mergeChatsForExport(filteredPreviewChats, siteInfo.name)
            : filteredPreviewChats[0];

        // Cloud export: dogrudan gonder
        if (target !== 'local') {
          exportingText.textContent = `${target} icin yukleniyor...`;
          const cloudResult = await exportToCloudTarget(target, format, filteredExportData, siteInfo.name, exportOptions);
          if (states.success) {
            const urlInfo = cloudResult?.url ? ` URL: ${cloudResult.url}` : '';
            states.success.querySelector('.message').textContent = `${cloudResult?.provider || target} icin export tamamlandi.${urlInfo}`;
            showState('success');
          }
          return;
        }

        // Local export: preview ac
        await openExportPreview({
          format,
          appName: siteInfo.name,
          scope,
          exportData: filteredExportData,
          previewChats: filteredPreviewChats,
          infoText,
          exportOptions,
        });
        window.close();
      } catch (err) {
        showError(err?.message || 'Bir hata olustu. Sayfayi yenileyip tekrar deneyin.');
      }
    };

    copyBtn.onclick = async () => {
      const scope = document.getElementById('scopeSelect').value;
      const clipboardFormat = clipboardFormatSelect.value;
      const exportingText = document.getElementById('exportingText');
      const formatLabel = clipboardFormat === 'markdown' ? 'Markdown' : 'Plain Text';
      exportingText.textContent = `${formatLabel} panoya kopyalaniyor...`;

      showState('exporting');
      try {
        const resolved = await resolveDataByScope(
          tab,
          siteInfo,
          scope,
          exportingText,
          `${formatLabel} panoya kopyalaniyor...`,
          formatLabel
        );

        const exportOptions = getCurrentExportOptions();
        const filteredPreviewChats = (resolved.previewChats || []).map((chat) =>
          filterDataByDateRange(chat, exportOptions.dateRangeStart, exportOptions.dateRangeEnd)
        );
        const dateRangeSkipped = filteredPreviewChats.some((c) => c._dateRangeSkipped);
        const filteredData =
          scope === 'all'
            ? mergeChatsForExport(filteredPreviewChats, siteInfo.name)
            : filteredPreviewChats[0];

        const text = buildClipboardText(clipboardFormat, filteredData, siteInfo.name, exportOptions);
        await copyTextToClipboard(text);

        if (states.success) {
          let extra = scope === 'all' ? ` ${resolved.infoText}` : '';
          if (dateRangeSkipped && (exportOptions.dateRangeStart || exportOptions.dateRangeEnd)) {
            extra += ' (Tarih araligi filtresi atlanildi.)';
          }
          states.success.querySelector('.message').textContent = `Panoya kopyalandi.${extra}`;
          showState('success');
        }
        setTimeout(() => window.close(), 1000);
      } catch (err) {
        showError(err?.message || 'Panoya kopyalama basarisiz oldu.');
      }
    };
  } catch (err) {
    const msg = err?.message ? `Sayfa okunamadi: ${err.message}` : 'Sayfa okunamadi. Lutfen chat sayfasinda oldugunuzdan emin olun.';
    showError(msg);
  }
}

init();
