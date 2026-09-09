/** Shared and verified PDF renderer for every export entry point. */
(function () {
  function hasExportableMessages(data, options) {
    const filter = options?.messageFilter || 'all';
    return (data?.messages || []).some((message) => {
      if (!message) return false;
      if (message.role !== 'meta' && filter !== 'all' && message.role !== filter) return false;
      const probe = document.createElement('div');
      probe.replaceChildren(DOMPurify.sanitize(message.html || '', { RETURN_DOM_FRAGMENT: true, FORCE_BODY: true, ADD_TAGS: ['style'] }));
      probe.querySelectorAll('script,style,svg,[hidden],[aria-hidden="true"]').forEach((el) => el.remove());
      const text = (probe.textContent || '').replace(/\s+/g, ' ').trim();
      return text.length > 0 || !!probe.querySelector('img,picture,canvas,math,table,pre,code,ul,ol,blockquote');
    });
  }

  function waitForImages(root) {
    return Promise.all(Array.from(root.querySelectorAll('img')).map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
        setTimeout(done, 2500);
      });
    }));
  }

  function replaceBrokenMedia(root) {
    root.querySelectorAll('input,textarea,select,option').forEach((control) => control.remove());
    root.querySelectorAll('button,[role="button"]').forEach((control) => {
      const text = (control.textContent || '').replace(/\s+/g, ' ').trim();
      const hasMedia = !!control.querySelector('img,[data-export-attachment],a[href]');
      if (!hasMedia && !/\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip)\b/i.test(text)) {
        control.remove();
        return;
      }
      const replacement = document.createElement('span');
      while (control.firstChild) replacement.appendChild(control.firstChild);
      control.replaceWith(replacement);
    });
    root.querySelectorAll('img').forEach((img) => {
      img.removeAttribute('width');
      img.removeAttribute('height');
      img.removeAttribute('srcset');
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.objectFit = 'contain';
      if (img.naturalWidth > 0 && img.naturalHeight > 0) return;
      const placeholder = document.createElement('span');
      placeholder.setAttribute('data-export-attachment', 'true');
      placeholder.textContent = `📎 ${img.alt || img.title || 'Gorsel yuklenemedi'}`;
      img.replaceWith(placeholder);
    });
    root.querySelectorAll('canvas,video').forEach((media) => {
      const placeholder = document.createElement('span');
      placeholder.setAttribute('data-export-attachment', 'true');
      placeholder.textContent = `📎 ${media.getAttribute('aria-label') || media.title || 'Medya eki'}`;
      media.replaceWith(placeholder);
    });
  }

  function waitForLayout() {
    return new Promise((resolve) => {
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        resolve();
      };
      requestAnimationFrame(() => requestAnimationFrame(done));
      // requestAnimationFrame is throttled in inactive extension tabs.
      setTimeout(done, 120);
    });
  }

  function canvasHasVisibleInk(canvas) {
    if (!canvas || canvas.width < 2 || canvas.height < 2) return false;
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const count = canvas.width * canvas.height;
      const step = Math.max(1, Math.floor(count / 250000));
      let ink = 0;
      for (let pixel = 0; pixel < count; pixel += step) {
        const i = pixel * 4;
        if (pixels[i + 3] > 16 && (pixels[i] < 220 || pixels[i + 1] < 220 || pixels[i + 2] < 220)) {
          if (++ink >= 12) return true;
        }
      }
      return false;
    } catch (_) {
      // Cross-origin media can prevent pixel reads; dimensions still prove rendering ran.
      return canvas.width > 100 && canvas.height > 100;
    }
  }

  function makePlainFallback(data, appName, options) {
    const filter = options?.messageFilter || 'all';
    const language = options?.labelLanguage || 'tr';
    const title = data?.title || `${appName || 'AI'} Sohbet`;
    const rows = (data?.messages || [])
      .filter((message) => message && (message.role === 'meta' || filter === 'all' || message.role === filter))
      .map((message) => {
        const probe = document.createElement('div');
        probe.replaceChildren(DOMPurify.sanitize(message.html || '', { RETURN_DOM_FRAGMENT: true, FORCE_BODY: true, ADD_TAGS: ['style'] }));
        const text = (probe.innerText || probe.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
        if (!text) return '';
        const label = message.role === 'meta' ? '' : message.role === 'user'
          ? (language === 'en' ? 'User' : 'Kullanici')
          : (language === 'en' ? 'Assistant' : 'Asistan');
        return `<section style="display:block;margin:0 0 18px;padding:14px;border-left:4px solid #cbd5e1;background:#f8fafc;color:#111827;page-break-inside:auto;break-inside:auto;">${label ? `<div style="font-weight:700;margin-bottom:8px;color:#334155;">${escapeHtml(label)}</div>` : ''}<div style="white-space:pre-wrap;color:#111827;">${escapeHtml(text)}</div></section>`;
      }).join('');
    return `<div style="display:block;width:746px;box-sizing:border-box;padding:24px;background:#fff;color:#111827;font-family:Arial,sans-serif;font-size:14px;line-height:1.55;"><h1 style="display:block;color:#111827;font-size:22px;margin:0 0 22px;">${escapeHtml(title)}</h1>${rows}</div>`;
  }

  function createHost(html) {
    const host = document.createElement('div');
    host.dataset.pdfRenderHost = 'true';
    host.style.cssText = 'position:absolute;display:block;left:0;top:0;width:794px;min-height:1122px;margin:0;padding:0;background:#fff;color:#111827;opacity:1;visibility:visible;overflow:visible;z-index:2147483647;pointer-events:none;';
    host.replaceChildren(DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true, FORCE_BODY: true, ADD_TAGS: ['style'] }));
    document.body.appendChild(host);
    return host;
  }

  function buildRenderGroups(target) {
    const children = Array.from(target.children).filter((element) => element.tagName !== 'STYLE');
    const groups = [];
    let current = [];
    let currentHeight = 0;
    for (const child of children) {
      const height = Math.max(1, Math.ceil(child.getBoundingClientRect().height));
      if (current.length && currentHeight + height > 1040) {
        groups.push(current);
        current = [];
        currentHeight = 0;
      }
      current.push(child);
      currentHeight += height;
      if (height > 1040) {
        groups.push(current);
        current = [];
        currentHeight = 0;
      }
    }
    if (current.length) groups.push(current);
    return groups;
  }

  function appendCanvasPages(pdf, canvas) {
    const pagePixelHeight = Math.max(1, Math.floor(canvas.width * (297 / 210)));
    for (let offset = 0; offset < canvas.height; offset += pagePixelHeight) {
      const sliceHeight = Math.min(pagePixelHeight, canvas.height - offset);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = pagePixelHeight;
      const context = pageCanvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      pdf.addPage('a4', 'portrait');
      pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    }
  }

  // Choose page boundaries between text lines and small media where possible.
  // The canvas itself stays page-sized even for a single enormous prompt.
  function pageSlices(unit) {
    const top = unit.getBoundingClientRect().top;
    const boxes = [];
    const walker = document.createTreeWalker(unit, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (!walker.currentNode.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      for (const rect of range.getClientRects()) boxes.push({ top: rect.top - top, bottom: rect.bottom - top });
    }
    unit.querySelectorAll('img,tr').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.height < 1000) boxes.push({ top: rect.top - top, bottom: rect.bottom - top });
    });
    const height = Math.ceil(unit.scrollHeight);
    const slices = [];
    for (let offset = 0; offset < height;) {
      let end = Math.min(height, offset + 1122);
      if (end < height) {
        for (let attempt = 0; attempt < 12; attempt++) {
          const crossing = boxes.filter((box) => box.top < end && box.bottom > end && box.top > offset + 100);
          if (!crossing.length) break;
          end = Math.floor(Math.min(...crossing.map((box) => box.top)));
        }
      }
      slices.push({ offset, height: end - offset });
      offset = end;
    }
    return slices;
  }

  async function renderAttempt(html) {
    const host = createHost(html);
    const target = host.querySelector('.pdf-wrapper') || host.firstElementChild || host;
    try {
      await waitForImages(target);
      replaceBrokenMedia(target);
      try { await document.fonts?.ready; } catch (_) {}
      await waitForLayout();
      const rect = target.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) throw new Error('PDF render hedefi boyutsuz kaldi.');

      // Rendering the whole conversation exceeds Chromium's canvas limit;
      // translating fixed-height slices can omit content. Render consecutive
      // message groups instead and append every resulting canvas in order.
      const groups = buildRenderGroups(target);
      if (!groups.length) return null;
      const styleNodes = Array.from(host.querySelectorAll('style')).map((style) => style.cloneNode(true));
      let pdf = null;
      let hasInk = false;
      host.replaceChildren(DOMPurify.sanitize('', { RETURN_DOM_FRAGMENT: true, FORCE_BODY: true, ADD_TAGS: ['style'] }));
      for (let index = 0; index < groups.length; index += 1) {
        host.replaceChildren(...styleNodes.map((style) => style.cloneNode(true)));
        const unit = target.cloneNode(false);
        unit.style.width = '794px';
        unit.style.maxWidth = '794px';
        unit.style.minHeight = '0';
        groups[index].forEach((element) => unit.appendChild(element.cloneNode(true)));
        host.appendChild(unit);
        await waitForLayout();
        await waitForImages(unit);
        for (const slice of pageSlices(unit)) {
          const worker = html2pdf().set({
            margin: 0,
            image: { type: 'jpeg', quality: 0.96 },
            html2canvas: {
              scale: 1.5, useCORS: true, allowTaint: false,
              width: 794, height: slice.height, y: slice.offset,
              scrollX: 0, scrollY: 0,
              backgroundColor: '#ffffff', letterRendering: true, logging: false,
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
            pagebreak: { mode: [] },
          }).from(unit).toCanvas();
          const canvas = await worker.get('canvas');
          if (!canvas || canvas.width < 2 || canvas.height < 1) throw new Error('PDF sayfası çizilemedi.');
          hasInk = canvasHasVisibleInk(canvas) || hasInk;
          if (!pdf) {
            pdf = await worker.toPdf().get('pdf');
          } else {
            appendCanvasPages(pdf, canvas);
          }
        }
      }

      if (!pdf || !hasInk) return null;
      const blob = pdf.output('blob');
      return blob instanceof Blob && blob.size >= 1000 ? blob : null;
    } finally {
      host.remove();
    }
  }

  async function generateVerifiedPdf(data, appName, exportOptions) {
    if (typeof html2pdf === 'undefined') throw new Error('PDF kutuphanesi yuklenemedi.');
    if (!hasExportableMessages(data, exportOptions)) {
      throw new Error('Export edilecek gorunur sohbet mesaji bulunamadi. Sayfayi yenileyip tekrar deneyin.');
    }
    const richHtml = buildPdfHtml(data, appName, exportOptions);
    const probe = document.createElement('div');
    probe.replaceChildren(DOMPurify.sanitize(richHtml, { RETURN_DOM_FRAGMENT: true, FORCE_BODY: true, ADD_TAGS: ['style'] }));
    const containsMedia = !!probe.querySelector('img,[data-export-attachment]');
    let blob = await renderAttempt(richHtml);
    if (!blob && !containsMedia) blob = await renderAttempt(makePlainFallback(data, appName, exportOptions));
    if (!blob) throw new Error('Bos PDF olusumu engellendi. HTML veya Markdown exportunu deneyin.');
    return blob;
  }

  globalThis.generateVerifiedPdf = generateVerifiedPdf;
})();
