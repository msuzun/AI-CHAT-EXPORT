/**
 * @fileoverview Platform ortak yardimci fonksiyonlar.
 * @module utils/platformUtils
 */

/** Timestamp attribute'lari */
const TIMESTAMP_ATTRS = ['data-time', 'data-timestamp', 'datetime', 'title', 'aria-label'];

/**
 * Sohbet basligini DOM'dan ceker.
 * @param {Object} options
 * @param {string[]} [options.titleSelectors=['h1','[class*="title"]','[class*="ConversationTitle"]']] - Denenecek selector'lar
 * @param {string} [options.defaultTitle='Conversation'] - Fallback baslik
 * @returns {string}
 */
export function extractTitle(options = {}) {
  const {
    titleSelectors = ['h1', '[class*="title"]', '[class*="ConversationTitle"]'],
    defaultTitle = 'Conversation',
  } = options;

  for (const sel of titleSelectors) {
    try {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) return el.textContent.trim();
    } catch (_) {}
  }
  return defaultTitle;
}

/**
 * Timestamp string'ini ISO 8601'e normalize eder.
 * @param {string} value - Raw timestamp
 * @returns {string|null} ISO string or null
 */
export function normalizeTimestamp(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Block element icinden timestamp cikarir.
 * @param {Element} block - Message block element
 * @returns {string|null} ISO timestamp or null
 */
export function extractTimestampFromElement(block) {
  if (!block) return null;

  const candidates = [];

  for (const attr of TIMESTAMP_ATTRS) {
    const v = block.getAttribute?.(attr);
    if (v) candidates.push(v);
  }

  const timeEl = block.querySelector?.('time[datetime], time');
  if (timeEl) {
    const dt = timeEl.getAttribute('datetime');
    if (dt) candidates.push(dt);
    if (timeEl.textContent?.trim()) candidates.push(timeEl.textContent.trim());
  }

  const nested = block.querySelector?.('[data-time], [data-timestamp], [datetime], [title], [aria-label]');
  if (nested) {
    for (const attr of TIMESTAMP_ATTRS) {
      const v = nested.getAttribute?.(attr);
      if (v) candidates.push(v);
    }
  }

  for (const c of candidates) {
    const ts = normalizeTimestamp(c);
    if (ts) return ts;
  }
  return null;
}

/**
 * Node veya block'tan role infer eder.
 * @param {Node} node - Content node
 * @param {Element} [block] - Optional block container
 * @returns {'user'|'assistant'}
 */
export function inferRoleFromNode(node, block) {
  const holder =
    block ||
    node?.closest?.('[data-message-author-role], [data-role], article, [class*="message"], [class*="Message"]') ||
    node?.parentElement;

  if (!holder) return 'assistant';

  const explicit =
    holder?.getAttribute?.('data-message-author-role') ||
    holder?.getAttribute?.('data-role') ||
    holder?.querySelector?.('[data-message-author-role]')?.getAttribute?.('data-message-author-role');

  if (explicit === 'user') return 'user';

  const cls = `${holder?.className || ''}`.toLowerCase();
  if (cls.includes('user')) return 'user';

  if (holder?.querySelector?.('[class*="user"]')) return 'user';

  return 'assistant';
}

/**
 * Mesaj listesini skorlar (extraction kalitesi icin).
 * @param {Array<{html?: string}>} messages
 * @returns {{ count: number, textLen: number, richCount: number, total: number }}
 */
export function scoreMessages(messages) {
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

  return {
    count: list.length,
    textLen,
    richCount,
    total: textLen + richCount * 80 + list.length * 20,
  };
}

/**
 * Extraction zayif mi kontrol eder.
 * @param {Array<{html?: string}>} messages
 * @returns {boolean}
 */
export function isWeakExtraction(messages) {
  const s = scoreMessages(messages);
  if (!s.count) return true;
  if (s.count === 1 && s.textLen < 40 && s.richCount === 0) return true;
  return s.total < 90;
}
