import type { ExtractedConversation } from '../lib/types';

export function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: unknown[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

export function textOf(el: Element | null | undefined): string {
  return el?.textContent?.trim() ?? '';
}

export function publishConversation(data: ExtractedConversation): void {
  if (!data.conversation.trim()) return;
  chrome.runtime.sendMessage({ type: 'CONVERSATION_CAPTURED', payload: data }).catch(() => {});
}

export function watchConversation(extract: () => ExtractedConversation | null): void {
  const run = debounce(() => {
    const data = extract();
    if (data?.conversation.trim()) publishConversation(data);
  }, 800);

  run();
  const observer = new MutationObserver(() => run());
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'EXTRACT_NOW') {
      const data = extract();
      if (data) publishConversation(data);
      sendResponse(data);
      return true;
    }
    return false;
  });
}
