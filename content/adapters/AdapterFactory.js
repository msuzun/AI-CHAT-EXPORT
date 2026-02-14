/**
 * AdapterFactory - Factory pattern ile platform-specific adapter'lari dinamik olusturur.
 * Singleton pattern kullanir.
 * Mevcut extractChat() extractor'larini kullanir.
 */
import { BaseAdapter } from './BaseAdapter.js';
import { extractChatGPT } from './chatgpt.js';
import { extractGemini } from './gemini.js';
import { extractDeepSeek } from './deepseek.js';
import { extractClaude } from './claude.js';

/** Bilinen platformlar icin extractor fonksiyonlari */
const DEFAULT_EXTRACTORS = {
  chatgpt: extractChatGPT,
  gemini: extractGemini,
  deepseek: extractDeepSeek,
  claude: extractClaude,
};

/**
 * Bilinmeyen platform icin BaseAdapter tabanli fallback.
 * selectors ile generic mesaj cikarma yapar.
 */
class GenericAdapter extends BaseAdapter {
  constructor(selectors = {}) {
    super({
      defaultTitle: selectors.defaultTitle || 'Conversation',
      titleSelectors: selectors.titleSelectors || ['h1', '[class*="title"]'],
    });
    this.selectors = selectors;
  }

  async extractMessages() {
    const messageBlocksSelector = this.selectors.messageBlocks || '[class*="message"], [data-role], article';
    const contentSelectors = this.selectors.contentSelectors || [
      '[class*="markdown"]',
      '[class*="content"]',
      '[class*="prose"]',
      '.markdown',
      '.prose',
      '[class*="text"]',
    ];

    const blocks = Array.from(document.querySelectorAll(messageBlocksSelector));
    const messages = [];

    for (const block of blocks) {
      const content = this.extractContentElement(block, contentSelectors);
      if (!content?.textContent?.trim()) continue;

      const html = await this.serializeWithImages(content);
      const role = this.inferRole(content, block);
      const timestamp = this.extractTimestamp(block) || this.extractTimestamp(content);

      messages.push({ role, html, timestamp });
    }

    if (messages.length === 0) {
      const fallbackContent = document.querySelector(
        '[class*="markdown"], [class*="content"], [class*="prose"], .markdown'
      );
      if (fallbackContent?.textContent?.trim()) {
        const html = await this.serializeWithImages(fallbackContent);
        messages.push({
          role: 'assistant',
          html,
          timestamp: this.extractTimestamp(fallbackContent),
        });
      }
    }

    return messages;
  }
}

/**
 * Kayitli extractor'i saran adapter wrapper.
 * extractChat() ile ayni extractor'lari kullanir.
 */
function createExtractorAdapter(platformId, extractor) {
  return {
    _platformId: platformId,
    _extractor: extractor,

    async extractMessages() {
      const result = await this._extractor();
      return result?.messages ?? [];
    },

    async extract() {
      const result = await this._extractor();
      return result ?? { messages: [], title: '' };
    },

    extractTitle() {
      return '';
    },
  };
}

const AdapterFactory = {
  _instance: null,
  _extractors: { ...DEFAULT_EXTRACTORS },

  /**
   * Singleton instance dondurur.
   */
  getInstance() {
    if (!AdapterFactory._instance) {
      AdapterFactory._instance = AdapterFactory;
    }
    return AdapterFactory._instance;
  },

  /**
   * Platform extractor'ini kaydeder.
   * @param {string} platformId
   * @param {Function} extractorFn - async () => { messages, title }
   */
  register(platformId, extractorFn) {
    if (platformId && typeof extractorFn === 'function') {
      this._extractors[platformId] = extractorFn;
    }
  },

  /**
   * Platform icin adapter olusturur.
   * @param {string} platformId - chatgpt, gemini, deepseek, claude vb.
   * @param {object} [selectors] - Bilinmeyen platform icin generic adapter selectors
   * @returns {object} Adapter with extractMessages() and extract()
   */
  createAdapter(platformId, selectors = {}) {
    const extractor = this._extractors[platformId];

    if (extractor) {
      return createExtractorAdapter(platformId, extractor);
    }

    return new GenericAdapter(selectors);
  },

  /**
   * Kayitli tum platform ID'lerini dondurur.
   */
  getRegisteredPlatforms() {
    return Object.keys(this._extractors);
  },
};

export { AdapterFactory, GenericAdapter };
