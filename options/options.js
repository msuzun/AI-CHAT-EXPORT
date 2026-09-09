const text = {
  tr: {
    title: 'Chat Export for ChatGPT — Ayarlar', hint: 'Arayüz dili sağ tık menüsüne de uygulanır. Değişiklikleri Kaydet ile uygulayın.', save: 'Kaydet', reset: 'Varsayılana dön', saved: 'Ayarlar kaydedildi.', resetDone: 'Varsayılan ayarlar geri yüklendi.', error: 'Ayarlar kaydedilemedi. Tekrar deneyin.',
    labels: ['Dışa aktarma biçimi','Pano biçimi','Mesaj filtresi','Çıktı etiketlerinin dili','Tarih damgası','Kod renklendirme','Arayüz dili','Tema'],
    values: { pdf:'PDF',markdown:'Markdown',word:'Word (.doc)',html:'HTML',txt:'Düz metin',all:'Tüm mesajlar',user:'Kullanıcı',assistant:'Asistan',tr:'Türkçe',en:'English',none:'Yok',filename:'Dosya adında',content:'İçerikte',both:'Her ikisinde',true:'Açık',false:'Kapalı',system:'Sistem',light:'Açık',dark:'Koyu' },
  },
  en: {
    title: 'Chat Export for ChatGPT — Settings', hint: 'Interface language also applies to the right-click menu. Select Save to apply changes.', save: 'Save', reset: 'Restore defaults', saved: 'Settings saved.', resetDone: 'Default settings restored.', error: 'Could not save settings. Please try again.',
    labels: ['Export format','Clipboard format','Message filter','Export label language','Date stamp','Syntax highlighting','Interface language','Theme'],
    values: { pdf:'PDF',markdown:'Markdown',word:'Word (.doc)',html:'HTML',txt:'Plain text',all:'All messages',user:'User',assistant:'Assistant',tr:'Türkçe',en:'English',none:'None',filename:'Filename',content:'Content',both:'Both',true:'On',false:'Off',system:'System',light:'Light',dark:'Dark' },
  },
};
const keys = Object.keys(ExportSettings.defaults);
const form = document.getElementById('settingsForm');
const media = matchMedia('(prefers-color-scheme: dark)');
let current = { ...ExportSettings.defaults };
let busy = false;
function appearance() {
  const dict = text[current.language];
  document.documentElement.lang = current.language;
  document.title = dict.title;
  document.getElementById('title').textContent = dict.title;
  document.getElementById('hint').textContent = dict.hint;
  document.getElementById('independenceNotice').textContent = current.language === 'en'
    ? 'Independent extension; not affiliated with or endorsed by OpenAI.'
    : 'Bağımsız uzantı; OpenAI ile bağlantılı değildir ve OpenAI tarafından desteklenmez.';
  document.getElementById('saveBtn').textContent = dict.save;
  document.getElementById('resetBtn').textContent = dict.reset;
  document.body.classList.toggle('theme-dark', current.theme === 'dark' || current.theme === 'system' && media.matches);
  keys.forEach((key, i) => {
    document.querySelector(`label[for="${key}"]`).textContent = dict.labels[i];
    Array.from(document.getElementById(key).options).forEach((option) => { option.textContent = dict.values[option.value]; });
  });
}
function write(settings) {
  current = ExportSettings.normalize(settings);
  keys.forEach((key) => { document.getElementById(key).value = String(current[key]); });
  appearance();
}
async function persist(reset) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('button').forEach((button) => { button.disabled = true; });
  document.getElementById('status').textContent = '';
  const next = reset ? { ...ExportSettings.defaults } : { ...current };
  try {
    await Ext.storage.sync.set(next);
    write(next);
    document.getElementById('status').textContent = text[current.language][reset ? 'resetDone' : 'saved'];
  } catch (_) {
    document.getElementById('status').textContent = text[current.language].error;
  } finally {
    busy = false;
    document.querySelectorAll('button').forEach((button) => { button.disabled = false; });
  }
}
keys.forEach((key) => {
  const label = document.createElement('label'); label.htmlFor = key; label.className = 'label';
  const select = document.createElement('select'); select.id = key; select.className = 'input';
  (ExportSettings.choices[key] || ['true','false']).forEach((value) => { const option = document.createElement('option'); option.value = value; select.appendChild(option); });
  select.addEventListener('change', () => { current[key] = key === 'defaultSyntaxHighlight' ? select.value === 'true' : select.value; appearance(); document.getElementById('status').textContent = ''; });
  form.append(label, select);
});
document.getElementById('saveBtn').addEventListener('click', () => persist(false));
document.getElementById('resetBtn').addEventListener('click', () => persist(true));
media.addEventListener('change', appearance);
write(current);
ExportSettings.load().then(write).catch(() => { document.getElementById('status').textContent = 'Ayarlar yüklenemedi / Could not load settings.'; });
