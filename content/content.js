(function () {
  async function imageToBase64(url) {
    if (!url || url.startsWith('data:')) return url;
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'include' });
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    } catch {
      return url;
    }
  }

  async function imageElementToBase64(img) {
    if (!img) return '';
    const src = img.currentSrc || img.getAttribute('src') || img.src || '';
    if (!src) return '';
    if (src.startsWith('data:')) return src;

    try {
      const base64 = await imageToBase64(src);
      if (base64 && base64.startsWith('data:')) return base64;
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
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          return canvas.toDataURL('image/png');
        }
      }
    } catch (_) {}

    return src;
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
    div.innerHTML = html || '';
    return hasMeaningfulNodeContent(div);
  }

  function sanitizeExtractedHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html || '';
    div.querySelectorAll?.(
      [
        'script',
        'style',
        'svg',
        '[aria-hidden="true"]',
        '[class*="skeleton"]',
        '[class*="loading"]',
        '[class*="spinner"]',
        '[class*="typing"]',
        '[data-state="loading"]',
        '[class*="sticky"]',
        '[class*="fixed"]',
        '[class*="absolute"]',
        '[class*="min-h-screen"]',
        '[class*="h-screen"]',
      ].join(',')
    ).forEach((el) => el.remove());
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
      div.innerHTML = m?.html || '';
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

    // DeepSeek'teki yaklasima benzer: roller tek tipe cokmus ise sirali dagit.
    const roles = out.map((m) => m.role);
    const allSame = roles.length > 1 && roles.every((r) => r === roles[0]);
    if (allSame) {
      let expectedRole = 'user';
      out.forEach((m) => {
        m.role = expectedRole;
        expectedRole = expectedRole === 'user' ? 'assistant' : 'user';
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

  async function cloneWithBase64Images(node) {
    const clone = node.cloneNode(true);
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
        }
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

  async function extractChatGPT() {
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

    if (messageBlocks.length === 0) {
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
      if (content) {
        const rawHtml = await serializeWithImages(content);
        const html = sanitizeExtractedHtml(rawHtml);
        if (hasMeaningfulHtmlContent(html)) {
          messages.push({
            role: role === 'user' ? 'user' : 'assistant',
            html,
            timestamp: extractTimestampFromElement(block) || extractTimestampFromElement(content),
          });
        }
      }
    }

    let meaningful = messages.filter((m) => hasMeaningfulHtmlContent(m.html || ''));
    if (!meaningful.length || isWeakExtraction(meaningful)) {
      const fallback = await extractChatGPTFallback();
      if (scoreMessages(fallback).total > scoreMessages(meaningful).total) {
        meaningful = fallback;
      }
    }
    return { messages: meaningful, title: getTitle() };

    function getTitle() {
      return (
        document.querySelector('h1')?.textContent ||
        document.querySelector('[class*="ConversationTitle"]')?.textContent ||
        'ChatGPT Conversation'
      );
    }
  }

  async function extractGemini() {
    const messages = [];
    const turnBlocks =
      document.querySelectorAll('[data-turn-id]') ||
      document.querySelectorAll('[class*="turn"]') ||
      document.querySelectorAll('[class*="message"]') ||
      document.querySelectorAll('.model-response, [class*="modelResponse"]') ||
      document.querySelectorAll('[class*="ConversationTurn"]');

    const userBlocks = document.querySelectorAll(
      '[class*="user-"], [class*="UserMessage"], [data-role="user"]'
    );
    const modelBlocks = document.querySelectorAll(
      '[class*="model-"], [class*="ModelResponse"], [data-role="model"]'
    );

    let items = [];
    if (turnBlocks.length > 0) {
      items = Array.from(turnBlocks);
    } else {
      items = mergeByOrder(userBlocks, modelBlocks);
    }

    if (items.length === 0) {
      const anyContent = document.querySelector(
        '[class*="markdown"], [class*="content"], [class*="message"]'
      );
      if (anyContent) {
        const html = await serializeWithImages(anyContent);
        return {
          messages: [{ role: 'assistant', html, timestamp: extractTimestampFromElement(anyContent) }],
          title: getTitle(),
        };
      }
    }

    for (const block of items) {
      const isUser =
        block.className?.includes?.('user') ||
        block.className?.includes?.('User') ||
        block.getAttribute?.('data-role') === 'user';
      const content =
        block.querySelector?.('[class*="markdown"]') ||
        block.querySelector?.('[class*="content"]') ||
        block.querySelector?.('[class*="text"]') ||
        block.querySelector?.('.markdown') ||
        block;
      if (content && hasMeaningfulNodeContent(content)) {
        const html = await serializeWithImages(content);
        messages.push({
          role: isUser ? 'user' : 'assistant',
          html,
          timestamp: extractTimestampFromElement(block) || extractTimestampFromElement(content),
        });
      }
    }

    return { messages, title: getTitle() };

    function getTitle() {
      return (
        document.querySelector('h1')?.textContent ||
        document.querySelector('[class*="title"]')?.textContent ||
        'Gemini Conversation'
      );
    }

    function mergeByOrder(userEls, modelEls) {
      const all = [];
      const u = Array.from(userEls);
      const m = Array.from(modelEls);
      let i = 0,
        j = 0;
      while (i < u.length || j < m.length) {
        if (i >= u.length) {
          all.push(...m.slice(j));
          break;
        }
        if (j >= m.length) {
          all.push(...u.slice(i));
          break;
        }
        const uPos = u[i].compareDocumentPosition(m[j]);
        if (uPos & Node.DOCUMENT_POSITION_FOLLOWING) {
          all.push(u[i++]);
        } else {
          all.push(m[j++]);
        }
      }
      return all;
    }
  }

  function firstNonEmpty(...selectors) {
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) return els;
    }
    return [];
  }

  async function extractDeepSeek() {
    const messages = [];
    const items = firstNonEmpty(
      '[class*="Message"]',
      '[class*="message"]',
      '[class*="chat-item"]',
      '[data-role]',
      'article',
      '[role="article"]',
      '[class*="bubble"]',
      '[class*="reply"]',
      '[class*="turn"]'
    );

    if (items.length === 0) {
      const content = document.querySelector(
        '[class*="markdown"], [class*="content"], .prose, [class*="text"]'
      );
      if (content && hasMeaningfulNodeContent(content)) {
        const html = await serializeWithImages(content);
        return {
          messages: [{ role: 'assistant', html, timestamp: extractTimestampFromElement(content) }],
          title: getTitle(),
        };
      }
    }

    for (const block of items) {
      const isUser =
        block.className?.includes?.('user') ||
        block.className?.includes?.('User') ||
        block.getAttribute?.('data-role') === 'user' ||
        block.querySelector?.('[class*="user"]');
      const content =
        block.querySelector?.('.ds-markdown') ||
        block.querySelector?.('[class*="markdown"]') ||
        block.querySelector?.('[class*="content"]') ||
        block.querySelector?.('[class*="text"]') ||
        block.querySelector?.('.markdown') ||
        block.querySelector?.('.prose') ||
        block;
      if (content && hasMeaningfulNodeContent(content)) {
        const hasMarkdown = !!block.querySelector?.('.ds-markdown, [class*="markdown"], pre, code, ol, ul, h1, h2, h3');
        const html = await serializeWithImages(content);
        messages.push({
          role: isUser ? 'user' : 'assistant',
          html,
          _hasMarkdown: hasMarkdown,
          timestamp: extractTimestampFromElement(block) || extractTimestampFromElement(content),
        });
      }
    }

    // DeepSeek: Eğer tüm mesajlar aynı rol olarak tespit edildiyse,
    // yapısal analiz ile düzelt (markdown olmayan = user, olan = assistant)
    const roles = messages.filter((m) => m.role !== 'meta').map((m) => m.role);
    const allSame = roles.length > 1 && roles.every((r) => r === roles[0]);
    if (allSame) {
      // Yöntem 1: Markdown/yapısal fark ile ayır
      const hasStructuralDiff = messages.some((m) => m._hasMarkdown) && messages.some((m) => !m._hasMarkdown);
      if (hasStructuralDiff) {
        messages.forEach((m) => {
          if (m.role !== 'meta') m.role = m._hasMarkdown ? 'assistant' : 'user';
        });
      } else {
        // Yöntem 2: Alternating pattern (user, assistant, user, assistant...)
        let expectedRole = 'user';
        messages.forEach((m) => {
          if (m.role !== 'meta') {
            m.role = expectedRole;
            expectedRole = expectedRole === 'user' ? 'assistant' : 'user';
          }
        });
      }
    }
    // _hasMarkdown geçici alanını temizle
    messages.forEach((m) => delete m._hasMarkdown);

    return { messages, title: getTitle() };

    function getTitle() {
      return (
        document.querySelector('h1')?.textContent ||
        document.querySelector('[class*="title"]')?.textContent ||
        'DeepSeek Conversation'
      );
    }
  }

  async function extractClaude() {
    const messages = [];
    const items =
      document.querySelectorAll('[class*="Message"]') ||
      document.querySelectorAll('[class*="message-"]') ||
      document.querySelectorAll('[data-role]') ||
      document.querySelectorAll('article');

    if (items.length === 0) {
      const content = document.querySelector(
        '[class*="markdown"], [class*="content"], [class*="prose"]'
      );
      if (content) {
        const html = await serializeWithImages(content);
        return {
          messages: [{ role: 'assistant', html, timestamp: extractTimestampFromElement(content) }],
          title: getTitle(),
        };
      }
    }

    for (const block of items) {
      const isUser =
        block.className?.includes?.('user') ||
        block.getAttribute?.('data-role') === 'user' ||
        block.querySelector?.('[class*="user"]');
      const content =
        block.querySelector?.('[class*="markdown"]') ||
        block.querySelector?.('[class*="content"]') ||
        block.querySelector?.('[class*="prose"]') ||
        block.querySelector?.('.markdown') ||
        block;
      if (content && hasMeaningfulNodeContent(content)) {
        const html = await serializeWithImages(content);
        messages.push({
          role: isUser ? 'user' : 'assistant',
          html,
          timestamp: extractTimestampFromElement(block) || extractTimestampFromElement(content),
        });
      }
    }

    return { messages, title: getTitle() };

    function getTitle() {
      return (
        document.querySelector('h1')?.textContent ||
        document.querySelector('[class*="title"]')?.textContent ||
        'Claude Conversation'
      );
    }
  }

  const extractors = {
    chatgpt: extractChatGPT,
    gemini: extractGemini,
    deepseek: extractDeepSeek,
    claude: extractClaude,
  };

  const PLATFORMS = {
    chatgpt: { id: 'chatgpt', name: 'ChatGPT', chatPathMatchers: ['/c/'] },
    gemini: { id: 'gemini', name: 'Gemini', chatPathMatchers: ['/app/'] },
    deepseek: { id: 'deepseek', name: 'DeepSeek', chatPathMatchers: ['/chat/', '/c/'] },
    claude: { id: 'claude', name: 'Claude', chatPathMatchers: ['/chat/'] },
  };

  function getPlatformFromUrl(url) {
    if (!url || typeof url !== 'string') return null;
    let host;
    try {
      host = (url.startsWith('http') ? new URL(url) : new URL(url, location.origin)).hostname.toLowerCase();
    } catch (_) {
      return null;
    }
    if (host === 'chat.openai.com' || host === 'chatgpt.com') return { id: 'chatgpt', name: 'ChatGPT' };
    if (host === 'gemini.google.com') return { id: 'gemini', name: 'Gemini' };
    if (host.includes('deepseek')) return { id: 'deepseek', name: 'DeepSeek' };
    if (host === 'claude.ai') return { id: 'claude', name: 'Claude' };
    return null;
  }

  function getChatPathMatchers(platformId) {
    return PLATFORMS[platformId]?.chatPathMatchers || ['/chat/', '/c/'];
  }

  class ContentExtractor {
    constructor() {
      this._platform = null;
      this._adapter = null;
    }

    init(currentUrl) {
      this._platform = getPlatformFromUrl(currentUrl || location.href);
      this._adapter = null;
      return this._platform;
    }

    createAdapter(platformId) {
      const fn = extractors[platformId];
      if (fn) {
        return {
          async extract() {
            return fn();
          },
        };
      }
      return null;
    }

    async extractChat(platformId) {
      const id = platformId || this._platform?.id;
      if (!id) {
        throw new Error('Desteklenmeyen platform. Lutfen ChatGPT, Gemini, DeepSeek veya Claude chat sayfasinda oldugunuzdan emin olun.');
      }
      const adapter = this.createAdapter(id);
      if (!adapter) {
        throw new Error(`Desteklenmeyen platform: ${id}`);
      }
      const result = await adapter.extract();
      if (!result || !result.messages) {
        throw new Error('Bu sayfada chat icerigi bulunamadi.');
      }
      return result;
    }
  }

  const contentExtractor = new ContentExtractor();
  contentExtractor.init(location.href);

  function extractChat(siteId) {
    return contentExtractor.extractChat(siteId);
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
      if (siteId === 'chatgpt' || siteId === 'deepseek' || siteId === 'claude') {
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
        if (!matchers.some((m) => parsed.pathname.includes(m))) continue;
        links.add(canonicalizeChatUrl(siteId, parsed.href));
      } catch (_) {}
    }

    try {
      const current = new URL(location.href);
      if (matchers.some((m) => current.pathname.includes(m))) {
        links.add(canonicalizeChatUrl(siteId, current.href));
      }
    } catch (_) {}

    return Array.from(links).slice(0, 300);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'EXTRACT_CHAT') {
      extractChat(msg.siteId)
        .then((data) => {
          if (!data || !data.messages?.length) {
            sendResponse({ error: 'Bu sayfada chat icerigi bulunamadi.' });
          } else {
            sendResponse({ data: { ...data, currentUrl: location.href } });
          }
        })
        .catch((err) => {
          sendResponse({ error: err?.message || 'Icerik cikarilamadi.' });
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
