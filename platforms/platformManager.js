/** Only ChatGPT origins are supported. */
const chatgpt = { id: 'chatgpt', name: 'ChatGPT', hosts: ['chatgpt.com', 'chat.openai.com'] };
const PLATFORMS = { chatgpt };
const PlatformManager = {
  getPlatform(value) {
    try {
      const url = new URL(value.includes('://') ? value : `https://${value}`);
      return url.protocol === 'https:' && chatgpt.hosts.includes(url.hostname)
        ? { id: 'chatgpt', name: 'ChatGPT' } : null;
    } catch { return null; }
  },
  isLikelyChatUrl(id, value) {
    try {
      return id === 'chatgpt' && !!this.getPlatform(value) && /\/(c|share)\/[^/]+/.test(new URL(value).pathname);
    } catch { return false; }
  },
  getAllPatterns() { return chatgpt.hosts.map((host) => `https://${host}/*`); },
};
export { PLATFORMS, PlatformManager };
