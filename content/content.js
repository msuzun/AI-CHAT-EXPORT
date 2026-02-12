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
        return { messages: [{ role, html }], title: getTitle() };
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
        messages.push({ role: role === 'user' ? 'user' : 'assistant', html });
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
        return { messages: [{ role: 'assistant', html }], title: getTitle() };
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
        messages.push({ role: isUser ? 'user' : 'assistant', html });
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
        return { messages: [{ role: 'assistant', html }], title: getTitle() };
      }
    }

    for (const block of items) {
      const isUser =
        block.className?.includes?.('user') ||
        block.className?.includes?.('User') ||
        block.getAttribute?.('data-role') === 'user' ||
        block.querySelector?.('[class*="user"]');
      const content =
        block.querySelector?.('[class*="markdown"]') ||
        block.querySelector?.('[class*="content"]') ||
        block.querySelector?.('[class*="text"]') ||
        block.querySelector?.('.markdown') ||
        block.querySelector?.('.prose') ||
        block;
      if (content && content.textContent?.trim()) {
        const html = await serializeWithImages(content);
        messages.push({ role: isUser ? 'user' : 'assistant', html });
      }
    }

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
        return { messages: [{ role: 'assistant', html }], title: getTitle() };
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
        messages.push({ role: isUser ? 'user' : 'assistant', html });
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

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'EXTRACT_CHAT') {
      extractChat(msg.siteId)
        .then((data) => {
          if (!data || !data.messages?.length) {
            sendResponse({ error: 'Bu sayfada chat içeriği bulunamadı.' });
          } else {
            sendResponse({ data });
          }
        })
        .catch((err) => {
          sendResponse({ error: err?.message || 'İçerik çıkarılamadı.' });
        });
      return true;
    }
  });
})();
