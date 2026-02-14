/**
 * @fileoverview Image conversion utilities with cache support.
 * @module utils/imageUtils
 */

/** @type {Map<string, string>} URL -> base64 cache */
const imageCache = new Map();
const CACHE_MAX_SIZE = 100;

/**
 * URL'i base64 data URL'e donusturur. CORS icin fetch kullanir.
 * @param {string} url - Image URL
 * @param {{ useCache?: boolean, credentials?: RequestCredentials }} [options]
 * @returns {Promise<string>} Base64 data URL or original url on failure
 */
export async function imageToBase64(url, options = {}) {
  const { useCache = true, credentials = 'include' } = options;
  if (!url || typeof url !== 'string') return url || '';
  if (url.startsWith('data:')) return url;

  if (useCache && imageCache.has(url)) {
    return imageCache.get(url);
  }

  try {
    const res = await fetch(url, { mode: 'cors', credentials });
    const blob = await res.blob();
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    if (base64 && useCache) {
      if (imageCache.size >= CACHE_MAX_SIZE) {
        const firstKey = imageCache.keys().next().value;
        if (firstKey) imageCache.delete(firstKey);
      }
      imageCache.set(url, base64);
    }
    return base64;
  } catch {
    return url;
  }
}

/**
 * Image element'in src'ini base64'e cevirir. Canvas fallback destekler.
 * @param {HTMLImageElement} img - Image element
 * @returns {Promise<string>} Base64 data URL
 */
export async function imageElementToBase64(img) {
  if (!img) return '';
  const src = img.currentSrc || img.getAttribute('src') || img.src || '';
  if (!src) return '';
  if (src.startsWith('data:')) return src;

  try {
    const base64 = await imageToBase64(src);
    if (base64?.startsWith?.('data:')) return base64;
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

/**
 * Node'u klonlar ve icindeki img'leri base64'e cevirir.
 * @param {Node} node - DOM node
 * @param {{ useCache?: boolean }} [options]
 * @returns {Promise<Node>} Cloned node with base64 images
 */
export async function cloneWithBase64Images(node, options = {}) {
  if (!node) return node;
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

/**
 * Image cache'i temizler.
 */
export function clearImageCache() {
  imageCache.clear();
}
