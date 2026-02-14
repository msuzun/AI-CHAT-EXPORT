import { PlatformManager } from './platforms/platformManager.js';

const SUPPORTED_PATTERNS = PlatformManager.getAllPatterns();

const MENU_ROOT = 'ai_chat_export_root';
const MENU_TO_FORMAT = {
  ai_chat_export_pdf: 'pdf',
  ai_chat_export_markdown: 'markdown',
  ai_chat_export_word: 'word',
  ai_chat_export_html: 'html',
  ai_chat_export_txt: 'txt',
};


const PREVIEW_KEY_PREFIX = 'preview_payload_';
const BUILD_TAG = '2026-02-12-cloud-batch';
console.info('[AI Chat Export] background loaded:', BUILD_TAG);

/* ================================================================
   OAUTH HANDLERS
   ================================================================ */

const ONEDRIVE_CLIENT_ID = '';

function getRedirectUrl() {
  return `https://${chrome.runtime.id}.chromiumapp.org/`;
}

async function notionConnect(secret) {
  if (!secret) throw new Error('Notion Integration Secret girilmedi.');

  // Secret'i dogrula: basit bir API cagrisi yap
  const res = await fetch('https://api.notion.com/v1/users/me', {
    headers: {
      Authorization: `Bearer ${secret}`,
      'Notion-Version': '2022-06-28',
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Notion secret gecersiz (HTTP ${res.status}). Dogru secret girdiginizden emin olun.`);
  }

  const user = await res.json();
  const name = user.name || user.bot?.owner?.user?.name || 'Notion';

  await chrome.storage.local.set({
    notionToken: secret,
    notionWorkspaceName: name,
  });

  return { ok: true, workspaceName: name };
}

async function googleDriveOAuthConnect() {
  const token = await chrome.identity.getAuthToken({ interactive: true });
  if (!token?.token) throw new Error('Google Drive yetkilendirmesi basarisiz.');
  await chrome.storage.local.set({ gdriveConnected: true });
  return { ok: true };
}

async function googleDriveGetToken() {
  const token = await chrome.identity.getAuthToken({ interactive: false });
  if (!token?.token) throw new Error('Google Drive token alinamadi. Yeniden baglanti gerekebilir.');
  return token.token;
}

async function oneDriveOAuthConnect() {
  const clientId = (await chrome.storage.local.get('onedriveClientId')).onedriveClientId || ONEDRIVE_CLIENT_ID;
  if (!clientId) throw new Error('OneDrive Client ID ayarlanmamis. Ayarlar sayfasindan girin.');

  const redirectUri = getRedirectUrl();
  const scope = 'Files.ReadWrite User.Read offline_access';
  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_mode=query`;

  const resultUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
  const code = new URL(resultUrl).searchParams.get('code');
  if (!code) throw new Error('OneDrive yetkilendirme kodu alinamadi.');

  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      scope,
    }),
  });

  if (!tokenRes.ok) throw new Error('OneDrive token alinamadi.');
  const td = await tokenRes.json();

  let userName = '';
  try {
    const me = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${td.access_token}` },
    });
    if (me.ok) {
      const u = await me.json();
      userName = u.displayName || u.mail || '';
    }
  } catch (_) {}

  await chrome.storage.local.set({
    onedriveToken: td.access_token,
    onedriveRefreshToken: td.refresh_token || '',
    onedriveExpiry: Date.now() + (td.expires_in || 3600) * 1000,
    onedriveUserName: userName,
  });

  return { ok: true, userName };
}

async function oneDriveRefreshToken() {
  const data = await chrome.storage.local.get(['onedriveRefreshToken', 'onedriveClientId']);
  const clientId = data.onedriveClientId || ONEDRIVE_CLIENT_ID;
  const refreshToken = data.onedriveRefreshToken;
  if (!refreshToken || !clientId) throw new Error('OneDrive yeniden baglanti gerekli.');

  const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'Files.ReadWrite User.Read offline_access',
    }),
  });

  if (!tokenRes.ok) throw new Error('OneDrive token yenilenemedi. Yeniden baglanti gerekli.');
  const td = await tokenRes.json();

  await chrome.storage.local.set({
    onedriveToken: td.access_token,
    onedriveRefreshToken: td.refresh_token || refreshToken,
    onedriveExpiry: Date.now() + (td.expires_in || 3600) * 1000,
  });

  return td.access_token;
}

async function oneDriveGetToken() {
  const data = await chrome.storage.local.get(['onedriveToken', 'onedriveExpiry']);
  if (data.onedriveToken && data.onedriveExpiry > Date.now() + 60000) return data.onedriveToken;
  return oneDriveRefreshToken();
}

function sanitizeFilenameForDownload(rawName, fallbackExt = 'txt') {
  const value = String(rawName || '').trim();
  if (!value) return `chat_export.${fallbackExt}`;

  // Türkçe karakter dönüşümü
  const trMap = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' };
  let cleaned = value.replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => trMap[c] || c);
  cleaned = cleaned
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_. ]+|[_. ]+$/g, '');

  const parts = cleaned.split('.');
  const ext = parts.length > 1 ? parts.pop() : fallbackExt;
  let base = parts.join('.').replace(/^[_. ]+|[_. ]+$/g, '').trim();
  if (!base || base.length < 2) base = 'chat_export';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) base = `export_${base}`;
  const safeExt = String(ext || fallbackExt).replace(/[^a-z0-9]/gi, '').toLowerCase() || fallbackExt;
  return `${base.slice(0, 80)}.${safeExt}`;
}

function getSiteByUrl(rawUrl) {
  return PlatformManager.getPlatform(rawUrl);
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

  const defaultOptions = await chrome.storage.sync.get({
    defaultMessageFilter: 'all',
    defaultLabelLanguage: 'tr',
    defaultDateStampMode: 'none',
    defaultSyntaxHighlight: true,
  });
  const exportOptions = {
    messageFilter: defaultOptions.defaultMessageFilter,
    labelLanguage: defaultOptions.defaultLabelLanguage,
    dateStampMode: defaultOptions.defaultDateStampMode,
    syntaxHighlight: defaultOptions.defaultSyntaxHighlight !== false,
    exportedAt: new Date().toISOString(),
  };

  try {
    await waitForTabComplete(runnerTab.id);
    const sanitizedAppName = appName.replace(/[/\\?%*:|"<>\s]/g, '-');
    const response = await chrome.tabs.sendMessage(runnerTab.id, {
      action: 'RUN_CONTEXT_EXPORT',
      format,
      data,
      appName:sanitizedAppName,
      exportOptions,
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

  if (msg.action === 'CLOUD_CONNECT') {
    (async () => {
      try {
        let result;
        if (msg.provider === 'notion') result = await notionConnect(msg.secret);
        else if (msg.provider === 'gdrive') result = await googleDriveOAuthConnect();
        else if (msg.provider === 'onedrive') result = await oneDriveOAuthConnect();
        else throw new Error('Bilinmeyen provider: ' + msg.provider);
        sendResponse({ ok: true, ...result });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || 'Baglanti basarisiz.' });
      }
    })();
    return true;
  }

  if (msg.action === 'CLOUD_DISCONNECT') {
    (async () => {
      try {
        if (msg.provider === 'notion') {
          await chrome.storage.local.remove(['notionToken', 'notionWorkspaceName', 'notionParentPageId']);
        } else if (msg.provider === 'gdrive') {
          await chrome.storage.local.remove(['gdriveConnected']);
          try { await chrome.identity.clearAllCachedAuthTokens(); } catch (_) {}
        } else if (msg.provider === 'onedrive') {
          await chrome.storage.local.remove(['onedriveToken', 'onedriveRefreshToken', 'onedriveExpiry', 'onedriveUserName']);
        }
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || 'Baglanti kesilemedi.' });
      }
    })();
    return true;
  }

  if (msg.action === 'CLOUD_GET_STATUS') {
    (async () => {
      try {
        const data = await chrome.storage.local.get({
          notionToken: '', notionWorkspaceName: '',
          gdriveConnected: false,
          onedriveToken: '', onedriveExpiry: 0, onedriveUserName: '',
        });
        sendResponse({
          ok: true,
          notion: { connected: !!data.notionToken, label: data.notionWorkspaceName || '' },
          gdrive: { connected: !!data.gdriveConnected, label: 'Google Drive' },
          onedrive: { connected: !!data.onedriveToken && data.onedriveExpiry > Date.now(), label: data.onedriveUserName || '' },
        });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message });
      }
    })();
    return true;
  }

  if (msg.action === 'CLOUD_GET_TOKEN') {
    (async () => {
      try {
        let token;
        if (msg.provider === 'gdrive') token = await googleDriveGetToken();
        else if (msg.provider === 'onedrive') token = await oneDriveGetToken();
        else if (msg.provider === 'notion') {
          const d = await chrome.storage.local.get('notionToken');
          token = d.notionToken;
          if (!token) throw new Error('Notion bagli degil.');
        }
        sendResponse({ ok: true, token });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || 'Token alinamadi.' });
      }
    })();
    return true;
  }

  if (msg.action === 'DOWNLOAD_FILE' || msg.action === 'DOWNLOAD_PDF') {
    (async () => {
      const requestedName = msg.filename
        ? sanitizeFilenameForDownload(msg.filename, 'txt')
        : null;

      // 1. deneme: sanitize edilmiş dosya adıyla
      if (requestedName) {
        try {
          await chrome.downloads.download({ url: msg.dataUrl, filename: requestedName, saveAs: true });
          sendResponse({ ok: true });
          return;
        } catch (_) {}
      }

      // 2. deneme: basit fallback adıyla
      const ext = requestedName ? requestedName.split('.').pop() : 'txt';
      try {
        await chrome.downloads.download({ url: msg.dataUrl, filename: `chat_export_${Date.now()}.${ext}`, saveAs: true });
        sendResponse({ ok: true });
        return;
      } catch (_) {}

      // 3. deneme: dosya adı olmadan
      try {
        await chrome.downloads.download({ url: msg.dataUrl, saveAs: true });
        sendResponse({ ok: true });
      } catch (finalErr) {
        sendResponse({ ok: false, error: finalErr?.message || 'Download basarisiz.' });
      }
    })();
    return true;
  }
});
