/**
 * Convert image to base64 (handles CORS by fetching via extension)
 */
export async function imageToBase64(url) {
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

/**
 * Get KaTeX/CSS styles for math rendering
 */
export function getKatexStyles() {
  const links = Array.from(document.querySelectorAll('link[href*="katex"]'));
  return links.map(l => `<link rel="stylesheet" href="${l.href}">`).join('');
}

/**
 * Clone node with images converted to base64
 */
export async function cloneWithBase64Images(node) {
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
