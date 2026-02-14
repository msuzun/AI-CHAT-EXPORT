/**
 * Merkezi platform yoneticisi.
 * Tum platform konfigurasyonlari tek PLATFORMS objesinde.
 * Yeni platform eklemek icin PLATFORMS'a yeni entry ekleyin.
 */

const PLATFORMS = {
  chatgpt: {
    id: 'chatgpt',
    name: 'ChatGPT',
    hosts: ['chat.openai.com', 'chatgpt.com'],
    pathPattern: (p) => /^\/c\/[^/]+/.test(p),
    chatPathMatchers: ['/c/'],
    selectors: {
      messageBlocks: '[data-message-author-role], div[class*="group"][data-message-author-role], article',
      fallbackBlocks: '[class*="ConversationItem"]',
      content: '[class*="markdown"], .markdown, [class*="prose"], [class*="text"]',
      title: 'h1, [class*="ConversationTitle"]',
    },
    defaultTitle: 'ChatGPT Conversation',
  },

  gemini: {
    id: 'gemini',
    name: 'Gemini',
    hosts: ['gemini.google.com'],
    pathPattern: (p) => p.startsWith('/app/'),
    chatPathMatchers: ['/app/'],
    selectors: {
      turnBlocks: '[data-turn-id], [class*="turn"], [class*="message"], .model-response, [class*="modelResponse"], [class*="ConversationTurn"]',
      userBlocks: '[class*="user-"], [class*="UserMessage"], [data-role="user"]',
      modelBlocks: '[class*="model-"], [class*="ModelResponse"], [data-role="model"]',
      content: '[class*="markdown"], [class*="content"], [class*="text"], .markdown',
      title: 'h1, [class*="title"]',
    },
    defaultTitle: 'Gemini Conversation',
  },

  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    hosts: ['chat.deepseek.com', 'platform.deepseek.com'],
    hostContains: 'deepseek',
    pathPattern: (p) => p.includes('/chat/') || /^\/c\/[^/]+/.test(p),
    chatPathMatchers: ['/chat/', '/c/'],
    selectors: {
      messageBlocks: '[class*="message"], [class*="chat-item"], [data-role], .message, [class*="Message"]',
      content: '[class*="markdown"], [class*="content"], .markdown, .prose',
      title: 'h1, [class*="title"]',
    },
    defaultTitle: 'DeepSeek Conversation',
  },

  claude: {
    id: 'claude',
    name: 'Claude',
    hosts: ['claude.ai'],
    pathPattern: (p) => p.includes('/chat/'),
    chatPathMatchers: ['/chat/'],
    selectors: {
      messageBlocks: '[class*="Message"], [class*="message-"], [data-role], article',
      content: '[class*="markdown"], [class*="content"], [class*="prose"], .markdown',
      title: 'h1, [class*="title"]',
    },
    defaultTitle: 'Claude Conversation',
  },
};

const PlatformManager = {
  /**
   * URL'den platform bilgisini dondurur.
   * @param {string} url - Tam URL veya hostname
   * @returns {{ id: string, name: string } | null}
   */
  getPlatform(url) {
    if (!url || typeof url !== 'string') return null;
    let host = url;
    try {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        host = new URL(url).hostname.toLowerCase();
      } else {
        host = host.toLowerCase();
      }
    } catch (_) {
      return null;
    }

    for (const platform of Object.values(PLATFORMS)) {
      if (platform.hosts && platform.hosts.some((h) => host === h || host.endsWith('.' + h))) {
        return { id: platform.id, name: platform.name };
      }
      if (platform.hostContains && host.includes(platform.hostContains)) {
        return { id: platform.id, name: platform.name };
      }
    }

    return null;
  },

  /**
   * Platform ID ile tum konfigurasyonu dondurur.
   * @param {string} platformId
   * @returns {object | null}
   */
  getConfig(platformId) {
    return PLATFORMS[platformId] || null;
  },

  /**
   * URL sohbet sayfasi URL'si mi kontrol eder.
   * @param {string} platformId
   * @param {string} rawUrl
   * @returns {boolean}
   */
  isLikelyChatUrl(platformId, rawUrl) {
    try {
      const u = new URL(rawUrl);
      const p = u.pathname || '/';
      const platform = PLATFORMS[platformId];
      if (!platform || !platform.pathPattern) return p.includes('/chat/') || p.includes('/c/') || p.includes('/app/');
      return platform.pathPattern(p);
    } catch (_) {
      return false;
    }
  },

  /**
   * Platform icin sohbet linki path matcher'larini dondurur.
   * @param {string} platformId
   * @returns {string[]}
   */
  getChatPathMatchers(platformId) {
    const platform = PLATFORMS[platformId];
    return platform?.chatPathMatchers || ['/chat/', '/c/'];
  },

  /**
   * Tum platformlari dondurur.
   * @returns {object}
   */
  getAllPlatforms() {
    return { ...PLATFORMS };
  },

  /**
   * Content script / manifest icin desteklenen URL pattern listesini dondurur.
   * @returns {string[]}
   */
  getAllPatterns() {
    const patterns = new Set();
    for (const platform of Object.values(PLATFORMS)) {
      if (platform.hosts) {
        for (const h of platform.hosts) {
          patterns.add(`https://${h}/*`);
        }
      }
      if (platform.hostContains) {
        patterns.add(`https://*.${platform.hostContains}.com/*`);
      }
    }
    return Array.from(patterns);
  },
};

export { PLATFORMS, PlatformManager };
