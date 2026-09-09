import { readFile } from 'node:fs/promises';

// jsPDF's optional external viewers are unused: pdf-engine.js exports a Blob.
// Remove their implementations before bundling, not just their default URLs.
export function stripExternalViewers(source) {
  const start = '      case "pdfobjectnewwindow":';
  const end = '      case "dataurlnewwindow":';
  if (source.split(start).length !== 2 || source.split(end).length !== 2) {
    throw new Error('jsPDF output implementation changed; review the local-only patch.');
  }
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (to < from || !source.slice(from, to).includes('case "pdfjsnewwindow":')) {
    throw new Error('jsPDF external viewer boundaries changed.');
  }
  return source.slice(0, from) + source.slice(to);
}

export const localOnlyPdfPlugin = {
  name: 'local-only-jspdf',
  setup(bundler) {
    bundler.onLoad({ filter: /jspdf[\\/]dist[\\/]jspdf\.es(?:\.min)?\.js$/ }, async ({ path }) => ({
      contents: stripExternalViewers(await readFile(path.replace(/\.min\.js$/, '.js'), 'utf8')),
      loader: 'js',
    }));
  },
};

export function assertLocalPdfBundle(source) {
  for (const forbidden of [/pdfobjectnewwindow/i, /pdfobject\.min\.js/i, /pdfObjectUrl/, /pdfObjectScript/, /pdfjsnewwindow/i, /pdfJsUrl/, /PDFViewerApplication/,
    /https?:\/\/[^\s"'<>`]+\.(?:m?js|wasm)(?:[?#][^\s"'<>`]*)?(?=[\s"'<>`]|$)/i]) {
    if (forbidden.test(source)) throw new Error(`External PDF code detected: ${forbidden}`);
  }
}
