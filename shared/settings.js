(function () {
  const defaults = Object.freeze({ defaultFormat: 'pdf', defaultClipboardFormat: 'markdown', defaultMessageFilter: 'all', defaultLabelLanguage: 'tr', defaultDateStampMode: 'none', defaultSyntaxHighlight: true, language: 'tr', theme: 'system' });
  const choices = {
    defaultFormat: ['pdf', 'markdown', 'word', 'html', 'txt'],
    defaultClipboardFormat: ['markdown', 'txt'], defaultMessageFilter: ['all', 'user', 'assistant'],
    defaultLabelLanguage: ['tr', 'en'], defaultDateStampMode: ['none', 'filename', 'content', 'both'],
    language: ['tr', 'en'], theme: ['system', 'light', 'dark'],
  };
  function normalize(value = {}) {
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key,
      key === 'defaultSyntaxHighlight' ? typeof value[key] === 'boolean' ? value[key] : fallback
        : choices[key].includes(value[key]) ? value[key] : fallback]));
  }
  globalThis.ExportSettings = { defaults, choices, normalize, async load() { return normalize(await Ext.storage.sync.get(defaults)); } };
})();
