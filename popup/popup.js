const SITES = {
  'chat.openai.com': { name: 'ChatGPT', id: 'chatgpt' },
  'chatgpt.com': { name: 'ChatGPT', id: 'chatgpt' },
};

const FORMATS = {
  pdf: { ext: 'pdf', label: 'PDF' },
  markdown: { ext: 'md', label: 'Markdown' },
  word: { ext: 'doc', label: 'Word' },
  html: { ext: 'html', label: 'HTML' },
  txt: { ext: 'txt', label: 'Plain Text' },
};

const DEFAULT_SETTINGS = ExportSettings.defaults;

const I18N = {
  tr: {
    unsupportedHint: 'Lütfen bir ChatGPT sohbeti açın.',
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
    unsupportedHint: 'Please open a ChatGPT conversation.',
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
    currentSettings = await ExportSettings.load();
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
    if (el && typeof text === 'string') {
      const target = id === 'syntaxHighlightLabel' ? el.querySelector('span') : el;
      if (target) target.textContent = text;
    }
  });

  const en = language === 'en';
  document.getElementById('independenceNotice').textContent = en
    ? 'Independent extension; not affiliated with or endorsed by OpenAI.'
    : 'Bağımsız uzantı; OpenAI ile bağlantılı değildir ve OpenAI tarafından desteklenmez.';
  const optionLabels = {
    scopeSelect: en ? ['Current conversation','Selected conversations','Loaded conversation links'] : ['Aktif sohbet','Seçili sohbetler','Yüklenmiş sohbet bağlantıları'],
    messageFilterSelect: en ? ['All messages','User only','Assistant only'] : ['Tüm mesajlar','Yalnızca kullanıcı','Yalnızca asistan'],
    labelLanguageSelect: ['Türkçe (Kullanıcı/Asistan)','English (User/Assistant)'],
    dateStampModeSelect: en ? ['None','Filename','Content','Both'] : ['Yok','Dosya adı','İçerik','Her ikisi'],
  };
  Object.entries(optionLabels).forEach(([id, labels]) => Array.from(document.getElementById(id)?.options || []).forEach((option, i) => { option.textContent = labels[i]; }));
  document.getElementById('openSettingsBtn').title = dict.settingsBtn;
  document.querySelector('#unsupported .message').textContent = en ? 'This page is not supported.' : 'Bu sayfa desteklenmiyor.';
  document.querySelector('#detecting p').textContent = en ? 'Checking the current tab…' : 'Aktif sekme kontrol ediliyor…';
  document.querySelector('#exporting .hint').textContent = en ? 'Choose a save location in the download dialog.' : 'İndirme penceresinde kayıt konumunu seçin.';
  document.getElementById('dateStartInput').setAttribute('aria-label', en ? 'Start date' : 'Başlangıç tarihi');
  document.getElementById('dateEndInput').setAttribute('aria-label', en ? 'End date' : 'Bitiş tarihi');

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
    return siteId === 'chatgpt' && !!SITES[u.hostname] && /\/(c|share)\/[^/]+/.test(p);
  } catch (_) {
    return false;
  }
}

async function generatePdf(data, appName, exportOptions) {
  return generateVerifiedPdf(data, appName, exportOptions);
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
    const r1 = await Ext.runtime.sendMessage({ action: 'DOWNLOAD_FILE', dataUrl, filename });
    if (r1?.ok) return;
  }

  const ext = (filename || '').split('.').pop() || 'txt';
  const fallback = `chat_export_${Date.now()}.${ext}`;
  const r2 = await Ext.runtime.sendMessage({ action: 'DOWNLOAD_FILE', dataUrl, filename: fallback });
  if (r2?.ok) return;

  const r3 = await Ext.runtime.sendMessage({ action: 'DOWNLOAD_FILE', dataUrl });
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
    await Ext.scripting.executeScript({
      target: { tabId },
      files: ['shared/browser-api.js', 'lib/dompurify.min.js', 'content/history-loader.js', 'content/content.js'],
    });
  } catch (_) {}
}


function hasRenderableMessageContent(msg) {
  if (!msg || msg.role === 'meta') return false;
  const html = String(msg.html || '');
  if (!html.trim()) return false;

  const div = document.createElement('div');
  div.replaceChildren(DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true, FORCE_BODY: true, ADD_TAGS: ['style'] }));
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

      const response = await Ext.tabs.sendMessage(tabId, {
        action: 'EXTRACT_CHAT',
        siteId,
      });
      if (response?.code === 'HISTORY_INCOMPLETE') throw Object.assign(new Error(response.error), { code: response.code });
      const currentFromExtractor = normalizeChatUrlForCompare(response?.data?.currentUrl || '');
      const urlMatched = !expected || (currentFromExtractor && currentFromExtractor === expected);
      const contentReady = !response?.error && response?.data?.messages?.length && hasRenderableChatData(response.data);
      const userPromptReady = hasUserPrompt(response?.data);
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
      if (err?.code === 'HISTORY_INCOMPLETE') throw err;
      lastError = err?.message || lastError;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error(lastError);
}

async function getChatLinks(tabId, siteId) {

  const response = await Ext.tabs.sendMessage(tabId, {
    action: 'EXTRACT_CHAT_LINKS',
    siteId,
  });
  if (response?.error) throw new Error(response.error);
  return uniqueUrls(response?.links || []);
}

async function waitForTabComplete(tabId, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = await Ext.tabs.get(tabId);
    if (t?.status === 'complete') return t;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Sayfa yuklenmesi zaman asimina ugradi.');
}

async function waitForTabUrl(tabId, expectedUrl, timeoutMs = 20000) {
  const expected = normalizeChatUrlForCompare(expectedUrl);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = await Ext.tabs.get(tabId);
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
    console.warn('[Chat Export for ChatGPT] Tarih araligi filtresi atlanacak: mesajlarda tarih bilgisi yok.');
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
    console.warn('[Chat Export for ChatGPT] Secilen tarih araliginda mesaj bulunamadi, tum mesajlar kullanilacak.');
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

      await Ext.tabs.update(tab.id, { url });
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
      await Ext.tabs.update(tab.id, { url: originalUrl });
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

  batchList.replaceChildren(DOMPurify.sanitize('<p class="batch-loading">Sohbet listesi yukleniyor...</p>', { RETURN_DOM_FRAGMENT: true, FORCE_BODY: true, ADD_TAGS: ['style'] }));

  try {
    await ensureContentScript(tabId);
    const response = await Ext.tabs.sendMessage(tabId, {
      action: 'GET_CONVERSATION_LIST',
      siteId,
    });
    batchConversationItems = response?.items || [];
  } catch (_) {
    batchConversationItems = [];
  }

  if (!batchConversationItems.length) {
    try {
      const tab = await Ext.tabs.get(tabId);
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
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) console.warn('[Chat Export for ChatGPT BATCH] loadBatchList getChatLinks error', e);
      batchConversationItems = [];
    }
  }

  if (!batchConversationItems.length) {
    batchList.replaceChildren(DOMPurify.sanitize('<p class="batch-loading">Sohbet bulunamadi.</p>', { RETURN_DOM_FRAGMENT: true, FORCE_BODY: true, ADD_TAGS: ['style'] }));
    if (batchCount) batchCount.textContent = '0 secili';
    return;
  }

  batchList.replaceChildren(DOMPurify.sanitize('', { RETURN_DOM_FRAGMENT: true, FORCE_BODY: true, ADD_TAGS: ['style'] }));
  batchConversationItems.forEach((item, idx) => {
    const row = document.createElement('label');
    row.className = 'batch-item';
    row.replaceChildren(DOMPurify.sanitize(`<input type="checkbox" data-batch-idx="${idx}" checked>
      <span class="batch-item-title">${escapeHtml(item.title || `Sohbet ${idx + 1}`)}</span>`, { RETURN_DOM_FRAGMENT: true }));
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
        await Ext.tabs.update(tab.id, { url: item.href });
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
        const response = await Ext.tabs.sendMessage(tab.id, {
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
   POPUP INITIALIZATION
   ================================================================ */

async function init() {
  try {
    await loadSettings();
    applyTheme(currentSettings.theme);
    applyLanguage(currentSettings.language);
    setupTabs();

    const settingsBtn = document.getElementById('openSettingsBtn');
    if (settingsBtn) {
      settingsBtn.onclick = () => {
        Ext.runtime.openOptionsPage();
      };
    }

    const { exportInProgress } = await Ext.storage.local.get('exportInProgress');
    if (exportInProgress) {
      showState('exporting');
      const exportingTextEl = document.getElementById('exportingText');
      if (exportingTextEl) exportingTextEl.textContent = 'Şu an arka planda çalışıyor...';
      const exportingHint = states.exporting?.querySelector('.hint');
      if (exportingHint) exportingHint.textContent = 'Tamamlandığında önizleme penceresi açılacak.';
      Ext.storage.onChanged.addListener(function onExportDone(changes, areaName) {
        if (areaName !== 'local' || !changes.exportInProgress) return;
        if (changes.exportInProgress.oldValue === true && !changes.exportInProgress.newValue) {
          Ext.storage.onChanged.removeListener(onExportDone);
          if (states.success) {
            states.success.querySelector('.message').textContent = 'Export tamamlandı. Önizleme penceresi açıldı.';
            showState('success');
          }
          setTimeout(init, 2000);
        }
      });
      return;
    }

    const [tab] = await Ext.tabs.query({ active: true, currentWindow: true });
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


    showState('confirm');

    exportBtn.onclick = async () => {
      const format = formatSelect.value;
      const scope = document.getElementById('scopeSelect').value;
      const target = 'local';
      const exportingText = document.getElementById('exportingText');
      const exportOptions = getCurrentExportOptions();

      if (target === 'local') {
        showState('exporting');
        exportingText.textContent = 'Export arka planda baslatiliyor...';
        try {
          let selectedBatchItems = [];
          if (scope === 'selected') {
            const indices = getSelectedBatchIndices();
            selectedBatchItems = indices.map((idx) => batchConversationItems[idx]).filter(Boolean);
          }
          const response = await Ext.runtime.sendMessage({
            action: 'RUN_FULL_EXPORT',
            tabId: tab.id,
            siteInfo,
            format,
            scope,
            exportOptions,
            selectedBatchItems,
            target,
          });
          if (response?.ok) {
            if (states.success) {
              states.success.querySelector('.message').textContent = 'Export arka planda baslatildi. Onizleme penceresi acilacak.';
              showState('success');
            }
            setTimeout(() => window.close(), 1500);
          } else {
            showError(response?.error || 'Export baslatilamadi.');
          }
        } catch (err) {
          showError(err?.message || 'Bir hata olustu. Sayfayi yenileyip tekrar deneyin.');
        }
        return;
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
