import { extractChatGPT } from './chatgpt.js';
import { extractGemini } from './gemini.js';
import { extractDeepSeek } from './deepseek.js';
import { extractClaude } from './claude.js';

const extractors = {
  chatgpt: extractChatGPT,
  gemini: extractGemini,
  deepseek: extractDeepSeek,
  claude: extractClaude,
};

export function extractChat(siteId) {
  const fn = extractors[siteId];
  if (!fn) return null;
  return fn();
}
