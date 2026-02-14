/**
 * BaseAdapter - Tum platform adapter'larinda ortak mantigi toplar.
 * Platform-specific adapter'lar bu sinifi extend eder ve extractMessages() override eder.
 */
import { cloneWithBase64Images, imageToBase64 } from './utils.js';

export class BaseAdapter {
  constructor(config = {}) {
    this.defaultTitle = config.defaultTitle || 'Conversation';
    this.titleSelectors = config.titleSelectors || ['h1', '[class*="title"]', '[class*="ConversationTitle"]'];
  }

  /**
   * Gorsel URL'ini base64'e donusturur.
   * @param {string} url
   * @returns {Promise<string>}
   */
  async imageToBase64(url) {
    return imageToBase64(url);
  }

  /**
   * Node'u img etiketlerini base64'e cevirerek klonlar.
   * @param {Node} node
   * @returns {Promise<Node>}
   */
  async cloneWithBase64Images(node) {
    return cloneWithBase64Images(node);
  }

  /**
   * Node'u HTML string'e serialize eder (img base64 ile).
   * @param {Node} node
   * @returns {Promise<string>}
   */
  async serializeWithImages(node) {
    const clone = await this.cloneWithBase64Images(node);
    const wrapper = document.createElement('div');
    wrapper.appendChild(clone);
    return wrapper.innerHTML;
  }

  /**
   * Block icinden timestamp cikarir (time elementi, data-time, datetime vb.).
   * @param {Element} block
   * @returns {string|null} ISO string veya null
   */
  extractTimestamp(block) {
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
      const ts = this._normalizeTimestamp(c);
      if (ts) return ts;
    }
    return null;
  }

  _normalizeTimestamp(value) {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  /**
   * Node veya block'tan role infer eder.
   * @param {Node} node
   * @param {Element} [block] - Optional block container
   * @returns {'user'|'assistant'}
   */
  inferRole(node, block) {
    const holder = block || node?.closest?.('[data-message-author-role], [data-role], article, [class*="message"], [class*="Message"]') || node?.parentElement;
    if (!holder) return 'assistant';

    const explicit =
      holder?.getAttribute?.('data-message-author-role') ||
      holder?.getAttribute?.('data-role') ||
      holder?.querySelector?.('[data-message-author-role]')?.getAttribute?.('data-message-author-role');

    if (explicit === 'user') return 'user';

    const cls = `${holder?.className || ''}`.toLowerCase();
    if (cls.includes('user')) return 'user';

    const hasUserInQuery = holder?.querySelector?.('[class*="user"]');
    if (hasUserInQuery) return 'user';

    return 'assistant';
  }

  /**
   * HTML'i PDF/export icin temizler (script, style, skeleton, loading vb. kaldirir).
   * @param {string} html
   * @returns {string}
   */
  sanitizeHtml(html) {
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

  /**
   * Sayfa basligini ceker. Subclass titleSelectors ve defaultTitle ile override edebilir.
   * @returns {string}
   */
  extractTitle() {
    for (const sel of this.titleSelectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) return el.textContent.trim();
    }
    return this.defaultTitle;
  }

  /**
   * Block icinden icerik elementini bulur. Platform-specific override icin.
   * @param {Element} block
   * @param {string[]} contentSelectors - Denenecek selector listesi
   * @returns {Element|null}
   */
  extractContentElement(block, contentSelectors) {
    const selectors = contentSelectors || [
      '[class*="markdown"]',
      '[class*="content"]',
      '[class*="prose"]',
      '[class*="text"]',
      '.markdown',
      '.prose',
    ];
    for (const sel of selectors) {
      const el = block.querySelector?.(sel);
      if (el) return el;
    }
    return block;
  }

  /**
   * Ana extract metodu. extractMessages() sonucunu title ile birlestirir.
   * @returns {Promise<{ messages: Array<{role:string,html:string,timestamp?:string}>, title: string }>}
   */
  async extract() {
    const messages = await this.extractMessages();
    const title = this.extractTitle();
    return { messages, title };
  }

  /**
   * Platform-specific mesaj cikarma. Subclass'lar override etmeli.
   * @returns {Promise<Array<{role:string,html:string,timestamp?:string}>>}
   */
  async extractMessages() {
    throw new Error('extractMessages() must be implemented by platform adapter');
  }
}
