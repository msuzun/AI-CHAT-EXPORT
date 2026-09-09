(function () {
  if (globalThis.__chatgptExportLoaded) return;
  globalThis.__chatgptExportLoaded = true;
  let collectingHistory = false;
  const historyNodeIds = new WeakMap();
  let historyNodeSequence = 0;
  async function imageToBase64(url) {
    if (!url || url.startsWith('data:')) return url;
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'include', signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) throw new Error('Gorsel olmayan medya');
      return await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    } catch {
      try {
        const response = await Ext.runtime.sendMessage({ action: 'FETCH_MEDIA_DATA_URL', url });
        if (response?.ok && response.dataUrl?.startsWith('data:image/')) return response.dataUrl;
      } catch (_) {}
      return '';
    }
  }

  async function imageElementToBase64(img) {
    if (!img) return '';
    const srcset = img.getAttribute('srcset') || img.closest('picture')?.querySelector('source[srcset]')?.getAttribute('srcset') || '';
    const srcsetCandidate = srcset.split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean).pop() || '';
    const src =
      img.currentSrc ||
      img.getAttribute('src') ||
      img.getAttribute('data-src') ||
      img.getAttribute('data-original') ||
      srcsetCandidate ||
      img.src ||
      '';
    if (!src) return '';

    // Prefer an embedded source over a screenshot of the displayed thumbnail.
    const original = img.getAttribute('data-original') || img.getAttribute('data-src') || src;
    try {
      const dataUrl = await imageToBase64(original);
      if (dataUrl?.startsWith('data:image/')) return dataUrl;
    } catch (_) {}

    try {
      if (!img.complete) {
        await new Promise((resolve) => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          setTimeout(done, 2000);
        });
      }
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (w > 0 && h > 0) {
        const scale = Math.min(1, 1800 / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const snapshot = canvasElementToDataUrl(canvas);
          if (snapshot) return snapshot;
        }
      }
    } catch (_) {}

    try {
      const base64 = await imageToBase64(src);
      if (base64 && base64.startsWith('data:image/')) return await normalizeImageDataUrl(base64);
    } catch (_) {}

    return '';
  }

  function canvasElementToDataUrl(canvas) {
    if (!canvas) return '';
    try {
      if (!canvas.width || !canvas.height) return '';
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const pixels = ctx?.getImageData(0, 0, canvas.width, canvas.height)?.data;
      if (pixels) {
        const pixelCount = canvas.width * canvas.height;
        const step = Math.max(1, Math.floor(pixelCount / 100000));
        let visible = 0;
        for (let pixel = 0; pixel < pixelCount; pixel += step) {
          const i = pixel * 4;
          if (pixels[i + 3] > 16) {
            visible += 1;
            if (visible >= 8) break;
          }
        }
        if (visible < 8) return '';
      }
      return canvas.toDataURL('image/png');
    } catch (_) {
      return '';
    }
  }

  async function normalizeImageDataUrl(dataUrl) {
    return await new Promise((resolve) => {
      const image = new Image();
      const timeout = setTimeout(() => resolve(''), 8000);
      image.onload = () => {
        clearTimeout(timeout);
        try {
          const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvasElementToDataUrl(canvas));
        } catch (_) {
          resolve('');
        }
      };
      image.onerror = () => { clearTimeout(timeout); resolve(''); };
      image.src = dataUrl;
    });
  }

  function svgElementToDataUrl(svg) {
    try {
      const box = svg.viewBox?.baseVal;
      const width = box?.width || Number.parseFloat(svg.getAttribute('width')) || svg.getBoundingClientRect().width;
      const height = box?.height || Number.parseFloat(svg.getAttribute('height')) || svg.getBoundingClientRect().height;
      if (width < 80 || height < 80) return '';
      const xml = new XMLSerializer().serializeToString(svg);
      return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;
    } catch (_) {
      return '';
    }
  }

  function makeMediaPlaceholder(source, fallbackLabel) {
    const span = document.createElement('span');
    span.setAttribute('data-export-attachment', 'true');
    const label =
      source?.getAttribute?.('alt') ||
      source?.getAttribute?.('title') ||
      source?.closest?.('a')?.getAttribute?.('download') ||
      source?.closest?.('a')?.textContent?.trim() ||
      fallbackLabel ||
      'Ek';
    span.textContent = `📎 ${label}`;
    const href = source?.closest?.('a')?.href || source?.getAttribute?.('src') || '';
    if (href && !href.startsWith('blob:') && !href.startsWith('data:')) span.setAttribute('data-export-href', href);
    return span;
  }

  async function hydrateLazyMedia(root) {
    const media = Array.from(root.querySelectorAll('img,picture,canvas,video'));
    if (!media.length) return;
    if (collectingHistory) {
      // History controls scrolling. Media must not move the viewport underneath
      // the collector and unmount turns before their content is captured.
      root.querySelectorAll('img').forEach((img) => { img.loading = 'eager'; });
      return;
    }
    const scrollingElement = document.scrollingElement;
    const savedWindow = { x: window.scrollX, y: window.scrollY };
    const savedScrollers = new Map();
    media.forEach((element) => {
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        if (parent.scrollHeight > parent.clientHeight || parent.scrollWidth > parent.clientWidth) {
          if (!savedScrollers.has(parent)) savedScrollers.set(parent, { left: parent.scrollLeft, top: parent.scrollTop });
        }
        parent = parent.parentElement;
      }
    });
    if (scrollingElement) savedScrollers.set(scrollingElement, { left: scrollingElement.scrollLeft, top: scrollingElement.scrollTop });

    try {
      for (const element of media) {
        const image = element.tagName === 'PICTURE' ? element.querySelector('img') : element.tagName === 'IMG' ? element : null;
        if (image) image.loading = 'eager';
        try { element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); } catch (_) {}
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (image && (!image.complete || !image.naturalWidth)) {
          await new Promise((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              resolve();
            };
            image.addEventListener('load', finish, { once: true });
            image.addEventListener('error', finish, { once: true });
            setTimeout(finish, 1200);
          });
        } else {
          await new Promise((resolve) => setTimeout(resolve, 80));
        }
      }
    } finally {
      savedScrollers.forEach((position, element) => {
        element.scrollLeft = position.left;
        element.scrollTop = position.top;
      });
      window.scrollTo(savedWindow.x, savedWindow.y);
    }
  }

  function hasMeaningfulNodeContent(node) {
    if (!node) return false;
    const clone = node.cloneNode(true);
    clone.querySelectorAll?.('button, nav, form, script, style, svg, [aria-hidden="true"]').forEach((el) => el.remove());
    const plain = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    const roleOnly = /^(kullanici|asistan|assistant|user|you|chatgpt)$/i.test(plain);
    if (plain && !roleOnly) return true;
    return !!clone.querySelector?.('img, picture, video, canvas, math, table, pre, code, blockquote, ul, ol, li');
  }

  function hasMeaningfulHtmlContent(html) {
    const div = document.createElement('div');
    div.replaceChildren(DOMPurify.sanitize(html || '', { RETURN_DOM_FRAGMENT: true, FORCE_BODY: true, ADD_TAGS: ['style'] }));
    return hasMeaningfulNodeContent(div);
  }

  function sanitizeExtractedHtml(html) {
    const div = document.createElement('div');
    div.replaceChildren(DOMPurify.sanitize(html || '', { RETURN_DOM_FRAGMENT: true, FORCE_BODY: true, ADD_TAGS: ['style'] }));
    div.querySelectorAll?.(
      [
        'script',
        'style',
        'iframe',
        'object',
        'embed',
        'link',
        'meta',
        'nav',
        'form',
        '.sr-only',
        'svg',
        '[aria-hidden="true"]',
        '[class*="skeleton"]',
        '[class*="loading"]',
        '[class*="spinner"]',
        '[class*="typing"]',
        '[data-state="loading"]',
      ].join(',')
    ).forEach((el) => el.remove());
    div.querySelectorAll?.('input,textarea,select,option').forEach((el) => el.remove());
    div.querySelectorAll?.('button,[role="button"]').forEach((el) => {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const hasExportableMedia = !!el.querySelector('img,[data-export-attachment],a[href]');
      if (!hasExportableMedia && !/\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip)\b/i.test(text)) {
        el.remove();
        return;
      }
      const replacement = document.createElement('span');
      const isAttachment = /\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip|rar|7z)\b/i.test(text) ||
        /attachment|file/i.test(`${el.getAttribute('data-testid') || ''} ${el.getAttribute('aria-label') || ''}`);
      if (isAttachment) replacement.setAttribute('data-export-attachment', 'true');
      while (el.firstChild) replacement.appendChild(el.firstChild);
      el.replaceWith(replacement);
    });
    div.querySelectorAll('*').forEach((el) => {
      const preserveWhitespace = /whitespace-pre/.test(el.className || '') || el.style.whiteSpace.startsWith('pre');
      const classes = (el.getAttribute('class') || '').split(/\s+/).filter((c) => /^(language-|lang-|katex)/.test(c));
      el.removeAttribute('class');
      el.removeAttribute('style');
      el.removeAttribute('hidden');
      if (classes.length) el.className = classes.join(' ');
      if (preserveWhitespace) el.setAttribute('data-export-whitespace', 'true');
      if (el.tagName === 'DETAILS') el.setAttribute('open', '');
      for (const attr of Array.from(el.attributes)) {
        if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
        if (['href','src','xlink:href','action','formaction'].includes(attr.name)) {
          try {
            const url = new URL(attr.value, location.href);
            if (!['https:', 'http:', 'mailto:'].includes(url.protocol) && !(el.tagName === 'IMG' && /^data:image\/(png|jpeg|webp|gif|svg\+xml)[;,]/i.test(attr.value))) el.removeAttribute(attr.name);
          } catch (_) { el.removeAttribute(attr.name); }
        }
      }
    });
    return div.innerHTML;
  }

  function inferRoleFromNode(node) {
    if (!node) return 'assistant';
    const holder = node.closest?.('[data-message-author-role], [data-role], article, [class*="message"], [class*="Message"]') || node.parentElement;
    const explicit =
      holder?.getAttribute?.('data-message-author-role') ||
      holder?.getAttribute?.('data-role') ||
      holder?.querySelector?.('[data-message-author-role]')?.getAttribute?.('data-message-author-role');
    if (explicit === 'user') return 'user';
    const cls = `${holder?.className || ''}`.toLowerCase();
    if (cls.includes('user')) return 'user';
    return 'assistant';
  }

  function scoreMessages(messages) {
    const list = Array.isArray(messages) ? messages : [];
    let textLen = 0;
    let richCount = 0;
    for (const m of list) {
      const div = document.createElement('div');
      div.replaceChildren(DOMPurify.sanitize(m?.html || '', { RETURN_DOM_FRAGMENT: true, FORCE_BODY: true, ADD_TAGS: ['style'] }));
      const txt = (div.textContent || '').replace(/\s+/g, ' ').trim();
      textLen += txt.length;
      if (div.querySelector('img, picture, video, canvas, math, table, pre, code, ul, ol, li, blockquote')) {
        richCount += 1;
      }
    }
    return { count: list.length, textLen, richCount, total: textLen + richCount * 80 + list.length * 20 };
  }

  function isWeakExtraction(messages) {
    const s = scoreMessages(messages);
    if (!s.count) return true;
    if (s.count === 1 && s.textLen < 40 && s.richCount === 0) return true;
    return s.total < 90;
  }

  async function extractChatGPTFallback() {
    const candidates = Array.from(
      document.querySelectorAll(
        [
          '[data-message-content]',
          '[data-testid*="conversation-turn-content"]',
          'article [class*="markdown"]',
          'article .markdown',
          '[class*="ConversationItem"] [class*="markdown"]',
          '[class*="prose"]',
        ].join(',')
      )
    );

    const out = [];
    const seen = new Set();

    for (const content of candidates) {
      if (!hasMeaningfulNodeContent(content)) continue;
      const rawHtml = await serializeWithImages(content);
      const html = sanitizeExtractedHtml(rawHtml);
      if (!hasMeaningfulHtmlContent(html)) continue;

      const key = ((content.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240) + '|' + html.length).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        role: inferRoleFromNode(content),
        html,
        timestamp: extractTimestampFromElement(content) || extractTimestampFromElement(content.parentElement),
      });
    }

    return out;
  }

  function pickFirstMeaningful(root, selectors) {
    if (!root) return null;
    for (const sel of selectors) {
      const el = root.querySelector?.(sel);
      if (el && hasMeaningfulNodeContent(el)) return el;
    }
    return null;
  }

  function blobToDataUrl(blob, fallbackType) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        if (fallbackType && result.startsWith('data:application/octet-stream')) {
          resolve(result.replace('data:application/octet-stream', `data:${fallbackType}`));
        } else {
          resolve(result);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  let sessionToken = '';
  async function chatGptFetch(path) {
    const request = () => fetch(path, {
      credentials: 'include', signal: AbortSignal.timeout(12000),
      headers: { Accept: 'application/json', ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) },
    });
    let response = await request();
    if (response.status === 401 && !sessionToken) {
      const session = await fetch('/api/auth/session', { credentials: 'include', signal: AbortSignal.timeout(8000) });
      if (session.ok) sessionToken = (await session.json()).accessToken || '';
      if (sessionToken) response = await request();
    }
    return response;
  }

  async function fetchChatGptAsset(assetPointer, mimeType) {
    const rawPointer = String(assetPointer?.url || assetPointer || '').trim();
    if (/^https?:\/\//i.test(rawPointer)) return await imageToBase64(rawPointer);
    const fileId = rawPointer.replace(/^(?:file-service|sediment):\/\//, '').trim();
    if (!fileId || !/^file-[a-z0-9_-]+$/i.test(fileId)) return '';
    const endpoints = [
      `/backend-api/files/${encodeURIComponent(fileId)}/download`,
      `/backend-api/files/${encodeURIComponent(fileId)}`,
    ];
    for (const endpoint of endpoints) {
      try {
        const response = await chatGptFetch(endpoint);
        if (!response.ok) continue;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const payload = await response.json();
          const downloadUrl = payload.download_url || payload.url || payload.signed_url;
          if (downloadUrl) {
            const dataUrl = await imageToBase64(downloadUrl);
            if (dataUrl) return dataUrl;
          }
          continue;
        }
        const blob = await response.blob();
        if (blob.size && (blob.type.startsWith('image/') || String(mimeType || '').startsWith('image/'))) {
          return await blobToDataUrl(blob, mimeType || 'image/png');
        }
      } catch (_) {}
    }
    return '';
  }

  function getConversationPath(mapping, currentNode) {
    const path = [];
    const visited = new Set();
    let nodeId = currentNode;
    while (nodeId && mapping?.[nodeId] && !visited.has(nodeId)) {
      visited.add(nodeId);
      const node = mapping[nodeId];
      if (node.message) path.push(node.message);
      nodeId = node.parent;
    }
    return path.reverse();
  }

  async function extractChatGptApiMedia() {
    const match = location.pathname.match(/\/c\/([a-z0-9-]+)/i);
    if (!match) return [];
    try {
      const response = await chatGptFetch(`/backend-api/conversation/${encodeURIComponent(match[1])}`);
      if (!response.ok) return [];
      const conversation = await response.json();
      const path = getConversationPath(conversation.mapping, conversation.current_node);
      const result = [];
      for (const message of path) {
        const role = message?.author?.role;
        if (!['user', 'assistant', 'tool'].includes(role) || message.metadata?.is_visually_hidden_from_conversation) continue;
        if (role === 'assistant' && (message.recipient && message.recipient !== 'all' || message.channel === 'analysis')) continue;
        const media = [];
        const parts = Array.isArray(message?.content?.parts) ? message.content.parts : [];
        for (const part of parts) {
          if (!part || typeof part !== 'object') continue;
          if (part.content_type === 'image_asset_pointer' || part.asset_pointer || part.image_url || part.url) {
            const pointer = part.asset_pointer || part.image_url || part.url;
            const dataUrl = await fetchChatGptAsset(pointer, part.mime_type || 'image/png');
            if (dataUrl) media.push({ type: 'image', dataUrl, name: part.name || 'ChatGPT gorseli' });
          }
        }
        const attachments = Array.isArray(message?.metadata?.attachments) ? message.metadata.attachments : [];
        for (const attachment of attachments) {
          const name = attachment.name || attachment.file_name || 'Ek';
          const mimeType = attachment.mime_type || attachment.content_type || '';
          const pointer = attachment.id || attachment.file_id || attachment.asset_pointer || '';
          if (mimeType.startsWith('image/') && pointer) {
            const dataUrl = await fetchChatGptAsset(pointer, mimeType);
            if (dataUrl) {
              media.push({ type: 'image', dataUrl, name });
              continue;
            }
          }
          media.push({ type: 'attachment', name, mimeType });
        }
        const text = parts.filter((part) => typeof part === 'string').join('\n');
        if (role === 'tool' && !media.length) continue;
        result.push({ id: message.id || '', role: role === 'tool' ? 'assistant' : role, text: role === 'tool' ? '' : text, media,
          timestamp: message.create_time ? new Date(message.create_time * 1000).toISOString() : null });
      }
      return result;
    } catch (_) {
      return [];
    }
  }

  async function mergeChatGptApiMedia(messages) {
    const apiMessages = await extractChatGptApiMedia();
    if (!apiMessages.length) return messages;
    const used = new Set();
    // Match identity, never position: virtualized DOM may contain only the last turns.
    const merged = apiMessages.map((apiMessage) => {
      let message = messages.find((m) => m.id && m.id === apiMessage.id && !used.has(m));
      if (!message && apiMessage.text) {
        const candidates = messages.filter((m) => {
          if (m.role !== apiMessage.role || used.has(m)) return false;
          const probe = document.createElement('div'); probe.replaceChildren(DOMPurify.sanitize(m.html, { RETURN_DOM_FRAGMENT: true }));
          const text = probe.textContent.trim();
          return text && (text === apiMessage.text.trim() || text.length > 40 && apiMessage.text.startsWith(text));
        });
        if (candidates.length === 1) message = candidates[0];
      }
      if (message) used.add(message);
      message = message || { id: apiMessage.id, role: apiMessage.role, html: '', timestamp: apiMessage.timestamp };
      const holder = document.createElement('div');
      holder.replaceChildren(DOMPurify.sanitize(message.html || '', { RETURN_DOM_FRAGMENT: true, FORCE_BODY: true, ADD_TAGS: ['style'] }));
      if (apiMessage.text && (apiMessage.role === 'user' || !holder.textContent.trim())) {
        const media = Array.from(holder.querySelectorAll('img,[data-export-attachment]')).map((el) => el.cloneNode(true));
        holder.replaceChildren();
        const text = document.createElement('div');
        text.setAttribute('data-export-whitespace', 'true');
        text.textContent = apiMessage.text;
        holder.append(text, ...media);
      }
      const apiImages = apiMessage.media.filter((media) => media.type === 'image');
      if (apiImages.length >= holder.querySelectorAll('img:not([data-export-canvas-image]):not([data-export-svg-image])').length && apiImages.length) {
        holder.querySelectorAll('img:not([data-export-canvas-image]):not([data-export-svg-image])').forEach((img) => img.remove());
      }
      const seenImages = new Set(Array.from(holder.querySelectorAll('img')).map((img) => img.src));
      const mediaBlock = document.createElement('div');
      mediaBlock.setAttribute('data-export-api-media', 'true');
      apiMessage.media.forEach((media) => {
        if (media.type === 'image') {
          if (seenImages.has(media.dataUrl)) return;
          seenImages.add(media.dataUrl);
          const image = document.createElement('img');
          image.src = media.dataUrl;
          image.alt = media.name;
          image.setAttribute('data-export-chatgpt-asset', 'true');
          mediaBlock.appendChild(image);
        } else if (media.name && !holder.textContent.includes(media.name)) {
          const attachment = document.createElement('span');
          attachment.setAttribute('data-export-attachment', 'true');
          attachment.textContent = `📎 ${media.name}${media.mimeType ? ` (${media.mimeType})` : ''}`;
          mediaBlock.appendChild(attachment);
        }
      });
      if (mediaBlock.childNodes.length) holder.appendChild(mediaBlock);
      return { ...message, html: holder.innerHTML };
    }).filter((message) => hasMeaningfulHtmlContent(message.html));
    // Retain visible content not represented by the optional backend response.
    if (messages.some((message) => !used.has(message))) {
      const byId = new Map(merged.filter((m) => m.id).map((m) => [m.id, m]));
      if (!used.size) return messages;
      // Insert unmatched DOM turns after their nearest matched predecessor.
      let cursor = -1;
      for (const message of messages) {
        const match = byId.get(message.id);
        if (match) cursor = merged.indexOf(match);
        else if (!used.has(message)) merged.splice(++cursor, 0, message);
      }
    }
    return merged;
  }

  async function cloneWithBase64Images(node) {
    await hydrateLazyMedia(node);
    const clone = node.cloneNode(true);
    const sourceElements = Array.from(node.querySelectorAll('*'));
    const cloneElements = Array.from(clone.querySelectorAll('*'));
    const sourceImgs = Array.from(node.querySelectorAll('img'));
    const cloneImgs = Array.from(clone.querySelectorAll('img'));
    const count = Math.min(sourceImgs.length, cloneImgs.length);

    for (let i = 0; i < count; i++) {
      const srcImg = sourceImgs[i];
      const cloneImg = cloneImgs[i];
      try {
        const base64 = await imageElementToBase64(srcImg);
        if (base64) {
          cloneImg.setAttribute('src', base64);
          cloneImg.removeAttribute('srcset');
          cloneImg.removeAttribute('data-src');
          cloneImg.removeAttribute('data-original');
          cloneImg.removeAttribute('width');
          cloneImg.removeAttribute('height');
        } else {
          cloneImg.replaceWith(makeMediaPlaceholder(srcImg, 'Gorsel'));
        }
      } catch (_) {
        cloneImg.replaceWith(makeMediaPlaceholder(srcImg, 'Gorsel'));
      }
    }

    const sourceCanvases = Array.from(node.querySelectorAll('canvas'));
    const cloneCanvases = Array.from(clone.querySelectorAll('canvas'));
    for (let i = 0; i < Math.min(sourceCanvases.length, cloneCanvases.length); i++) {
      const dataUrl = canvasElementToDataUrl(sourceCanvases[i]);
      if (dataUrl) {
        const image = document.createElement('img');
        image.src = dataUrl;
        image.alt = sourceCanvases[i].getAttribute('aria-label') || 'Belge veya gorsel onizlemesi';
        image.setAttribute('data-export-canvas-image', 'true');
        cloneCanvases[i].replaceWith(image);
      } else {
        cloneCanvases[i].replaceWith(makeMediaPlaceholder(sourceCanvases[i], 'Belge onizlemesi'));
      }
    }

    const sourceSvgs = Array.from(node.querySelectorAll('svg'));
    const cloneSvgs = Array.from(clone.querySelectorAll('svg'));
    for (let i = 0; i < Math.min(sourceSvgs.length, cloneSvgs.length); i++) {
      const dataUrl = svgElementToDataUrl(sourceSvgs[i]);
      if (!dataUrl) continue;
      const image = document.createElement('img');
      image.src = dataUrl;
      image.alt = sourceSvgs[i].getAttribute('aria-label') || 'Diyagram';
      image.setAttribute('data-export-svg-image', 'true');
      cloneSvgs[i].replaceWith(image);
    }

    for (let i = 0; i < Math.min(sourceElements.length, cloneElements.length); i++) {
      const sourceElement = sourceElements[i];
      const cloneElement = cloneElements[i];
      if (!cloneElement || !clone.contains(cloneElement)) continue;
      let background = '';
      try { background = getComputedStyle(sourceElement).backgroundImage || ''; } catch (_) {}
      const match = background.match(/^url\(["']?(.+?)["']?\)$/);
      const rect = sourceElement.getBoundingClientRect?.();
      if (!match || !rect || rect.width < 80 || rect.height < 80) continue;
      try {
        const dataUrl = await imageToBase64(match[1]);
        if (!dataUrl) continue;
        const image = document.createElement('img');
        image.src = dataUrl;
        image.alt = sourceElement.getAttribute('aria-label') || 'Arka plan gorseli';
        image.setAttribute('data-export-background-image', 'true');
        cloneElement.style.backgroundImage = 'none';
        cloneElement.prepend(image);
      } catch (_) {}
    }
    return clone;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  async function serializeWithImages(node) {
    const clone = await cloneWithBase64Images(node);
    const wrapper = document.createElement('div');
    wrapper.appendChild(clone);
    let html = wrapper.innerHTML;
    if (!html || html.trim().length < 10) {
      const text = node.textContent || '';
      if (text.trim()) html = '<p style="white-space:pre-wrap">' + esc(text.trim()) + '</p>';
    }
    return html;
  }

  function normalizeTimestamp(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function extractTimestampFromElement(block) {
    if (!block) return null;

    const candidates = [];
    const directAttrs = ['data-time', 'data-timestamp', 'datetime', 'title', 'aria-label'];
    directAttrs.forEach((attr) => {
      const v = block.getAttribute?.(attr);
      if (v) candidates.push(v);
    });

    const timeEl = block.querySelector?.('time[datetime], time');
    if (timeEl) {
      const dt = timeEl.getAttribute('datetime');
      if (dt) candidates.push(dt);
      if (timeEl.textContent?.trim()) candidates.push(timeEl.textContent.trim());
    }

    const nestedTimeAttrs = block.querySelector?.('[data-time], [data-timestamp], [datetime], [title], [aria-label]');
    if (nestedTimeAttrs) {
      directAttrs.forEach((attr) => {
        const v = nestedTimeAttrs.getAttribute?.(attr);
        if (v) candidates.push(v);
      });
    }

    for (const c of candidates) {
      const ts = normalizeTimestamp(c);
      if (ts) return ts;
    }
    return null;
  }

  async function expandUserMessages() {
    const expanded = [];
    for (const button of document.querySelectorAll('[data-message-author-role="user"] button, [data-message-author-role="user"] [role="button"]')) {
      const label = (button.textContent || button.getAttribute('aria-label') || '').trim();
      if (/^(show more|read more|daha fazla göster|daha fazlasını göster|devamını göster|devamını oku)$/iu.test(label)) {
        button.click(); expanded.push(button);
      }
    }
    if (expanded.length) await new Promise((resolve) => setTimeout(resolve, 250));
    return () => expanded.forEach((button) => {
      if (button.isConnected && /^(show less|read less|daha az göster)$/iu.test(button.textContent.trim())) button.click();
    });
  }

  async function extractChatGPT({ collectOnly = false, cache = new Map() } = {}) {
    const messages = [];
    const items = Array.from(document.querySelectorAll('[data-message-author-role]'));
    const articleItems = Array.from(document.querySelectorAll('article'));

    const fallbackItems = document.querySelectorAll('[class*="markdown"]')?.length
      ? Array.from(document.querySelectorAll('[class*="ConversationItem"]')).filter((el) =>
          el.querySelector('[class*="markdown"]')
        )
      : [];

    const messageBlocks = items.length > 0
      ? items
      : articleItems.length > 0
        ? articleItems
        : fallbackItems;

    if (messageBlocks.length === 0 && !collectOnly) {
      const prose = document.querySelector(
        '[class*="markdown"], [class*="prose"], .markdown'
      );
      if (prose) {
        const role = document.querySelector('[data-message-author-role="user"]')
          ? 'user'
          : 'assistant';
        const html = await serializeWithImages(prose);
        return { messages: [{ role, html, timestamp: extractTimestampFromElement(prose) }], title: getTitle() };
      }
    }

    for (let i = 0; i < messageBlocks.length; i++) {
      const block = messageBlocks[i];
      const role =
        block.getAttribute?.('data-message-author-role') ||
        block.querySelector?.('[data-message-author-role]')?.getAttribute?.('data-message-author-role') ||
        (block.querySelector?.('[class*="user"]') ? 'user' : 'assistant');
      const content = pickFirstMeaningful(block, [
        '[data-message-content]',
        '[data-testid="user-message"]',
        '[data-testid*="conversation-turn-content"]',
        '[class*="markdown"]',
        '.markdown',
        '[class*="prose"]',
        '.whitespace-pre-wrap',
        '[class*="text"]',
      ]);
      const turn = block.closest('article[data-testid^="conversation-turn"], article');
      const extractionRoot = turn && turn.querySelectorAll('[data-message-author-role]').length === 1 ? turn : block;
      const id = block.getAttribute('data-message-id') || block.querySelector('[data-message-id]')?.getAttribute('data-message-id') || '';
      const turnName = turn?.getAttribute('data-testid') || '';
      const turnNumber = turnName.match(/^conversation-turn-(\d+)$/);
      if (!historyNodeIds.has(block)) historyNodeIds.set(block, `node-${++historyNodeSequence}`);
      const historyKey = id ? `message:${id}` : turnName && extractionRoot === turn ? `turn:${turnName}` : historyNodeIds.get(block);
      const signature = extractionRoot.outerHTML;
      if (collectOnly && cache.get(historyKey)?.signature === signature) {
        messages.push(cache.get(historyKey).message);
        continue;
      }
      if (content || hasMeaningfulNodeContent(block) || extractionRoot.querySelector('img,canvas,picture,video')) {
        // ChatGPT keeps uploaded-file cards, generated images and the text in
        // sibling nodes under the same author block. Serializing only the first
        // markdown/text child permanently drops those siblings.
        const rawHtml = await serializeWithImages(extractionRoot);
        const html = sanitizeExtractedHtml(rawHtml);
        if (hasMeaningfulHtmlContent(html)) {
          const message = {
            id,
            _historyKey: historyKey,
            _turnIndex: turnNumber ? Number(turnNumber[1]) : null,
            role: role === 'user' ? 'user' : 'assistant',
            html,
            timestamp: extractTimestampFromElement(block) || extractTimestampFromElement(content),
          };
          messages.push(message);
          if (collectOnly) cache.set(historyKey, { signature, message });
        }
      }
    }

    let meaningful = messages.filter((m) => hasMeaningfulHtmlContent(m.html || ''));
    if (collectOnly) return { messages: meaningful, title: getTitle() };
    if (!meaningful.length || isWeakExtraction(meaningful)) {
      const fallback = await extractChatGPTFallback();
      if (scoreMessages(fallback).total > scoreMessages(meaningful).total) {
        meaningful = fallback;
      }
    }
    meaningful = await mergeChatGptApiMedia(meaningful);
    return { messages: meaningful, title: getTitle() };

    function getTitle() {
      return (
        document.title?.replace(/\s*[-–|]\s*ChatGPT$/, '').trim() ||
        document.querySelector('[class*="ConversationTitle"]')?.textContent ||
        'ChatGPT Conversation'
      );
    }
  }

  function getChatPathMatchers() { return ['/c/', '/share/']; }

  async function extractChat(siteId) {
    if (siteId && siteId !== 'chatgpt') throw new Error('Yalnızca ChatGPT destekleniyor.');
    if (document.querySelector('[data-testid="stop-button"]')) throw new Error('Yanıt oluşturuluyor. Tamamlandıktan sonra tekrar dışa aktarın.');
    if (!globalThis.ChatGPTHistory) throw new Error('Uzantıyı ve ChatGPT sekmesini yenileyin. Sohbet yükleyicisi bulunamadı.');
    const cache = new Map();
    collectingHistory = true;
    try {
      const data = await ChatGPTHistory.collect(async () => {
        const restore = await expandUserMessages();
        try { return await extractChatGPT({ collectOnly: true, cache }); }
        finally { restore(); }
      });
      data.messages = await mergeChatGptApiMedia(data.messages);
      data.messages = data.messages.map(({ _historyKey, _turnIndex, ...message }) => message);
      return data;
    } finally { sessionToken = ''; collectingHistory = false; cache.clear(); }
  }

  function normalizeUrl(href) {
    try {
      return new URL(href, location.href).href;
    } catch {
      return null;
    }
  }

  function canonicalizeChatUrl(siteId, rawUrl) {
    try {
      const u = new URL(rawUrl);
      if (siteId === 'chatgpt') {
        u.hash = '';
        u.search = '';
      } else {
        u.hash = '';
      }
      return u.href;
    } catch {
      return rawUrl;
    }
  }

  function collectChatLinks(siteId) {
    const matchers = getChatPathMatchers(siteId);
    const links = new Set();

    const anchors = Array.from(document.querySelectorAll('a[href]'));
    for (const a of anchors) {
      const href = a.getAttribute('href');
      if (!href) continue;
      const url = normalizeUrl(href);
      if (!url) continue;

      try {
        const parsed = new URL(url);
        if (parsed.origin !== location.origin) continue;
        if (!/\/(c|share)\/[^/]+/.test(parsed.pathname)) continue;
        const canonical = canonicalizeChatUrl(siteId, parsed.href);
        links.add(canonical);
      } catch (_) {}
    }

    try {
      const current = new URL(location.href);
      if (matchers.some((m) => current.pathname.includes(m))) {
        links.add(canonicalizeChatUrl(siteId, current.href));
      }
    } catch (_) {}

    const result = Array.from(links).slice(0, 300);

    return result;
  }

  let pendingExtraction = null;
  Ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'EXTRACT_CHAT') {
      const sourceUrl = location.href;
      if (!pendingExtraction) pendingExtraction = extractChat(msg.siteId).finally(() => { pendingExtraction = null; });
      pendingExtraction
        .then((data) => {
          if (location.href !== sourceUrl) { sendResponse({ error: 'Sohbet değişti. Tekrar dışa aktarın.' }); return; }
          if (!data || !data.messages?.length) {
            sendResponse({ error: 'Bu sayfada chat icerigi bulunamadi.' });
          } else {
            sendResponse({ data: { ...data, currentUrl: location.href } });
          }
        })
        .catch((err) => {
          sendResponse({ error: err?.message || 'Icerik cikarilamadi.', code: err?.code });
        });
      return true;
    }

    if (msg.action === 'EXTRACT_CHAT_LINKS') {
      try {
        const links = collectChatLinks(msg.siteId);
        sendResponse({ links });
      } catch (err) {
        sendResponse({ error: err?.message || 'Sohbet linkleri toplanamadi.' });
      }
      return true;
    }
  });
})();
