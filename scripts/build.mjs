import { build } from 'esbuild';
import { mkdir, readFile, writeFile, cp, readdir, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { localOnlyPdfPlugin, assertLocalPdfBundle } from './pdf-local-only.mjs';
const root = resolve(import.meta.dirname, '..');
await mkdir(join(root, 'lib'), { recursive: true });
await build({ absWorkingDir: root, entryPoints: ['scripts/pdf-entry.js'], bundle: true, minify: true, format: 'iife', platform: 'browser', target: ['chrome120', 'firefox140'], outfile: 'lib/html2pdf.bundle.min.js', legalComments: 'external',
  plugins: [localOnlyPdfPlugin, { name: 'native-global-this', setup(bundler) {
    // Both minimum browser versions implement globalThis; exclude core-js's
    // legacy Function-constructor fallback, which violates extension CSP.
    bundler.onLoad({ filter: /core-js[\\/]internals[\\/]global-this\.js$/ }, () => ({ contents: 'module.exports = globalThis;', loader: 'js' }));
  } }],
});
assertLocalPdfBundle(await readFile(join(root, 'lib/html2pdf.bundle.min.js'), 'utf8'));
await cp(join(root,'node_modules/dompurify/dist/purify.min.js'),join(root,'lib/dompurify.min.js'));
const lock = JSON.parse(await readFile(join(root,'package-lock.json'),'utf8'));
let notices = 'Third-party package licenses (versions locked in package-lock.json)\n';
for (const [path, data] of Object.entries(lock.packages)) {
  if (!path || path.includes('esbuild') || path.includes('@types/')) continue;
  const directory = join(root,path);
  const names = (await readdir(directory)).filter(name => /^(license|licence|copying)(\.|$)/i.test(name));
  for (const name of names) notices += `\n\n${path} ${data.version} — ${name}\n${await readFile(join(directory,name),'utf8')}`;
}
await writeFile(join(root,'lib/THIRD_PARTY_LICENSES.txt'),notices);
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
for (const target of ['chromium', 'firefox']) {
  const output = join(root, 'dist', target);
  if (dirname(output) !== join(root,'dist') || !['chromium','firefox'].includes(target)) throw new Error('Unsafe output path');
  await rm(output, { recursive:true, force:true });
  await mkdir(output, { recursive: true });
  for (const name of ['background.js', 'content', 'shared', 'platforms', 'popup', 'options', 'icons', 'lib']) {
    await cp(join(root, name), join(output, name), { recursive: true });
  }
  const config = structuredClone(manifest);
  if (target === 'firefox') {
    delete config.minimum_chrome_version;
    config.background = { scripts: ['background.js'], type: 'module' };
    config.browser_specific_settings = { gecko: { id: '{f5cad0b5-9dc2-477d-852b-4bbab6ee7191}', strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } }, gecko_android: { strict_min_version: '142.0' } };
  }
  await writeFile(join(output, 'manifest.json'), JSON.stringify(config, null, 2) + '\n');
}
// Package exactly the runtime files, not node_modules, fixtures or private data.
const { zipSync } = await import('fflate');
async function entries(dir, base = '') {
  const out = {};
  for (const file of await readdir(dir, { withFileTypes: true })) {
    const name = base + file.name;
    if (file.isDirectory()) Object.assign(out, await entries(join(dir, file.name), name + '/'));
    else out[name] = new Uint8Array(await readFile(join(dir, file.name)));
  }
  return out;
}
for (const target of ['chromium', 'firefox']) {
  await writeFile(join(root, 'dist', `chat-export-for-chatgpt-${manifest.version}-${target}.zip`), zipSync(await entries(join(root, 'dist', target))));
}
const source = {};
for (const name of ['background.js','manifest.json','package.json','package-lock.json','README.md','PRIVACY.md','PUBLISHING.md']) source[name] = new Uint8Array(await readFile(join(root,name)));
for (const directory of ['content','shared','platforms','popup','options','icons','scripts']) Object.assign(source,await entries(join(root,directory),directory+'/'));
await writeFile(join(root,'dist',`chat-export-for-chatgpt-${manifest.version}-source.zip`),zipSync(source));
console.log(`Built Chromium and Firefox packages (${manifest.version}).`);
