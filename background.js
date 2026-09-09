import './shared/browser-api.js';
import './shared/settings.js';
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

let menuUpdate = Promise.resolve();
function createContextMenus() {
  // Serialize installation, startup and rapid setting changes to avoid duplicate IDs.
  menuUpdate = menuUpdate.catch(() => {}).then(rebuildContextMenus);
  return menuUpdate;
}

async function rebuildContextMenus() {
  const { language } = await ExportSettings.load();
  const titles = language === 'en'
    ? ['Export to PDF', 'Export to Markdown', 'Export to Word', 'Export to HTML', 'Export to plain text']
    : ["PDF'e aktar", "Markdown'a aktar", "Word'e aktar", "HTML'e aktar", 'Düz metne aktar'];
  const create = (details) => new Promise((resolve, reject) => {
    Ext.contextMenus.create(details, () => {
      const error = Ext.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
  await Ext.contextMenus.removeAll();
  await create({
      id: MENU_ROOT,
      title: 'Chat Export for ChatGPT',
      contexts: ['page'],
      documentUrlPatterns: SUPPORTED_PATTERNS,
    });

  for (const [index, id] of Object.keys(MENU_TO_FORMAT).entries()) {
    await create({
      id,
      parentId: MENU_ROOT,
      title: titles[index],
      contexts: ['page'],
      documentUrlPatterns: SUPPORTED_PATTERNS,
    });
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


async function extractChat(tabId, siteId) {

  await ensureContentScript(tabId);

  const response = await Ext.tabs.sendMessage(tabId, {
    action: 'EXTRACT_CHAT',
    siteId,
  });
  if (response?.error) throw Object.assign(new Error(response.error), { code: response.code });
  if (!response?.data?.messages?.length) throw new Error('Bu sayfada chat icerigi bulunamadi.');
  return response.data;
}

async function waitForTabComplete(tabId, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = await Ext.tabs.get(tabId);
    if (t?.status === 'complete') return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Export sayfasi zamaninda yuklenemedi.');
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
  return PlatformManager.isLikelyChatUrl(siteId, rawUrl);
}

async function getChatLinks(tabId, siteId) {

  const response = await Ext.tabs.sendMessage(tabId, { action: 'EXTRACT_CHAT_LINKS', siteId });
  if (response?.error) throw new Error(response.error);
  return response?.links || [];
}

async function extractCurrentChat(tabId, siteId, expectedUrl = '') {
  let lastError = 'Bu sayfada chat icerigi bulunamadi.';
  const expected = expectedUrl ? normalizeChatUrlForCompare(expectedUrl) : '';
  for (let i = 0; i < 16; i++) {
    try {
      const data = await extractChat(tabId, siteId);
      const currentUrl = data?.currentUrl || '';
      const urlMatched = !expected || (currentUrl && normalizeChatUrlForCompare(currentUrl) === expected);
      const hasMessages = data?.messages?.length > 0;
      if (urlMatched && hasMessages) return data;
      if (!hasMessages) lastError = 'Sohbet icerigi henuz yuklenmedi, tekrar deneniyor.';
    } catch (err) {
      if (err?.code === 'HISTORY_INCOMPLETE') throw err;
      lastError = err?.message || lastError;
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error(lastError);
}

function escapeHtml(text) {
  const s = String(text ?? '');
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  return { title: `${appName} Tum Sohbetler (${chats.length})`, messages: mergedMessages };
}

function parseDateBoundary(value, isEnd) {
  if (!value) return null;
  const d = new Date(value + (isEnd ? 'T23:59:59.999' : 'T00:00:00.000'));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseMessageTimestamp(msg) {
  if (!msg?.timestamp) return null;
  const d = new Date(msg.timestamp);
  return Number.isNaN(d.getTime()) ? null : d;
}

function filterDataByDateRange(data, rangeStart, rangeEnd) {
  if (!rangeStart && !rangeEnd) return { ...data };
  const start = parseDateBoundary(rangeStart, false);
  const end = parseDateBoundary(rangeEnd, true);
  if (!start && !end) return { ...data };
  const allMessages = Array.isArray(data?.messages) ? data.messages : [];
  const hasTimestamp = allMessages.some((m) => m.role !== 'meta' && !!parseMessageTimestamp(m));
  if (!hasTimestamp) return { ...data, _dateRangeSkipped: true };
  const filtered = allMessages.filter((m) => {
    if (m.role === 'meta') return true;
    const ts = parseMessageTimestamp(m);
    if (!ts) return true;
    if (start && ts < start) return false;
    if (end && ts > end) return false;
    return true;
  });
  const nonMeta = filtered.filter((m) => m.role !== 'meta').length;
  if (!nonMeta) throw new Error('Seçilen tarih aralığında mesaj bulunamadı.');
  return { ...data, messages: filtered };
}

async function collectAllChatsFromLinks(tabId, siteInfo, originalUrl) {
  await ensureContentScript(tabId);
  let links = await getChatLinks(tabId, siteInfo.id);
  if (originalUrl) links = uniqueUrls([originalUrl, ...links]);
  links = links.filter((u) => isLikelyChatUrl(siteInfo.id, u));
  if (!links.length) throw new Error('Gecerli sohbet linki bulunamadi. Once sohbet gecmis listesini acin.');

  const chats = [];
  const failed = [];
  for (let i = 0; i < links.length; i++) {
    const url = links[i];
    try {
      await Ext.tabs.update(tabId, { url });
      await waitForTabComplete(tabId);
      await waitForTabUrl(tabId, url);
      await new Promise((r) => setTimeout(r, 1200));
      const data = await extractCurrentChat(tabId, siteInfo.id, url);
      chats.push({ ...data, sourceUrl: url });
    } catch (err) {
      failed.push({ url, reason: err?.message || 'Bilinmeyen hata' });
    }
  }
  if (originalUrl) {
    try {
      await Ext.tabs.update(tabId, { url: originalUrl });
    } catch (_) {}
  }
  return { chats, failed, total: links.length };
}

async function collectSelectedChatsFromItems(tabId, siteInfo, selectedBatchItems) {
  const chats = [];
  const failed = [];
  for (let i = 0; i < selectedBatchItems.length; i++) {
    const item = selectedBatchItems[i];
    if (!item?.href) continue;
    try {
      await Ext.tabs.update(tabId, { url: item.href });
      await waitForTabComplete(tabId);
      await waitForTabUrl(tabId, item.href);
      await new Promise((r) => setTimeout(r, 1200));
      const data = await extractCurrentChat(tabId, siteInfo.id, item.href);
      chats.push({ ...data, sourceUrl: item.href });
    } catch (err) {
      failed.push({ title: item.title, reason: err?.message || 'Hata' });
    }
  }
  return { chats, failed, total: selectedBatchItems.length };
}

async function resolveDataByScopeInBackground(tabId, siteInfo, scope, exportOptions, selectedBatchItems) {
  await ensureContentScript(tabId);

  if (scope === 'all') {
    const tab = await Ext.tabs.get(tabId);
    const result = await collectAllChatsFromLinks(tabId, siteInfo, tab?.url);
    if (!result.chats.length) {
      const detail = result.failed[0]?.reason ? ` Ilk hata: ${result.failed[0].reason}` : '';
      throw new Error(`Hicbir sohbet islenemedi.${detail}`);
    }
    const data = mergeChatsForExport(result.chats, siteInfo.name);
    const infoText = result.failed.length > 0 ? `${result.chats.length}/${result.total} sohbet islendi.` : 'Islem basariyla tamamlandi.';
    return { data, infoText, previewChats: result.chats };
  }

  if (scope === 'selected') {
    if (!selectedBatchItems?.length) throw new Error('Hicbir sohbet secilmedi.');
    const result = await collectSelectedChatsFromItems(tabId, siteInfo, selectedBatchItems);
    if (!result.chats.length) {
      const detail = result.failed[0]?.reason ? ` Ilk hata: ${result.failed[0].reason}` : '';
      throw new Error(`Hicbir sohbet islenemedi.${detail}`);
    }
    const data = mergeChatsForExport(result.chats, siteInfo.name);
    const infoText = result.failed.length > 0 ? `${result.chats.length}/${result.total} sohbet islendi.` : 'Islem basariyla tamamlandi.';
    return { data, infoText, previewChats: result.chats };
  }

  const data = await extractCurrentChat(tabId, siteInfo.id);
  return { data, infoText: 'Islem basariyla tamamlandi.', previewChats: [data] };
}

async function openExportPreviewFromBackground(payload) {
  const token = `${Date.now()}_${crypto.randomUUID()}`;
  await Ext.storage.local.set({ [PREVIEW_KEY_PREFIX + token]: payload || null });
  const previewWindow = await Ext.windows.create({
    url: Ext.runtime.getURL(`popup/preview.html?token=${encodeURIComponent(token)}`),
    type: 'popup',
    width: 1200,
    height: 860,
  });
  await Ext.storage.local.set({ [PREVIEW_KEY_PREFIX + token]: { ...payload, _previewTabId: previewWindow.tabs?.[0]?.id, _savedAt: Date.now() } });
}

async function runExportInRunner(format, data, appName) {
  const settings = await ExportSettings.load();
  await openExportPreviewFromBackground({ format, appName, scope: 'current', exportData: data, previewChats: [data],
    infoText: '', exportOptions: { messageFilter: settings.defaultMessageFilter, labelLanguage: settings.defaultLabelLanguage,
    dateStampMode: settings.defaultDateStampMode, syntaxHighlight: settings.defaultSyntaxHighlight, exportedAt: new Date().toISOString() } });
}

Ext.runtime.onInstalled.addListener(() => {
  clearLegacyData().catch(console.error);
  createContextMenus().catch(console.error);
});

Ext.runtime.onStartup.addListener(() => {
  clearLegacyData().catch(console.error);
  createContextMenus().catch(console.error);
});

Ext.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.language) {
    createContextMenus().catch(console.error);
  }
});

Ext.contextMenus.onClicked.addListener(async (info, tab) => {
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

async function fetchMediaDataUrl(rawUrl) {
  const url = new URL(rawUrl);
  const allowed =
    url.protocol === 'https:' &&
    (url.hostname === 'chatgpt.com' ||
      url.hostname === 'openai.com' ||
      url.hostname.endsWith('.openai.com') ||
      url.hostname === 'oaiusercontent.com' ||
      url.hostname.endsWith('.oaiusercontent.com') ||
      url.hostname === 'oaistatic.com' ||
      url.hostname.endsWith('.oaistatic.com'));
  if (!allowed) throw new Error('Medya adresine erisim izni yok.');

  const response = await fetch(url.href, { credentials: 'include' });
  if (!response.ok) throw new Error(`Medya indirilemedi (HTTP ${response.status}).`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('Medya bir gorsel degil.');
  if (blob.size > 15 * 1024 * 1024) throw new Error('Gorsel 15 MB sinirini asiyor.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

Ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== Ext.runtime.id) return;
  const fromPage = sender.url && !sender.url.startsWith(Ext.runtime.getURL(''));
  if (fromPage && (!getSiteByUrl(sender.url) || !['HISTORY_PROGRESS', 'FETCH_MEDIA_DATA_URL'].includes(msg.action))) return;

  if (msg.action === 'HISTORY_PROGRESS') {
    sendResponse({ ok: true });
    return;
  }
  if (msg.action === 'FETCH_MEDIA_DATA_URL') {
    fetchMediaDataUrl(msg.url)
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Medya alinamadi.' }));
    return true;
  }

  if (msg.action === 'PREVIEW_SET_PAYLOAD') {
    const token = `${Date.now()}_${crypto.randomUUID()}`;
    Ext.storage.local
      .set({ [PREVIEW_KEY_PREFIX + token]: { ...msg.payload, _savedAt: Date.now() } })
      .then(() => sendResponse({ ok: true, token }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Preview payload saklanamadi.' }));
    return true;
  }

  if (msg.action === 'PREVIEW_GET_PAYLOAD') {
    const key = PREVIEW_KEY_PREFIX + msg.token;
    Ext.storage.local
      .get(key)
      .then((obj) => {
        const payload = obj?.[key];
        if (!payload || Date.now() - (payload._savedAt || Number(String(msg.token).split('_')[0])) > 3600000) {
          Ext.storage.local.remove(key).catch(() => {});
          sendResponse({ ok: false, error: 'Preview verisi bulunamadi.' });
          return;
        }
        sendResponse({ ok: true, payload });
      })
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Preview verisi okunamadi.' }));
    return true;
  }

  if (msg.action === 'PREVIEW_CLEAR_PAYLOAD') {
    Ext.storage.local
      .remove(PREVIEW_KEY_PREFIX + msg.token)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Preview verisi silinemedi.' }));
    return true;
  }

  if (msg.action === 'RUN_FULL_EXPORT') {
    (async () => {
      const { tabId, siteInfo, format, scope, exportOptions, selectedBatchItems, target } = msg;
      if (!tabId || !siteInfo?.id) {
        sendResponse({ ok: false, error: 'Eksik parametre.' });
        return;
      }
      await Ext.storage.local.set({ exportInProgress: true });
      try {
        const resolved = await resolveDataByScopeInBackground(
          tabId,
          siteInfo,
          scope,
          exportOptions || {},
          selectedBatchItems || []
        );
        const rangeStart = exportOptions?.dateRangeStart;
        const rangeEnd = exportOptions?.dateRangeEnd;
        const filteredPreviewChats = (resolved.previewChats || []).map((chat) =>
          filterDataByDateRange(chat, rangeStart, rangeEnd)
        );
        const dateRangeSkipped = filteredPreviewChats.some((c) => c._dateRangeSkipped);
        let infoText = resolved.infoText || 'Islem basariyla tamamlandi.';
        if (dateRangeSkipped && (rangeStart || rangeEnd)) {
          infoText += ' (Tarih araligi filtresi: mesajlarda tarih bilgisi bulunamadigi icin atlanildi.)';
        }
        const filteredExportData =
          scope === 'all' || scope === 'selected'
            ? mergeChatsForExport(filteredPreviewChats, siteInfo.name)
            : filteredPreviewChats[0];


        await openExportPreviewFromBackground({
          format,
          appName: siteInfo.name,
          scope,
          exportData: filteredExportData,
          previewChats: filteredPreviewChats,
          infoText,
          exportOptions: exportOptions || {},
        });
        sendResponse({ ok: true });
      } catch (err) {
        console.error('[Chat Export for ChatGPT] RUN_FULL_EXPORT error:', err);
        sendResponse({ ok: false, error: err?.message || 'Export basarisiz.' });
      } finally {
        await Ext.storage.local.set({ exportInProgress: false });
      }
    })();
    return true;
  }

  if (msg.action === 'DOWNLOAD_FILE' || msg.action === 'DOWNLOAD_PDF') {
    if (!/^data:(application\/(pdf|msword|octet-stream)|text\/(plain|html|markdown))[;,]/i.test(msg.dataUrl || '')) {
      sendResponse({ ok: false, error: 'Geçersiz indirme içeriği.' }); return;
    }
    Ext.downloads.download({ url: msg.dataUrl, filename: sanitizeFilenameForDownload(msg.filename), saveAs: true })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || 'İndirme iptal edildi.' }));
    return true;
  }
});

async function clearLegacyData() {
  const stored = await Ext.storage.local.get(null);
  const keys = Object.keys(stored).filter((key) => key.startsWith(PREVIEW_KEY_PREFIX) || /^(notion|gdrive|onedrive)/.test(key) || key === 'exportInProgress');
  if (keys.length) await Ext.storage.local.remove(keys);
}
Ext.tabs.onRemoved.addListener(async (tabId) => {
  const stored = await Ext.storage.local.get(null);
  const keys = Object.keys(stored).filter((key) => key.startsWith(PREVIEW_KEY_PREFIX) && (stored[key]?._previewTabId === tabId || Date.now() - (stored[key]?._savedAt || 0) > 3600000));
  if (keys.length) await Ext.storage.local.remove(keys);
});
