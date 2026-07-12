import { extensionConfig } from './config';
import { getAccessToken } from './supabase';
import type { ReplyIntent } from './types';

export interface ReplyRequest {
  conversation: string;
  candidateName: string;
  targetRole?: string;
  workAuth?: string;
  channel?: string;
  subject?: string;
  extraNotes?: string;
  intent?: ReplyIntent;
}

export interface GeneratedReply {
  subject?: string;
  body: string;
}

export interface IntentOption {
  value: ReplyIntent;
  label: string;
  description: string;
}

export async function generateReply(req: ReplyRequest): Promise<GeneratedReply> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in');

  const res = await fetch(`${extensionConfig.apiBaseUrl}/api/extension/recruiter-reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(req),
  });

  const json = (await res.json()) as GeneratedReply & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

export async function fetchIntents(): Promise<IntentOption[]> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in');

  const res = await fetch(`${extensionConfig.apiBaseUrl}/api/extension/intents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as { intents?: IntentOption[]; error?: string };
  if (!res.ok) throw new Error(json.error ?? 'Failed to load intents');
  return json.intents ?? [];
}
