const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(require.resolve('../popup/exporters.js'),'utf8'),ctx);
// Match browser text-to-HTML escaping without requiring a DOM in this unit test.
ctx.escapeHtml = text => String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
test('highlighting preserves exact source and does not tokenize its own markup', () => {
  const source = 'class Note { text = "class return 42 https://example.test"; }\n// const "hello" 123\nconst html = "<img onerror=alert(1)>";';
  const html = ctx.highlightCodeText(source, 'javascript');
  assert.equal(html.replace(/<span class="tok-(?:kw|str|num|com)">|<\/span>/g,''), ctx.escapeHtml(source));
  assert(html.includes('<span class="tok-str">"class return 42 https://example.test"</span>'));
  assert(html.includes('<span class="tok-com">// const "hello" 123</span>'));
  assert(!html.includes('<img'));
});
test('escaped quotes, multiline comments and Python hash comments preserve source', () => {
  for (const [lang, source] of [['javascript','const s = "a\\"b"; /* class\n42 */\nreturn 7;'],['python','url = "https://a/#tag"\n# class 42 "text"\nreturn 5']]) {
    const html = ctx.highlightCodeText(source,lang);
    assert.equal(html.replace(/<span class="tok-(?:kw|str|num|com)">|<\/span>/g,''),ctx.escapeHtml(source));
  }
});
