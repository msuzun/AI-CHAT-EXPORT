import { readFile, readdir, access } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { assertLocalPdfBundle } from './pdf-local-only.mjs';
const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
assertLocalPdfBundle(await readFile(join(root,'lib/html2pdf.bundle.min.js'),'utf8'));
async function walk(path) {
  const result = [];
  for(const entry of await readdir(path,{withFileTypes:true})) {
    const full=join(path,entry.name); if(entry.isDirectory()) result.push(...await walk(full)); else result.push(full);
  } return result;
}
const files=[join(root,'background.js')];
for(const folder of ['content','shared','popup','options','platforms']) files.push(...await walk(join(root,folder)));
for(const file of files) {
  if(file.endsWith('.js')) execFileSync(process.execPath,['--check',file]);
  if(file.endsWith('.html')) {
    const html=await readFile(file,'utf8');
    for(const [,reference] of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      if(!/^(https?:|data:|#)/.test(reference)) await access(resolve(dirname(file),reference));
    }
  }
}
for(const script of manifest.content_scripts.flatMap(c=>c.js)) await access(join(root,script));
assert(!manifest.permissions.includes('identity'));
assert(!manifest.oauth2);
assert.deepEqual(manifest.content_scripts[0].js,['shared/browser-api.js','lib/dompurify.min.js','content/history-loader.js','content/content.js']);
console.log('Runtime syntax, references, manifest and removed cloud permissions: PASS');
