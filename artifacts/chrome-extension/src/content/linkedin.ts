import { watchConversation, textOf } from './shared';
import type { ExtractedConversation } from '../lib/types';

function extractLinkedIn(): ExtractedConversation | null {
  const url = location.href;

  // Messaging thread
  const messageBodies = [
    ...document.querySelectorAll('.msg-s-event-listitem__body'),
    ...document.querySelectorAll('[class*="msg-s-message-group"] [class*="message-body"]'),
    ...document.querySelectorAll('.msg-s-message-list-content p'),
  ];

  const lines: string[] = [];
  for (const el of messageBodies) {
    const t = textOf(el);
    if (t && t.length > 2) lines.push(t);
  }

  // InMail / recruiter message overlay
  if (lines.length === 0) {
    const inmail = document.querySelectorAll(
      '.artdeco-modal__content .msg-s-event-listitem__body, .msg-overlay-conversation-bubble',
    );
    for (const el of inmail) {
      const t = textOf(el);
      if (t) lines.push(t);
    }
  }

  const conversation = lines.join('\n\n---\n\n').trim();
  if (!conversation) return null;

  const subject =
    textOf(document.querySelector('.msg-thread__link-to-profile')) ||
    textOf(document.querySelector('h2.msg-thread__heading'));

  return {
    platform: 'linkedin',
    conversation,
    subject: subject || undefined,
    url,
    capturedAt: new Date().toISOString(),
  };
}

watchConversation(extractLinkedIn);
