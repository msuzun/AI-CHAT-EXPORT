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
  return (name || 'chat').replace(/[<>:"/\\|?*]/g, '_').slice(0, 100);
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

async function generatePdf(data, appName) {
  const container = document.getElementById('pdfContainer');
  const html = buildPdfHtml(data, appName);
  container.innerHTML = html;

  await new Promise((r) => setTimeout(r, 150));

  const opt = {
    margin: [12, 10, 18, 10],
    filename: `${safeFilename(data.title)}.pdf`,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'], avoid: ['.msg-block'] },
  };

  const target = container.querySelector('.pdf-wrapper') || container;
  return html2pdf().set(opt).from(target).outputPdf('blob');
}

async function downloadFile(blob, filename) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const response = await chrome.runtime.sendMessage({
    action: 'DOWNLOAD_FILE',
    dataUrl,
    filename,
  });
  if (!response?.ok) throw new Error(response?.error || 'Indirme baslatilamadi');
}

async function exportToFormat(format, data, appName) {
  const baseName = safeFilename(data.title);
  switch (format) {
    case 'pdf': {
      if (typeof html2pdf === 'undefined') throw new Error('PDF kutuphanesi yuklenemedi.');
      const blob = await generatePdf(data, appName);
      return downloadFile(blob, `${baseName}.pdf`);
    }
    case 'markdown': {
      const blob = exportMarkdown(data, appName);
      return downloadFile(blob, `${baseName}.md`);
    }
    case 'word': {
      const blob = exportWord(data, appName);
      return downloadFile(blob, `${baseName}.doc`);
    }
    case 'html': {
      const blob = exportHtml(data, appName);
      return downloadFile(blob, `${baseName}.html`);
    }
    case 'txt': {
      const blob = exportPlainText(data, appName);
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

async function extractCurrentChat(tabId, siteId) {
  let lastError = 'Bu sayfada chat icerigi bulunamadi.';
  for (let i = 0; i < 8; i++) {
    try {
      await ensureContentScript(tabId);
      const response = await chrome.tabs.sendMessage(tabId, {
        action: 'EXTRACT_CHAT',
        siteId,
      });
      if (!response?.error && response?.data?.messages?.length) {
        return response.data;
      }
      lastError = response?.error || lastError;
    } catch (err) {
      lastError = err?.message || lastError;
    }
    await new Promise((r) => setTimeout(r, 700));
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

function mergeChatsForExport(chats, appName) {
  const mergedMessages = [];
  chats.forEach((chat, idx) => {
    const title = chat?.title || `Sohbet ${idx + 1}`;
    const sourceUrl = chat?.sourceUrl || '';
    const heading = [
      `<h2 style="margin:0 0 6px 0;">${idx + 1}. ${escapeHtml(title)}</h2>`,
      sourceUrl ? `<p style="margin:0;color:#64748b;font-size:12px;">${escapeHtml(sourceUrl)}</p>` : '',
    ].join('');

    mergedMessages.push({ role: 'assistant', html: heading });
    mergedMessages.push(...(chat.messages || []));
  });

  return {
    title: `${appName} Tum Sohbetler (${chats.length})`,
    messages: mergedMessages,
  };
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
      await new Promise((r) => setTimeout(r, 900));

      const data = await extractCurrentChat(tab.id, siteInfo.id);
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

function buildClipboardText(format, data, appName) {
  if (format === 'markdown') return buildMarkdownText(data, appName);
  if (format === 'txt') return buildPlainText(data, appName);
  throw new Error('Panoya kopyalama icin desteklenmeyen format.');
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

    document.getElementById('openSettingsBtn').onclick = () => {
      chrome.runtime.openOptionsPage();
    };

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
    if ([...formatSelect.options].some((o) => o.value === currentSettings.defaultFormat)) {
      formatSelect.value = currentSettings.defaultFormat;
    }
    if ([...clipboardFormatSelect.options].some((o) => o.value === currentSettings.defaultClipboardFormat)) {
      clipboardFormatSelect.value = currentSettings.defaultClipboardFormat;
    }

    showState('confirm');

    document.getElementById('exportBtn').onclick = async () => {
      const format = formatSelect.value;
      const scope = document.getElementById('scopeSelect').value;
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

        await openExportPreview({
          format,
          appName: siteInfo.name,
          scope,
          exportData: resolved.data,
          previewChats: resolved.previewChats,
          infoText: resolved.infoText,
        });
        window.close();
      } catch (err) {
        showError(err?.message || 'Bir hata olustu. Sayfayi yenileyip tekrar deneyin.');
      }
    };

    document.getElementById('copyBtn').onclick = async () => {
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

        const text = buildClipboardText(clipboardFormat, resolved.data, siteInfo.name);
        await copyTextToClipboard(text);

        if (states.success) {
          const extra = scope === 'all' ? ` ${resolved.infoText}` : '';
          states.success.querySelector('.message').textContent = `Panoya kopyalandi.${extra}`;
          showState('success');
        }
        setTimeout(() => window.close(), 1000);
      } catch (err) {
        showError(err?.message || 'Panoya kopyalama basarisiz oldu.');
      }
    };
  } catch (_) {
    showError('Sayfa okunamadi. Lutfen chat sayfasinda oldugunuzdan emin olun.');
  }
}

init();
