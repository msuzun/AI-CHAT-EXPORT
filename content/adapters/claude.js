/**
 * Claude (Anthropic) adapter
 */
import { cloneWithBase64Images } from './utils.js';

export async function extractClaude() {
  const messages = [];

  const items =
    document.querySelectorAll('[class*="Message"]') ||
    document.querySelectorAll('[class*="message-"]') ||
    document.querySelectorAll('[data-role]') ||
    document.querySelectorAll('article');

  if (items.length === 0) {
    const content = document.querySelector('[class*="markdown"], [class*="content"], [class*="prose"]');
    if (content) {
      const html = await serializeWithImages(content);
      return { messages: [{ role: 'assistant', html }], title: getTitle() };
    }
  }

  for (const block of items) {
    const isUser =
      block.className?.includes?.('user') ||
      block.getAttribute?.('data-role') === 'user' ||
      block.querySelector?.('[class*="user"]');
    const content =
      block.querySelector?.('[class*="markdown"]') ||
      block.querySelector?.('[class*="content"]') ||
      block.querySelector?.('[class*="prose"]') ||
      block.querySelector?.('.markdown') ||
      block;
    if (content && content.textContent?.trim()) {
      const html = await serializeWithImages(content);
      messages.push({ role: isUser ? 'user' : 'assistant', html });
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
    document.querySelector('[class*="title"]')?.textContent ||
    'Claude Conversation'
  );
}
