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

function setStatus(text) {
  document.getElementById('status').textContent = text || '';
}

function setCloudStatus(text) {
  const el = document.getElementById('cloudStatus');
  if (el) el.textContent = text || '';
}

function readForm() {
  return {
    defaultFormat: document.getElementById('defaultFormat').value,
    defaultClipboardFormat: document.getElementById('defaultClipboardFormat').value,
    defaultMessageFilter: document.getElementById('defaultMessageFilter').value,
    defaultLabelLanguage: document.getElementById('defaultLabelLanguage').value,
    defaultDateStampMode: document.getElementById('defaultDateStampMode').value,
    defaultSyntaxHighlight: document.getElementById('defaultSyntaxHighlight').value === 'true',
    language: document.getElementById('language').value,
    theme: document.getElementById('theme').value,
  };
}

function writeForm(settings) {
  document.getElementById('defaultFormat').value = settings.defaultFormat;
  document.getElementById('defaultClipboardFormat').value = settings.defaultClipboardFormat;
  document.getElementById('defaultMessageFilter').value = settings.defaultMessageFilter;
  document.getElementById('defaultLabelLanguage').value = settings.defaultLabelLanguage;
  document.getElementById('defaultDateStampMode').value = settings.defaultDateStampMode;
  document.getElementById('defaultSyntaxHighlight').value = settings.defaultSyntaxHighlight ? 'true' : 'false';
  document.getElementById('language').value = settings.language;
  document.getElementById('theme').value = settings.theme;
}

async function load() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  writeForm({ ...DEFAULT_SETTINGS, ...settings });
  await loadCloudSettings();
  await refreshCloudStatus();
}

async function save() {
  const settings = readForm();
  await chrome.storage.sync.set(settings);
  await saveCloudSettings();
  setStatus('Ayarlar kaydedildi.');
}

async function resetDefaults() {
  writeForm(DEFAULT_SETTINGS);
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  setStatus('Varsayilan ayarlar geri yuklendi.');
}

/* ================================================================
   CLOUD SETTINGS
   ================================================================ */

async function loadCloudSettings() {
  const data = await chrome.storage.local.get({
    notionToken: '',
    notionParentPageId: '',
    onedriveClientId: '',
  });

  const el = (id) => document.getElementById(id);
  if (el('notionSecret')) el('notionSecret').value = data.notionToken;
  if (el('notionParentPageId')) el('notionParentPageId').value = data.notionParentPageId;
  if (el('onedriveClientId')) el('onedriveClientId').value = data.onedriveClientId;
}

async function saveCloudSettings() {
  const el = (id) => document.getElementById(id)?.value || '';
  await chrome.storage.local.set({
    notionParentPageId: el('notionParentPageId'),
    onedriveClientId: el('onedriveClientId'),
  });
}

async function refreshCloudStatus() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'CLOUD_GET_STATUS' });
    if (!res?.ok) return;

    updateBadge('notionStatus', 'notionConnectBtn', 'notionDisconnectBtn', res.notion.connected, res.notion.label);
    updateBadge('gdriveStatus', 'gdriveConnectBtn', 'gdriveDisconnectBtn', res.gdrive.connected, '');
    updateBadge('onedriveStatus', 'onedriveConnectBtn', 'onedriveDisconnectBtn', res.onedrive.connected, res.onedrive.label);
  } catch (_) {}
}

function updateBadge(badgeId, connectBtnId, disconnectBtnId, connected, label) {
  const badge = document.getElementById(badgeId);
  const connectBtn = document.getElementById(connectBtnId);
  const disconnectBtn = document.getElementById(disconnectBtnId);

  if (badge) {
    badge.textContent = connected ? (label || 'Bagli') : 'Baglanmadi';
    badge.className = `cloud-badge ${connected ? 'connected' : 'disconnected'}`;
  }
  if (connectBtn) connectBtn.style.display = connected ? 'none' : '';
  if (disconnectBtn) disconnectBtn.style.display = connected ? '' : 'none';
}

async function connectProvider(provider) {
  setCloudStatus(`${provider} baglaniyor...`);
  await saveCloudSettings();

  // Notion: Internal Integration - OAuth yok, secret dogrudan kaydedilir
  if (provider === 'notion') {
    const secret = document.getElementById('notionSecret')?.value?.trim();
    if (!secret) {
      setCloudStatus('Notion secret degeri girilmedi.');
      return;
    }
    try {
      const res = await chrome.runtime.sendMessage({ action: 'CLOUD_CONNECT', provider: 'notion', secret });
      if (!res?.ok) throw new Error(res?.error || 'Baglanti basarisiz.');
      setCloudStatus('Notion basariyla baglandi.');
      await refreshCloudStatus();
    } catch (err) {
      setCloudStatus(err?.message || 'Notion baglanti basarisiz.');
    }
    return;
  }

  try {
    const res = await chrome.runtime.sendMessage({ action: 'CLOUD_CONNECT', provider });
    if (!res?.ok) throw new Error(res?.error || 'Baglanti basarisiz.');
    setCloudStatus(`${provider} basariyla baglandi.`);
    await refreshCloudStatus();
  } catch (err) {
    setCloudStatus(err?.message || 'Baglanti basarisiz.');
  }
}

async function disconnectProvider(provider) {
  try {
    await chrome.runtime.sendMessage({ action: 'CLOUD_DISCONNECT', provider });
    setCloudStatus(`${provider} baglantisi kesildi.`);
    await refreshCloudStatus();
  } catch (err) {
    setCloudStatus(err?.message || 'Baglanti kesilemedi.');
  }
}

/* ================================================================
   EVENT LISTENERS
   ================================================================ */

document.getElementById('saveBtn').addEventListener('click', () => {
  save().catch((err) => setStatus(err?.message || 'Kaydetme hatasi.'));
});

document.getElementById('resetBtn').addEventListener('click', () => {
  resetDefaults().catch((err) => setStatus(err?.message || 'Sifirlama hatasi.'));
});

// Cloud connect/disconnect buttons
document.getElementById('notionConnectBtn')?.addEventListener('click', () => connectProvider('notion'));
document.getElementById('notionDisconnectBtn')?.addEventListener('click', () => disconnectProvider('notion'));
document.getElementById('gdriveConnectBtn')?.addEventListener('click', () => connectProvider('gdrive'));
document.getElementById('gdriveDisconnectBtn')?.addEventListener('click', () => disconnectProvider('gdrive'));
document.getElementById('onedriveConnectBtn')?.addEventListener('click', () => connectProvider('onedrive'));
document.getElementById('onedriveDisconnectBtn')?.addEventListener('click', () => disconnectProvider('onedrive'));

load().catch((err) => setStatus(err?.message || 'Ayarlar yuklenemedi.'));
