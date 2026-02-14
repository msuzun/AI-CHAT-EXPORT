/**
 * @fileoverview DOM manipulation utilities for chat extraction.
 * @module utils/domUtils
 */

import { cloneWithBase64Images } from './imageUtils.js';

/** Selector cache: selector -> NodeList (weak ref) */
const selectorCache = new Map();
const CACHE_TTL_MS = 5000;
let lastCacheClear = Date.now();

function maybeClearSelectorCache() {
  if (Date.now() - lastCacheClear > CACHE_TTL_MS) {
    selectorCache.clear();
    lastCacheClear = Date.now();
  }
}

/**
 * Selector ile elementleri bulur. Kisa sureli cache kullanir.
 * @param {string} selector - CSS selector
 * @param {Element} [root=document] - Root element
 * @returns {Element[]}
 */
export function querySelectorAllCached(selector, root = document) {
  maybeClearSelectorCache();
  const key = `${selector}::${root === document ? 'doc' : (root?.id || root?.className || 'root')}`;
  const cached = selectorCache.get(key);
  if (cached) return Array.from(cached);
  try {
    const els = root.querySelectorAll(selector);
    selectorCache.set(key, els);
    return Array.from(els);
  } catch {
    return [];
  }
}

/** Role-only text pattern (etiket metni olarak kabul edilmez) */
const ROLE_ONLY_PATTERN = /^(kullanici|asistan|assistant|user|you|chatgpt)$/i;

/** Anlamli icerik elementleri */
const MEANINGFUL_SELECTORS = 'img, picture, video, canvas, math, table, pre, code, blockquote, ul, ol, li';

/** Temizlenecek elementler (hasMeaningfulNodeContent icin) */
const STRIP_SELECTORS = 'button, nav, form, script, style, svg, [aria-hidden="true"]';

/**
 * Node'un anlamli metin/medya icerigi olup olmadigini kontrol eder.
 * @param {Node} node - DOM node
 * @returns {boolean}
 */
export function hasMeaningfulNodeContent(node) {
  if (!node) return false;
  const clone = node.cloneNode(true);
  clone.querySelectorAll?.(STRIP_SELECTORS).forEach((el) => el.remove());
  const plain = (clone.textContent || '').replace(/\s+/g, ' ').trim();
  if (plain && !ROLE_ONLY_PATTERN.test(plain)) return true;
  return !!clone.querySelector?.(MEANINGFUL_SELECTORS);
}

/**
 * HTML string'in anlamli icerik tasiyip tasimadigini kontrol eder.
 * @param {string} html - HTML string
 * @returns {boolean}
 */
export function hasMeaningfulHtmlContent(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return hasMeaningfulNodeContent(div);
}

/** Sanitize icin kaldirilacak selector'lar */
const SANITIZE_SELECTORS = [
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
].join(',');

/**
 * HTML'i export icin temizler.
 * @param {string} html - Raw HTML
 * @returns {string}
 */
export function sanitizeExtractedHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  div.querySelectorAll?.(SANITIZE_SELECTORS).forEach((el) => el.remove());
  return div.innerHTML;
}

/**
 * Metni HTML escape eder.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text ?? '';
  return d.innerHTML;
}

/**
 * Node'u HTML string'e serialize eder. Img'leri base64'e cevirir.
 * @param {Node} node - DOM node
 * @param {{ fallbackPlainText?: boolean }} [options]
 * @returns {Promise<string>}
 */
export async function serializeWithImages(node, options = {}) {
  const { fallbackPlainText = true } = options;
  try {
    const clone = await cloneWithBase64Images(node);
    const wrapper = document.createElement('div');
    wrapper.appendChild(clone);
    let html = wrapper.innerHTML;
    if (fallbackPlainText && (!html || html.trim().length < 10)) {
      const text = (node.textContent || '').trim();
      if (text) html = `<p style="white-space:pre-wrap">${escapeHtml(text)}</p>`;
    }
    return html;
  } catch (err) {
    const text = (node?.textContent || '').trim();
    return text ? `<p style="white-space:pre-wrap">${escapeHtml(text)}</p>` : '';
  }
}

/**
 * Root icinde ilk anlamli icerikli elementi bulur.
 * @param {Element} root - Root element
 * @param {string[]} selectors - Denenecek selector listesi
 * @returns {Element|null}
 */
export function pickFirstMeaningful(root, selectors) {
  if (!root) return null;
  for (const sel of selectors) {
    const el = root.querySelector?.(sel);
    if (el && hasMeaningfulNodeContent(el)) return el;
  }
  return null;
}
