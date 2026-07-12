import { watchConversation, textOf } from './shared';
import type { ExtractedConversation } from '../lib/types';

function extractIndeed(): ExtractedConversation | null {
  const url = location.href;
  const parts: string[] = [];

  // Indeed messaging
  const messages = document.querySelectorAll(
    '[data-testid="message-text"], .im-message-text, [class*="MessageBubble"], [class*="message-body"]',
  );
  for (const el of messages) {
    const t = textOf(el);
    if (t.length > 2) parts.push(t);
  }

  // Application / employer message panels
  if (parts.length === 0) {
    const panels = document.querySelectorAll('[class*="conversation"] p, [class*="Conversation"] div');
    for (const el of panels) {
      const t = textOf(el);
      if (t.length > 20 && t.length < 2000) parts.push(t);
    }
  }

  const conversation = [...new Set(parts)].join('\n\n---\n\n').trim();
  if (!conversation) return null;

  const subject =
    textOf(document.querySelector('h1')) ||
    textOf(document.querySelector('[class*="jobTitle"]'));

  return {
    platform: 'indeed',
    conversation,
    subject: subject || undefined,
    url,
    capturedAt: new Date().toISOString(),
  };
}

watchConversation(extractIndeed);
