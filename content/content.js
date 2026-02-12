(function () {
  async function imageToBase64(url) {
    if (!url || url.startsWith('data:')) return url;
    try {
      const res = await fetch(url, { mode: 'cors' });
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

  async function cloneWithBase64Images(node) {
    const clone = node.cloneNode(true);
    const imgs = clone.querySelectorAll('img');
    for (const img of imgs) {
      const src = img.getAttribute('src');
      if (src) {
        try {
          const base64 = await imageToBase64(src);
          img.setAttribute('src', base64);
        } catch (_) {}
      }
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
    const items =
      document.querySelectorAll('[data-message-author-role]') ||
      document.querySelectorAll('article');

    const fallbackItems = document.querySelectorAll('[class*="markdown"]')?.length
      ? Array.from(document.querySelectorAll('[class*="ConversationItem"]')).filter((el) =>
          el.querySelector('[class*="markdown"]')
        )
      : [];

    const messageBlocks =
      items?.length > 0 ? items : document.querySelectorAll('article') || fallbackItems;

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
      const content =
        block.querySelector?.('[class*="markdown"]') ||
        block.querySelector?.('.markdown') ||
        block.querySelector?.('[class*="prose"]') ||
        block.querySelector?.('[class*="text"]') ||
        block;
      if (content && content.textContent?.trim()) {
        const html = await serializeWithImages(content);
        messages.push({
          role: role === 'user' ? 'user' : 'assistant',
          html,
          timestamp: extractTimestampFromElement(block) || extractTimestampFromElement(content),
        });
      }
    }

    return { messages, title: getTitle() };

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
      if (content && content.textContent?.trim()) {
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
      if (content && content.textContent?.trim()) {
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
      if (content && content.textContent?.trim()) {
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
      if (content && content.textContent?.trim()) {
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

  function extractChat(siteId) {
    const fn = extractors[siteId];
    if (!fn) return null;
    return fn();
  }

  function normalizeUrl(href) {
    try {
      return new URL(href, location.href).href;
    } catch {
      return null;
    }
  }

  function collectChatLinks(siteId) {
    const pathMatchers = {
      chatgpt: ['/c/'],
      gemini: ['/app/'],
      deepseek: ['/chat/', '/c/'],
      claude: ['/chat/'],
    };

    const matchers = pathMatchers[siteId] || ['/chat/', '/c/'];
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
        links.add(parsed.href);
      } catch (_) {}
    }

    try {
      const current = new URL(location.href);
      if (matchers.some((m) => current.pathname.includes(m))) {
        links.add(current.href);
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
            sendResponse({ data });
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
