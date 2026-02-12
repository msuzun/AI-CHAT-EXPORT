function safeFilename(name) {
  return (name || 'chat').replace(/[<>:"/\\|?*]/g, '_').slice(0, 100);
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== 'RUN_CONTEXT_EXPORT') return;

  exportToFormat(msg.format, msg.data, msg.appName)
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, error: err?.message || 'Export basarisiz.' }));
  return true;
});
