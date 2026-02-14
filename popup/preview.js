function safeFilename(name) {
  let out = String(name || '').trim();
  if (!out) return 'chat_export';
  const trMap = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' };
  out = out.replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => trMap[c] || c);
  out = out
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_. ]+|[_. ]+$/g, '');

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

function htmlEscape(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

/** Batch export icin previewChats'tan exportData olusturur. Storage kesilmesine karsi guvenlik. */
function mergeChatsForExport(chats, appName) {
  const mergedMessages = [];
  (chats || []).forEach((chat, idx) => {
    const title = chat?.title || `Sohbet ${idx + 1}`;
    const sourceUrl = chat?.sourceUrl || '';
    const heading = [
      `<h2 style="margin:0 0 6px 0;">${idx + 1}. ${htmlEscape(title)}</h2>`,
      sourceUrl ? `<p style="margin:0;color:#64748b;font-size:12px;">${htmlEscape(sourceUrl)}</p>` : '',
    ].join('');
    mergedMessages.push({ role: 'meta', html: heading });
    mergedMessages.push(...(chat.messages || []));
  });
  return {
    title: `${appName} Tum Sohbetler (${(chats || []).length})`,
    messages: mergedMessages,
  };
}

async function applyThemeFromSettings() {
  try {
    const settings = await chrome.storage.sync.get({ theme: 'system' });
    const theme = settings.theme || 'system';
    const resolved =
      theme === 'system'
        ? window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    document.body.classList.toggle('theme-dark', resolved === 'dark');
  } catch (_) {}
}

async function generatePdf(data, appName, exportOptions) {
  if (!data?.messages?.length) {
    throw new Error('Export icin mesaj bulunamadi.');
  }
  const html = buildPdfHtml(data, appName, exportOptions);
  const fullDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff;">${html}</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;min-height:1122px;border:0;';
  iframe.srcdoc = fullDoc;
  document.body.appendChild(iframe);

  await new Promise((r) => {
    iframe.onload = r;
    iframe.onerror = r;
    setTimeout(r, 800);
  });

  const doc = iframe.contentDocument;
  const target = doc?.querySelector('.pdf-wrapper') || doc?.body;
  if (!target) {
    iframe.remove();
    throw new Error('PDF icerigi yuklenemedi.');
  }

  const opt = {
    margin: [12, 10, 18, 10],
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      letterRendering: true,
      logging: false,
      foreignObjectRendering: false,
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'], avoid: ['.msg-block', '.msg-content pre', '.msg-content table', '.msg-content blockquote'] },
  };

  try {
    return await html2pdf().set(opt).from(target).outputPdf('blob');
  } finally {
    iframe.remove();
  }
}

async function downloadFile(blob, filename) {
  // Yöntem 1: Blob URL + <a download> — dosya adını doğrudan belirler
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

function renderChatPreview(chat, format, appName, exportOptions) {
  if (format === 'markdown') {
    return `<div class="chat-card"><div class="plain-preview">${htmlEscape(buildMarkdownText(chat, appName, exportOptions))}</div></div>`;
  }
  if (format === 'txt') {
    return `<div class="chat-card"><div class="plain-preview">${htmlEscape(buildPlainText(chat, appName, exportOptions))}</div></div>`;
  }

  const base = buildBaseHtml(chat, appName, exportOptions);
  const urlLine = chat.sourceUrl ? `<p>${htmlEscape(chat.sourceUrl)}</p>` : '';
  return `<div class="chat-card">
    <div class="chat-meta">
      <h2>${htmlEscape(chat.title || `${appName} Sohbet`)}</h2>
      ${urlLine}
    </div>
    ${base.blocks}
  </div>`;
}

async function init() {
  await applyThemeFromSettings();

  const titleEl = document.getElementById('title');
  const subtitleEl = document.getElementById('subtitle');
  const pagerEl = document.getElementById('pager');
  const pageInfoEl = document.getElementById('pageInfo');
  const previewEl = document.getElementById('previewContainer');
  const statusEl = document.getElementById('status');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const confirmBtn = document.getElementById('confirmBtn');
  const cancelBtn = document.getElementById('cancelBtn');

  const params = new URLSearchParams(location.search);
  const token = params.get('token');
  if (!token) {
    statusEl.textContent = 'Onizleme verisi bulunamadi.';
    return;
  }

  const response = await chrome.runtime.sendMessage({
    action: 'PREVIEW_GET_PAYLOAD',
    token,
  });
  if (!response?.ok || !response?.payload) {
    statusEl.textContent = response?.error || 'Onizleme verisi yuklenemedi.';
    return;
  }

  const payload = response.payload;
  const exportOptions = normalizeExportOptions(payload.exportOptions);
  const previewChats = Array.isArray(payload.previewChats) ? payload.previewChats : [];
  const total = previewChats.length || 1;
  let page = 0;

  titleEl.textContent = `${payload.appName} - ${payload.format.toUpperCase()} Onizleme`;
  subtitleEl.textContent =
    payload.scope === 'all'
      ? `Toplu export onizlemesi (${total} sohbet).`
      : 'Aktif sohbet onizlemesi.';

  function updatePager() {
    const enabled = total > 1;
    pagerEl.classList.toggle('hidden', !enabled);
    pageInfoEl.textContent = `${page + 1} / ${total}`;
    prevBtn.disabled = page <= 0;
    nextBtn.disabled = page >= total - 1;
  }

  function render() {
    const chat = previewChats[page] || payload.exportData;
    previewEl.innerHTML = renderChatPreview(chat, payload.format, payload.appName, exportOptions);
    updatePager();
  }

  prevBtn.onclick = () => {
    if (page > 0) {
      page -= 1;
      render();
    }
  };

  nextBtn.onclick = () => {
    if (page < total - 1) {
      page += 1;
      render();
    }
  };

  cancelBtn.onclick = async () => {
    try {
      await chrome.runtime.sendMessage({ action: 'PREVIEW_CLEAR_PAYLOAD', token });
    } catch (_) {}
    window.close();
  };

  confirmBtn.onclick = async () => {
    confirmBtn.disabled = true;
    statusEl.textContent = 'Export baslatiliyor...';
    try {
      let dataToExport = payload.exportData;
      if (Array.isArray(previewChats) && previewChats.length > 1) {
        dataToExport = mergeChatsForExport(previewChats, payload.appName);
      }
      await exportToFormat(payload.format, dataToExport, payload.appName, exportOptions);
      statusEl.textContent = `${payload.infoText || 'Export tamamlandi.'} Pencereyi simdi kapatabilirsiniz.`;
      await chrome.runtime.sendMessage({ action: 'PREVIEW_CLEAR_PAYLOAD', token });
    } catch (err) {
      confirmBtn.disabled = false;
      statusEl.textContent = err?.message || 'Export basarisiz.';
    }
  };

  render();
}

init().catch((err) => {
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = err?.message || 'Onizleme baslatilamadi.';
});
