const SITES = {
  'chat.openai.com': { name: 'ChatGPT', id: 'chatgpt' },
  'chatgpt.com': { name: 'ChatGPT', id: 'chatgpt' },
  'gemini.google.com': { name: 'Gemini', id: 'gemini' },
  'chat.deepseek.com': { name: 'DeepSeek', id: 'deepseek' },
  'platform.deepseek.com': { name: 'DeepSeek', id: 'deepseek' },
  'claude.ai': { name: 'Claude', id: 'claude' },
};

const MENU_ROOT = 'ai_chat_export_root';
const MENU_TO_FORMAT = {
  ai_chat_export_pdf: 'pdf',
  ai_chat_export_markdown: 'markdown',
  ai_chat_export_word: 'word',
  ai_chat_export_html: 'html',
  ai_chat_export_txt: 'txt',
};

const SUPPORTED_PATTERNS = [
  'https://chat.openai.com/*',
  'https://chatgpt.com/*',
  'https://gemini.google.com/*',
  'https://chat.deepseek.com/*',
  'https://platform.deepseek.com/*',
  'https://*.deepseek.com/*',
  'https://claude.ai/*',
];

const PREVIEW_KEY_PREFIX = 'preview_payload_';

function getSiteByUrl(rawUrl) {
  if (!rawUrl) return null;
  let host = '';
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }

  let site = SITES[host];
  if (!site) {
    if (host.includes('deepseek')) site = { name: 'DeepSeek', id: 'deepseek' };
    else site = Object.entries(SITES).find(([h]) => host.endsWith('.' + h))?.[1];
  }
  return site || null;
}

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ROOT,
      title: 'AI Chat Export',
      contexts: ['page'],
      documentUrlPatterns: SUPPORTED_PATTERNS,
    });

    chrome.contextMenus.create({
      id: 'ai_chat_export_pdf',
      parentId: MENU_ROOT,
      title: "PDF'e aktar",
      contexts: ['page'],
      documentUrlPatterns: SUPPORTED_PATTERNS,
    });
    chrome.contextMenus.create({
      id: 'ai_chat_export_markdown',
      parentId: MENU_ROOT,
      title: "Markdown'a aktar",
      contexts: ['page'],
      documentUrlPatterns: SUPPORTED_PATTERNS,
    });
    chrome.contextMenus.create({
      id: 'ai_chat_export_word',
      parentId: MENU_ROOT,
      title: "Word'e aktar",
      contexts: ['page'],
      documentUrlPatterns: SUPPORTED_PATTERNS,
    });
    chrome.contextMenus.create({
      id: 'ai_chat_export_html',
      parentId: MENU_ROOT,
      title: "HTML'e aktar",
      contexts: ['page'],
      documentUrlPatterns: SUPPORTED_PATTERNS,
    });
    chrome.contextMenus.create({
      id: 'ai_chat_export_txt',
      parentId: MENU_ROOT,
      title: "Text'e aktar",
      contexts: ['page'],
      documentUrlPatterns: SUPPORTED_PATTERNS,
    });
  });
}

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content.js'],
    });
  } catch (_) {}
}

async function extractChat(tabId, siteId) {
  await ensureContentScript(tabId);
  const response = await chrome.tabs.sendMessage(tabId, {
    action: 'EXTRACT_CHAT',
    siteId,
  });
  if (response?.error) throw new Error(response.error);
  if (!response?.data?.messages?.length) throw new Error('Bu sayfada chat icerigi bulunamadi.');
  return response.data;
}

async function waitForTabComplete(tabId, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = await chrome.tabs.get(tabId);
    if (t?.status === 'complete') return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Export sayfasi zamaninda yuklenemedi.');
}

async function runExportInRunner(format, data, appName) {
  const runnerTab = await chrome.tabs.create({
    url: chrome.runtime.getURL('popup/context-export.html'),
    active: false,
  });

  try {
    await waitForTabComplete(runnerTab.id);
    const response = await chrome.tabs.sendMessage(runnerTab.id, {
      action: 'RUN_CONTEXT_EXPORT',
      format,
      data,
      appName,
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Sag tik export basarisiz oldu.');
    }
  } finally {
    try {
      await chrome.tabs.remove(runnerTab.id);
    } catch (_) {}
  }
}

chrome.runtime.onInstalled.addListener(() => {
  createContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenus();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const format = MENU_TO_FORMAT[info.menuItemId];
  if (!format) return;
  if (!tab?.id || !tab?.url) return;

  const siteInfo = getSiteByUrl(tab.url);
  if (!siteInfo) return;

  try {
    const data = await extractChat(tab.id, siteInfo.id);
    await runExportInRunner(format, data, siteInfo.name);
  } catch (err) {
    console.error('Context export failed:', err?.message || err);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'PREVIEW_SET_PAYLOAD') {
    const token = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    chrome.storage.local
      .set({ [PREVIEW_KEY_PREFIX + token]: msg.payload || null })
      .then(() => sendResponse({ ok: true, token }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Preview payload saklanamadi.' }));
    return true;
  }

  if (msg.action === 'PREVIEW_GET_PAYLOAD') {
    const key = PREVIEW_KEY_PREFIX + msg.token;
    chrome.storage.local
      .get(key)
      .then((obj) => {
        const payload = obj?.[key];
        if (!payload) {
          sendResponse({ ok: false, error: 'Preview verisi bulunamadi.' });
          return;
        }
        sendResponse({ ok: true, payload });
      })
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Preview verisi okunamadi.' }));
    return true;
  }

  if (msg.action === 'PREVIEW_CLEAR_PAYLOAD') {
    chrome.storage.local
      .remove(PREVIEW_KEY_PREFIX + msg.token)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Preview verisi silinemedi.' }));
    return true;
  }

  if (msg.action === 'DOWNLOAD_FILE' || msg.action === 'DOWNLOAD_PDF') {
    chrome.downloads
      .download({
        url: msg.dataUrl,
        filename: msg.filename,
        saveAs: true,
      })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message }));
    return true;
  }
});
