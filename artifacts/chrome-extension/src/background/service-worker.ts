import type { ExtractedConversation, ExtensionMessage } from '../lib/types';

const conversationsByTab = new Map<number, ExtractedConversation>();

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.type === 'CONVERSATION_CAPTURED' && message.payload && sender.tab?.id) {
    const payload = message.payload as ExtractedConversation;
    conversationsByTab.set(sender.tab.id, payload);
    chrome.storage.local.set({
      lastConversation: { ...payload, tabId: sender.tab.id },
    });
    chrome.action.setBadgeText({ text: '●', tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#00C896', tabId: sender.tab.id });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'GET_STORED_CONVERSATION') {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tab?.id;
      const fromTab = tabId ? conversationsByTab.get(tabId) : undefined;
      if (fromTab) {
        sendResponse(fromTab);
        return;
      }
      const stored = await chrome.storage.local.get('lastConversation');
      sendResponse(stored.lastConversation ?? null);
    })();
    return true;
  }

  if (message.type === 'REQUEST_EXTRACT') {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        sendResponse(null);
        return;
      }
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_NOW' });
        sendResponse(response);
      } catch {
        sendResponse(null);
      }
    })();
    return true;
  }

  if (message.type === 'OPEN_SIDE_PANEL') {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await chrome.sidePanel.open({ tabId: tab.id });
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  conversationsByTab.delete(tabId);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const stored = conversationsByTab.get(tabId);
  if (stored) {
    chrome.action.setBadgeText({ text: '●', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
});
