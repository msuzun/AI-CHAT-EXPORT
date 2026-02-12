function safeFilename(name) {
  return (name || 'chat').replace(/[<>:"/\\|?*]/g, '_').slice(0, 100);
}

function htmlEscape(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

async function generatePdf(data, appName) {
  const container = document.getElementById('pdfContainer');
  const html = buildPdfHtml(data, appName);
  container.innerHTML = html;
  await new Promise((r) => setTimeout(r, 150));

  const opt = {
    margin: [12, 10, 18, 10],
    filename: `${safeFilename(data.title)}.pdf`,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'], avoid: ['.msg-block'] },
  };

  const target = container.querySelector('.pdf-wrapper') || container;
  return html2pdf().set(opt).from(target).outputPdf('blob');
}

async function downloadFile(blob, filename) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const response = await chrome.runtime.sendMessage({
    action: 'DOWNLOAD_FILE',
    dataUrl,
    filename,
  });
  if (!response?.ok) throw new Error(response?.error || 'Indirme baslatilamadi');
}

async function exportToFormat(format, data, appName) {
  const baseName = safeFilename(data.title);
  switch (format) {
    case 'pdf': {
      if (typeof html2pdf === 'undefined') throw new Error('PDF kutuphanesi yuklenemedi.');
      const blob = await generatePdf(data, appName);
      return downloadFile(blob, `${baseName}.pdf`);
    }
    case 'markdown': {
      const blob = exportMarkdown(data, appName);
      return downloadFile(blob, `${baseName}.md`);
    }
    case 'word': {
      const blob = exportWord(data, appName);
      return downloadFile(blob, `${baseName}.doc`);
    }
    case 'html': {
      const blob = exportHtml(data, appName);
      return downloadFile(blob, `${baseName}.html`);
    }
    case 'txt': {
      const blob = exportPlainText(data, appName);
      return downloadFile(blob, `${baseName}.txt`);
    }
    default:
      throw new Error('Desteklenmeyen format.');
  }
}

function renderChatPreview(chat, format, appName) {
  if (format === 'markdown') {
    return `<div class="chat-card"><div class="plain-preview">${htmlEscape(buildMarkdownText(chat, appName))}</div></div>`;
  }
  if (format === 'txt') {
    return `<div class="chat-card"><div class="plain-preview">${htmlEscape(buildPlainText(chat, appName))}</div></div>`;
  }

  const base = buildBaseHtml(chat, appName);
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
    previewEl.innerHTML = renderChatPreview(chat, payload.format, payload.appName);
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
      await exportToFormat(payload.format, payload.exportData, payload.appName);
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
