/**
 * Google Gemini adapter
 * Selectors based on common Gemini UI patterns
 */
import { cloneWithBase64Images } from './utils.js';

export async function extractGemini() {
  const messages = [];

  const turnBlocks =
    document.querySelectorAll('[data-turn-id]') ||
    document.querySelectorAll('[class*="turn"]') ||
    document.querySelectorAll('[class*="message"]') ||
    document.querySelectorAll('.model-response, [class*="modelResponse"]') ||
    document.querySelectorAll('[class*="ConversationTurn"]');

  const userBlocks = document.querySelectorAll('[class*="user-"], [class*="UserMessage"], [data-role="user"]');
  const modelBlocks = document.querySelectorAll('[class*="model-"], [class*="ModelResponse"], [data-role="model"]');

  let items = [];
  if (turnBlocks.length > 0) {
    items = Array.from(turnBlocks);
  } else {
    items = mergeByOrder(userBlocks, modelBlocks);
  }

  if (items.length === 0) {
    const anyContent = document.querySelector('[class*="markdown"], [class*="content"], [class*="message"]');
    if (anyContent) {
      const html = await serializeWithImages(anyContent);
      return { messages: [{ role: 'assistant', html }], title: getTitle() };
    }
  }

  for (const block of items) {
    const isUser =
      block.className?.includes?.('user') ||
      block.className?.includes?.('User') ||
      block.getAttribute?.('data-role') === 'user';
    const content =
      block.querySelector?.('[class*="markdown"]') ||
      block.querySelector?.('[class*="content"]') ||
      block.querySelector?.('[class*="text"]') ||
      block.querySelector?.('.markdown') ||
      block;
    if (content && content.textContent?.trim()) {
      const html = await serializeWithImages(content);
      messages.push({ role: isUser ? 'user' : 'assistant', html });
    }
  }

  return { messages, title: getTitle() };
}

function mergeByOrder(userEls, modelEls) {
  const all = [];
  const u = Array.from(userEls);
  const m = Array.from(modelEls);
  let i = 0,
    j = 0;
  while (i < u.length || j < m.length) {
    if (i >= u.length) {
      all.push(...m.slice(j));
      break;
    }
    if (j >= m.length) {
      all.push(...u.slice(i));
      break;
    }
    const uPos = u[i].compareDocumentPosition(m[j]);
    if (uPos & Node.DOCUMENT_POSITION_FOLLOWING) {
      all.push(u[i++]);
    } else {
      all.push(m[j++]);
    }
  }
  return all;
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
    'Gemini Conversation'
  );
}
