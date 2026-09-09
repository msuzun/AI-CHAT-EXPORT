const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

test('local-only guard catches the rejected CDN and viewer implementations', async () => {
  const { assertLocalPdfBundle, stripExternalViewers } = await import('./pdf-local-only.mjs');
  assert.throws(() => assertLocalPdfBundle('https://cdnjs.cloudflare.com/ajax/libs/pdfobject/2.1.1/pdfobject.min.js'));
  assert.throws(() => assertLocalPdfBundle('https://example.test/remote.js'));
  assert.throws(() => assertLocalPdfBundle('options.pdfJsUrl'));
  assert.throws(() => stripExternalViewers('changed upstream source'));
  assertLocalPdfBundle(readFileSync(require.resolve('../lib/html2pdf.bundle.min.js'), 'utf8'));
});

test('patched jsPDF generates PDF bytes and a Blob without external viewers', async () => {
  const { build } = require('esbuild');
  const { localOnlyPdfPlugin, assertLocalPdfBundle } = await import('./pdf-local-only.mjs');
  const result = await build({
    stdin: { contents: 'export { jsPDF } from "jspdf";', resolveDir: require('node:path').resolve(__dirname, '..') },
    bundle: true, write: false, format: 'cjs', platform: 'browser', minify: true, legalComments: 'none',
    plugins: [localOnlyPdfPlugin],
  });
  const source = result.outputFiles[0].text;
  assertLocalPdfBundle(source);
  const context = { exports: {}, Blob, atob, btoa, TextEncoder, TextDecoder, console, setTimeout, clearTimeout };
  context.module = { exports: context.exports };
  vm.runInNewContext(source, context, { displayErrors: false });
  const pdf = new context.module.exports.jsPDF();
  pdf.text('Local PDF export', 10, 10);
  assert.match(pdf.output(), /^%PDF-/);
  const blob = pdf.output('blob');
  assert.equal(blob.type, 'application/pdf');
  assert.match(await blob.text(), /Local PDF export/);
  assert.equal(pdf.output('pdfobjectnewwindow'), null);
  assert.equal(pdf.output('pdfjsnewwindow'), null);
});
