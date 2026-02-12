const SITES = {
  'chat.openai.com': { name: 'ChatGPT', id: 'chatgpt' },
  'chatgpt.com': { name: 'ChatGPT', id: 'chatgpt' },
  'gemini.google.com': { name: 'Gemini', id: 'gemini' },
  'chat.deepseek.com': { name: 'DeepSeek', id: 'deepseek' },
  'platform.deepseek.com': { name: 'DeepSeek', id: 'deepseek' },
  'claude.ai': { name: 'Claude', id: 'claude' },
};

const states = {
  detecting: document.getElementById('detecting'),
  unsupported: document.getElementById('unsupported'),
  confirm: document.getElementById('confirm'),
  exporting: document.getElementById('exporting'),
  success: document.getElementById('success'),
  error: document.getElementById('error'),
};

function showState(name) {
  Object.values(states).forEach((el) => el.classList.remove('visible'));
  if (states[name]) states[name].classList.add('visible');
}

function showError(msg) {
  states.error.querySelector('.message').textContent = msg;
  showState('error');
}

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

async function downloadPdf(blob, filename) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  const response = await chrome.runtime.sendMessage({
    action: 'DOWNLOAD_PDF',
    dataUrl,
    filename,
  });
  if (!response?.ok) throw new Error(response?.error || 'İndirme başlatılamadı');
}

async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      showState('unsupported');
      return;
    }

    let host = '';
    try {
      host = new URL(tab.url).hostname.toLowerCase();
    } catch {
      showState('unsupported');
      return;
    }

    let site = SITES[host];
    if (!site) {
      if (host.includes('deepseek')) site = { name: 'DeepSeek', id: 'deepseek' };
      else site = Object.entries(SITES).find(([h]) => host.endsWith('.' + h))?.[1];
    }
    const siteInfo = site || null;

    if (!siteInfo) {
      showState('unsupported');
      return;
    }

    const confirmText = document.getElementById('confirmText');
    confirmText.textContent = `${siteInfo.name} için aktif chat'i PDF'e aktarmak ister misiniz?`;

    showState('confirm');

    document.getElementById('exportBtn').onclick = async () => {
      showState('exporting');
      try {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content/content.js'],
          });
        } catch (e) {
          // Zaten enjekte edilmişse hata verebilir, devam et
        }
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'EXTRACT_CHAT',
          siteId: siteInfo.id,
        });

        if (response?.error) {
          showError(response.error);
          return;
        }

        const { data } = response;
        if (typeof html2pdf === 'undefined') {
          showError('PDF kütüphanesi yüklenemedi. npm install && npm run prepare çalıştırın.');
          return;
        }

        const blob = await generatePdf(data, siteInfo.name);
        const filename = `${safeFilename(data.title)}.pdf`;
        await downloadPdf(blob, filename);

        if (states.success) {
          states.success.querySelector('.message').textContent = 'Kaydetmek istediğiniz yeri seçin.';
          showState('success');
        }
        setTimeout(() => window.close(), 800);
      } catch (err) {
        showError(err?.message || 'Bir hata oluştu. Sayfayı yenileyip tekrar deneyin.');
      }
    };
  } catch (err) {
    showError('Sayfa okunamadı. Lütfen chat sayfasında olduğunuzdan emin olun.');
  }
}

init();
