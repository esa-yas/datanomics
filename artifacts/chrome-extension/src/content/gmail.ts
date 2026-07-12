import { watchConversation, textOf } from './shared';
import type { ExtractedConversation } from '../lib/types';

function extractGmail(): ExtractedConversation | null {
  const url = location.href;
  const subject = textOf(document.querySelector('h2.hP'));

  const parts: string[] = [];

  // Open thread view
  const bodies = document.querySelectorAll('.a3s.aiL, .ii.gt');
  for (const el of bodies) {
    const t = textOf(el);
    if (t.length > 10) parts.push(t);
  }

  // Compose / reply area sometimes shows quoted thread
  if (parts.length === 0) {
    const compose = document.querySelectorAll('[aria-label="Message Body"], .Am.Al.editable');
    for (const el of compose) {
      const t = textOf(el);
      if (t.length > 20) parts.push(t);
    }
  }

  // Headers for context
  const headers = document.querySelectorAll('.gE.iv.gt');
  for (const el of headers) {
    const from = textOf(el);
    if (from) parts.unshift(`From: ${from}`);
  }

  const conversation = parts.join('\n\n---\n\n').trim();
  if (!conversation) return null;

  return {
    platform: 'gmail',
    conversation,
    subject: subject || undefined,
    url,
    capturedAt: new Date().toISOString(),
  };
}

watchConversation(extractGmail);
