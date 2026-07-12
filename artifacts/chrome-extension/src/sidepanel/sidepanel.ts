import { fetchCandidates, getProfile, type CandidatePick } from '../lib/supabase';
import { fetchIntents, generateReply } from '../lib/api';
import type { ExtractedConversation, ReplyIntent } from '../lib/types';

const loginRequired = document.getElementById('login-required')!;
const mainUi = document.getElementById('main-ui')!;
const candidateSelect = document.getElementById('candidate') as HTMLSelectElement;
const channelSelect = document.getElementById('channel') as HTMLSelectElement;
const intentSelect = document.getElementById('intent') as HTMLSelectElement;
const subjectInput = document.getElementById('subject') as HTMLInputElement;
const conversationInput = document.getElementById('conversation') as HTMLTextAreaElement;
const extraNotesInput = document.getElementById('extra-notes') as HTMLInputElement;
const replySubject = document.getElementById('reply-subject') as HTMLInputElement;
const replyBody = document.getElementById('reply-body') as HTMLTextAreaElement;
const captureHint = document.getElementById('capture-hint')!;
const platformBadge = document.getElementById('platform-badge')!;
const errorEl = document.getElementById('error')!;
const generateBtn = document.getElementById('generate') as HTMLButtonElement;
const copyBtn = document.getElementById('copy') as HTMLButtonElement;

let candidates: CandidatePick[] = [];

function showError(msg: string) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

function clearError() {
  errorEl.classList.add('hidden');
}

function applyConversation(data: ExtractedConversation | null) {
  if (!data?.conversation?.trim()) return;

  conversationInput.value = data.conversation;
  if (data.subject) subjectInput.value = data.subject;

  if (data.platform === 'linkedin') channelSelect.value = 'linkedin';
  else if (data.platform === 'gmail') channelSelect.value = 'email';

  platformBadge.textContent = data.platform;
  platformBadge.classList.remove('hidden');

  const when = new Date(data.capturedAt).toLocaleTimeString();
  captureHint.textContent = `Auto-captured from ${data.platform} at ${when}`;
}

async function loadStoredConversation() {
  const data = await chrome.runtime.sendMessage({ type: 'GET_STORED_CONVERSATION' });
  applyConversation(data as ExtractedConversation | null);
}

async function requestExtract() {
  const data = await chrome.runtime.sendMessage({ type: 'REQUEST_EXTRACT' });
  applyConversation(data as ExtractedConversation | null);
}

function fillCandidates(list: CandidatePick[]) {
  candidateSelect.innerHTML = '<option value="">Select candidate…</option>';
  for (const c of list) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.full_name}${c.target_roles?.[0] ? ` — ${c.target_roles[0]}` : ''}`;
    opt.dataset.name = c.full_name;
    opt.dataset.roles = (c.target_roles ?? []).join(' | ');
    opt.dataset.auth = c.work_auth ?? '';
    candidateSelect.appendChild(opt);
  }
}

async function init() {
  const profile = await getProfile();
  if (!profile) {
    loginRequired.classList.remove('hidden');
    return;
  }

  mainUi.classList.remove('hidden');

  const [cands, intents] = await Promise.all([fetchCandidates(), fetchIntents()]);
  candidates = cands;
  fillCandidates(cands);

  intentSelect.innerHTML = '';
  for (const i of intents) {
    const opt = document.createElement('option');
    opt.value = i.value;
    opt.textContent = i.label;
    intentSelect.appendChild(opt);
  }

  await loadStoredConversation();

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.lastConversation?.newValue) {
      applyConversation(changes.lastConversation.newValue as ExtractedConversation);
    }
  });
}

generateBtn.addEventListener('click', async () => {
  clearError();
  const selected = candidateSelect.selectedOptions[0];
  if (!selected?.dataset.name) {
    showError('Select a candidate');
    return;
  }
  if (!conversationInput.value.trim()) {
    showError('Paste or capture a conversation first');
    return;
  }

  generateBtn.disabled = true;
  generateBtn.textContent = 'Drafting…';

  try {
    const reply = await generateReply({
      conversation: conversationInput.value.trim(),
      candidateName: selected.dataset.name,
      targetRole: selected.dataset.roles || undefined,
      workAuth: selected.dataset.auth || undefined,
      channel: channelSelect.value,
      subject: subjectInput.value.trim() || undefined,
      extraNotes: extraNotesInput.value.trim() || undefined,
      intent: intentSelect.value as ReplyIntent,
    });

    if (channelSelect.value === 'email') {
      replySubject.classList.remove('hidden');
      replySubject.value = reply.subject ?? '';
    } else {
      replySubject.classList.add('hidden');
    }
    replyBody.value = reply.body;
    copyBtn.disabled = false;
  } catch (err) {
    showError(err instanceof Error ? err.message : 'Generation failed');
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = '✨ Generate reply';
  }
});

copyBtn.addEventListener('click', async () => {
  const text =
    channelSelect.value === 'email' && replySubject.value.trim()
      ? `Subject: ${replySubject.value.trim()}\n\n${replyBody.value}`
      : replyBody.value;
  await navigator.clipboard.writeText(text);
  copyBtn.textContent = 'Copied!';
  setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
});

document.getElementById('refresh-conv')!.addEventListener('click', () => void requestExtract());

channelSelect.addEventListener('change', () => {
  if (channelSelect.value === 'email') replySubject.classList.remove('hidden');
  else replySubject.classList.add('hidden');
});

void init();
