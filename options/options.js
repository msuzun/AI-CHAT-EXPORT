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
}

async function save() {
  const settings = readForm();
  await chrome.storage.sync.set(settings);
  setStatus('Ayarlar kaydedildi.');
}

async function resetDefaults() {
  writeForm(DEFAULT_SETTINGS);
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  setStatus('Varsayilan ayarlar geri yuklendi.');
}

document.getElementById('saveBtn').addEventListener('click', () => {
  save().catch((err) => setStatus(err?.message || 'Kaydetme hatasi.'));
});

document.getElementById('resetBtn').addEventListener('click', () => {
  resetDefaults().catch((err) => setStatus(err?.message || 'Sifirlama hatasi.'));
});

load().catch((err) => setStatus(err?.message || 'Ayarlar yuklenemedi.'));
