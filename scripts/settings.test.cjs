const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../shared/settings.js');
const { normalize, defaults } = globalThis.ExportSettings;
test('invalid storage values fall back without leaking unknown keys', () => {
  const value = normalize({ theme:'broken', defaultSyntaxHighlight:'false', defaultFormat:null, unknown:'secret' });
  assert.deepEqual(value, defaults);
});
test('all supported settings round-trip, including false', () => {
  const value = { defaultFormat:'html', defaultClipboardFormat:'txt', defaultMessageFilter:'assistant', defaultLabelLanguage:'en', defaultDateStampMode:'both', defaultSyntaxHighlight:false, language:'en', theme:'dark' };
  assert.deepEqual(normalize(value), value);
});
test('browser API selects promise-returning Firefox namespace', () => {
  globalThis.browser = { runtime:{} }; globalThis.chrome = {};
  require('../shared/browser-api.js'); assert.equal(globalThis.Ext, globalThis.browser);
});
