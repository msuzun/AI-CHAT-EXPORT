function safeFilename(name) {
  let out = String(name || '').trim();
  if (!out) return 'chat_export';
  // Türkçe karakter dönüşümü
  const trMap = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' };
  out = out.replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => trMap[c] || c);
  out = out
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')          // combining diacriticals
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')    // control chars
    .replace(/[<>:"/\\|?*]/g, '_')            // dosya adı yasakları
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[^\x20-\x7E]/g, '')             // kalan non-ASCII sil (underscore değil)
    .replace(/\s+/g, '_')                     // boşluk → _
    .replace(/_+/g, '_')                      // tekrarlı _ temizle
    .replace(/^[_. ]+|[_. ]+$/g, '');         // baş/son _ . sil

  if (!out || out.length < 2) out = 'chat_export';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(out)) out = `export_${out}`;
  return out.slice(0, 80);
}

function formatDateStampForFilename(iso) {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hh}-${mi}`;
}

function buildExportBaseName(title, exportOptions) {
  const base = safeFilename(title);
  const mode = exportOptions?.dateStampMode || 'none';
  if (mode !== 'filename' && mode !== 'both') return base;
  const stamp = formatDateStampForFilename(exportOptions?.exportedAt);
  return stamp ? `${base}_${stamp}` : base;
}

function normalizeExportOptions(options) {
  return {
    messageFilter: options?.messageFilter || 'all',
    labelLanguage: options?.labelLanguage || 'tr',
    dateStampMode: options?.dateStampMode || 'none',
    dateRangeStart: options?.dateRangeStart || '',
    dateRangeEnd: options?.dateRangeEnd || '',
    syntaxHighlight: options?.syntaxHighlight !== false,
    exportedAt: options?.exportedAt || new Date().toISOString(),
  };
}

async function generatePdf(data, appName, exportOptions) {
  const container = document.getElementById('pdfContainer');
  if (!container) throw new Error('PDF konteyneri bulunamadi.');
  const html = buildPdfHtml(data, appName, exportOptions);
  container.innerHTML = html;

  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 250));

  const wrapper = container.querySelector('.pdf-wrapper');
  const target = wrapper || container;
  const clone = target.cloneNode(true);
  clone.id = '';
  clone.style.cssText =
    'position:fixed;left:0;top:0;width:794px;min-height:1122px;background:#fff;color:#1e293b;opacity:1;z-index:2147483647;pointer-events:none;visibility:visible;';
  document.body.appendChild(clone);

  const opt = {
    margin: [12, 10, 18, 10],
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'], avoid: ['.msg-block', '.msg-content pre', '.msg-content table', '.msg-content blockquote'] },
  };

  try {
    return await html2pdf().set(opt).from(clone).outputPdf('blob');
  } finally {
    if (clone.parentNode) clone.parentNode.removeChild(clone);
  }
}

async function downloadFile(blob, filename) {
  // Yöntem 1: Blob URL + <a download>
  try {
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || 'chat_export';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
    return;
  } catch (_) {}

  // Yöntem 2: Background script üzerinden (fallback)
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  if (filename) {
    const r1 = await chrome.runtime.sendMessage({ action: 'DOWNLOAD_FILE', dataUrl, filename });
    if (r1?.ok) return;
  }

  const ext = (filename || '').split('.').pop() || 'txt';
  const fallback = `chat_export_${Date.now()}.${ext}`;
  const r2 = await chrome.runtime.sendMessage({ action: 'DOWNLOAD_FILE', dataUrl, filename: fallback });
  if (r2?.ok) return;

  const r3 = await chrome.runtime.sendMessage({ action: 'DOWNLOAD_FILE', dataUrl });
  if (!r3?.ok) throw new Error(r3?.error || 'Indirme baslatilamadi');
}

async function exportToFormat(format, data, appName, exportOptions) {
  const baseName = buildExportBaseName(data.title, exportOptions);
  switch (format) {
    case 'pdf': {
      if (typeof html2pdf === 'undefined') throw new Error('PDF kutuphanesi yuklenemedi.');
      const blob = await generatePdf(data, appName, exportOptions);
      return downloadFile(blob, `${baseName}.pdf`);
    }
    case 'markdown': {
      const blob = exportMarkdown(data, appName, exportOptions);
      return downloadFile(blob, `${baseName}.md`);
    }
    case 'word': {
      const blob = exportWord(data, appName, exportOptions);
      return downloadFile(blob, `${baseName}.doc`);
    }
    case 'html': {
      const blob = exportHtml(data, appName, exportOptions);
      return downloadFile(blob, `${baseName}.html`);
    }
    case 'txt': {
      const blob = exportPlainText(data, appName, exportOptions);
      return downloadFile(blob, `${baseName}.txt`);
    }
    default:
      throw new Error('Desteklenmeyen format.');
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== 'RUN_CONTEXT_EXPORT') return;

  const exportOptions = normalizeExportOptions(msg.exportOptions);
  exportToFormat(msg.format, msg.data, msg.appName, exportOptions)
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, error: err?.message || 'Export basarisiz.' }));
  return true;
});
