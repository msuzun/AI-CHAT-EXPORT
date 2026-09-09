const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  let language = 'tr';
  let removals = 0;
  let fail = false;
  const menus = new Map();
  const event = () => ({ addListener(fn) { this.listener = fn; } });
  const Ext = {
    runtime: { onInstalled: event(), onStartup: event(), onMessage: event() },
    storage: { onChanged: event(), local: { get: async () => ({}), remove: async () => {} }, sync: { get: async (defaults) => ({ ...defaults, language }) } },
    tabs: { onRemoved: event() },
    contextMenus: { onClicked: event(), removeAll: async () => { removals++; menus.clear(); }, create(details, callback) {
      setImmediate(() => {
        if (fail) { fail = false; Ext.runtime.lastError = { message: 'Temporary failure' }; }
        else { assert(!menus.has(details.id), 'duplicate menu ID'); menus.set(details.id, details); }
        callback(); delete Ext.runtime.lastError;
      });
    } },
  };
  const ctx = vm.createContext({ Ext, console, PlatformManager: { getAllPatterns: () => ['https://chatgpt.com/*'] } });
  vm.runInContext(fs.readFileSync(require.resolve('../shared/settings.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8').replace(/^import .*;\r?\n/gm, ''), ctx);
  return { Ext, menus, setLanguage: value => { language = value; }, failNext: () => { fail = true; }, count: () => removals, idle: () => vm.runInContext('menuUpdate', ctx), refresh: () => vm.runInContext('createContextMenus()', ctx) };
}

test('menus follow saved language on install, change, startup and reset', async () => {
  const f = fixture();
  f.Ext.runtime.onInstalled.listener(); await f.idle();
  assert.equal(f.menus.get('ai_chat_export_pdf').title, "PDF'e aktar");
  f.setLanguage('en'); f.Ext.storage.onChanged.listener({ language: { newValue: 'en' } }, 'sync'); await f.idle();
  assert.deepEqual([...f.menus.values()].slice(1).map(m => m.title), ['Export to PDF','Export to Markdown','Export to Word','Export to HTML','Export to plain text']);
  f.Ext.runtime.onStartup.listener(); await f.idle();
  assert.equal(f.menus.get('ai_chat_export_pdf').title, 'Export to PDF');
  const count = f.count();
  f.Ext.storage.onChanged.listener({ theme: {} }, 'sync');
  f.Ext.storage.onChanged.listener({ language: {} }, 'local'); await f.idle();
  assert.equal(f.count(), count);
  f.setLanguage(undefined); f.Ext.storage.onChanged.listener({ language: { oldValue: 'en' } }, 'sync'); await f.idle();
  assert.equal(f.menus.get('ai_chat_export_pdf').title, "PDF'e aktar");
});

test('rapid menu updates are serialized and recover after API errors', async () => {
  const f = fixture();
  await Promise.all([f.refresh(), f.refresh(), f.refresh()]);
  assert.equal(f.menus.size, 6);
  f.failNext(); await assert.rejects(f.refresh(), /Temporary failure/);
  f.setLanguage('en'); await f.refresh();
  assert.equal(f.menus.size, 6);
  assert.equal(f.menus.get('ai_chat_export_pdf').title, 'Export to PDF');
});
