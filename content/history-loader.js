/** Collect lazy/virtualized ChatGPT turns before exporting any format. */
(function () {
  if (globalThis.ChatGPTHistory) return;
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function failure(message) {
    const error = new Error(message);
    error.code = 'HISTORY_INCOMPLETE';
    return error;
  }
  function findScroller() {
    const first = document.querySelector('[data-message-author-role], article[data-testid^="conversation-turn"]');
    for (let el = first?.parentElement; el; el = el.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.clientHeight > 0) return el;
    }
    return document.scrollingElement;
  }
  function isLoading(scroller) {
    const root = scroller === document.scrollingElement ? document.querySelector('main') || scroller : scroller;
    return Array.from(root.querySelectorAll('[aria-busy="true"],[role="progressbar"],[data-testid*="loading"],[class*="animate-spin"],[class*="skeleton"]'))
      .some((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  }

  async function collect(snapshot) {
    const sourceUrl = location.href;
    const scroller = findScroller();
    if (!scroller) throw failure('Sohbetin kaydırma alanı bulunamadı. Sayfayı yenileyip tekrar deneyin.');
    const saved = { top: scroller.scrollTop, left: scroller.scrollLeft, bottom: scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop };
    const savedBehavior = scroller.style.scrollBehavior;
    const records = new Map();
    const order = [];
    let direction = 'down';
    let quietSince = Date.now();
    let lastProgress = Date.now();
    let previousState = '';
    let title = '';
    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;background:#172033;color:white;padding:14px 18px;border-radius:10px;font:14px system-ui;box-shadow:0 4px 20px #0004;max-width:340px';
    document.body.appendChild(status);
    scroller.style.scrollBehavior = 'auto';
    // Send independently of snapshot work: resolving many images can take longer
    // than the service worker's idle interval.
    const heartbeat = setInterval(() => {
      try { Ext.runtime.sendMessage({ action: 'HISTORY_PROGRESS', count: records.size }).catch(() => {}); } catch (_) {}
    }, 1000);
    try {
      while (true) {
        if (location.href !== sourceUrl) throw failure('Sohbet değişti. Aktarım durduruldu; doğru sohbeti açıp tekrar deneyin.');
        const batch = await snapshot();
        title = batch.title || title;
        const messages = batch.messages || [];
        let changed = false;
        // Insert new turns before their next known neighbour; preserve repeated text.
        for (let i = messages.length - 1; i >= 0; i--) {
          const message = messages[i];
          const key = message._historyKey;
          if (!key) throw failure('Mesaj kimliği belirlenemedi; eksik aktarım engellendi.');
          const old = records.get(key);
          if (!old) {
            const next = messages.slice(i + 1).find((m) => records.has(m._historyKey));
            const at = next ? order.indexOf(next._historyKey) : direction === 'up' && order.length ? 0 : order.length;
            order.splice(at, 0, key);
          }
          if (!old || old.html !== message.html) changed = true;
          records.set(key, message);
        }
        const now = Date.now();
        const state = `${direction}:${scroller.scrollTop}:${scroller.scrollHeight}:${messages.map((m) => m._historyKey).join('|')}`;
        if (changed || state !== previousState) {
          lastProgress = now;
          quietSince = now;
          previousState = state;
        }
        status.textContent = `Sohbetin tamamı yükleniyor… ${records.size} mesaj alındı. ${direction === 'up' ? 'Önceki mesajlar kontrol ediliyor.' : 'Son mesajlara ulaşılıyor.'}`;
        const busy = isLoading(scroller);
        const atEdge = direction === 'up' ? scroller.scrollTop <= 2 : scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 2;
        if (busy) quietSince = now;
        if (atEdge && !busy && now - quietSince >= (direction === 'up' ? 8000 : 2000)) {
          if (direction === 'down') {
            direction = 'up';
            quietSince = now;
          } else {
            const result = order.map((key) => records.get(key));
            const indexed = result.filter((m) => Number.isInteger(m._turnIndex));
            const indices = [...new Set(indexed.map((m) => m._turnIndex))].sort((a, b) => a - b);
            const gap = indices.some((value, i) => i > 0 && value > indices[i - 1] + 1);
            if (!result.length || result[0].role !== 'user' || indices[0] > 1 || gap) {
              // A top boundary with missing earlier turns is not completion.
              if (now - lastProgress > 45000) throw failure('Sohbetin önceki mesajları yüklenemedi. Eksik dosya oluşturulmadı; bağlantıyı kontrol edip tekrar deneyin.');
            } else {
              if (indexed.length === result.length) result.sort((a, b) => a._turnIndex - b._turnIndex);
              return { title, messages: result };
            }
          }
        }
        if (now - lastProgress > 45000) throw failure('Sohbet yüklemesi 45 saniyedir ilerlemiyor. Eksik dosya oluşturulmadı; tekrar deneyin.');
        const step = Math.max(100, Math.floor(scroller.clientHeight * 0.65));
        const destination = direction === 'up' ? Math.max(0, scroller.scrollTop - step) : Math.min(scroller.scrollHeight - scroller.clientHeight, scroller.scrollTop + step);
        scroller.scrollTo({ top: destination, behavior: 'instant' });
        await pause(500);
      }
    } finally {
      clearInterval(heartbeat);
      status.remove();
      scroller.style.scrollBehavior = savedBehavior;
      // Preserve distance from the bottom when older turns have been prepended.
      if (location.href === sourceUrl && scroller.isConnected) scroller.scrollTo({ top: Math.max(0, scroller.scrollHeight - scroller.clientHeight - saved.bottom), left: saved.left, behavior: 'instant' });
    }
  }
  globalThis.ChatGPTHistory = { collect };
})();
