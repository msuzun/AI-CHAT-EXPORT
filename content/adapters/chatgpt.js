/**
 * ChatGPT / chat.openai.com adapter
 * Selectors may need updates when OpenAI changes their UI
 */
import { cloneWithBase64Images } from './utils.js';

export async function extractChatGPT() {
  const messages = [];
  const items = document.querySelectorAll(
    '[data-message-author-role]'
  ) || document.querySelectorAll('div[class*="group"][data-message-author-role], article'
  );

  const fallbackItems = document.querySelectorAll(
    '[class*="markdown"]'
  )?.length
    ? Array.from(document.querySelectorAll('[class*="ConversationItem"]')).filter(
        el => el.querySelector('[class*="markdown"]')
      )
    : [];

  const messageBlocks =
    items?.length > 0 ? items : document.querySelectorAll('article') || fallbackItems;

  if (messageBlocks.length === 0) {
    const prose = document.querySelector('[class*="markdown"], [class*="prose"], .markdown');
    if (prose) {
      const role = document.querySelector('[data-message-author-role="user"]') ? 'user' : 'assistant';
      const html = await serializeWithImages(prose);
      return { messages: [{ role, html }], title: getTitle() };
    }
  }

  for (let i = 0; i < messageBlocks.length; i++) {
    const block = messageBlocks[i];
    const role =
      block.getAttribute?.('data-message-author-role') ||
      block.querySelector?.('[data-message-author-role]')?.getAttribute?.('data-message-author-role') ||
      (block.querySelector?.('[class*="user"]') ? 'user' : 'assistant');
    const content =
      block.querySelector?.('[class*="markdown"]') ||
      block.querySelector?.('.markdown') ||
      block.querySelector?.('[class*="prose"]') ||
      block.querySelector?.('[class*="text"]') ||
      block;
    if (content && content.textContent?.trim()) {
      const html = await serializeWithImages(content);
      messages.push({ role: role === 'user' ? 'user' : 'assistant', html });
    }
  }

  return { messages, title: getTitle() };
}

async function serializeWithImages(node) {
  const clone = await cloneWithBase64Images(node);
  const wrapper = document.createElement('div');
  wrapper.appendChild(clone);
  return wrapper.innerHTML;
}

function getTitle() {
  return (
    document.querySelector('h1')?.textContent ||
    document.querySelector('[class*="ConversationTitle"]')?.textContent ||
    'ChatGPT Conversation'
  );
}
