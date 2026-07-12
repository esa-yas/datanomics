import { decryptSecret } from './crypto';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface GmailLabel {
  id: string;
  name: string;
}

export interface GmailMessageMeta {
  id: string;
  threadId: string;
  labelIds: string[];
  internalDate: string;
  from: string | null;
  subject: string | null;
}

async function gmailFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 403 && body.includes('Gmail API has not been used')) {
      throw new Error(
        'gmail_api_disabled: Enable the Gmail API in Google Cloud Console (APIs & Services → Library → Gmail API → Enable), wait 1–2 minutes, then try again.',
      );
    }
    throw new Error(`Gmail API ${path} failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
}> {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OAuth token exchange failed: ${err.slice(0, 200)}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
}

export async function refreshAccessToken(
  refreshTokenEncrypted: string,
  clientId: string,
  clientSecret: string,
  decrypt: (s: string) => string,
): Promise<{ access_token: string; expires_in: number }> {
  const refreshToken = decrypt(refreshTokenEncrypted);
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OAuth refresh failed: ${err.slice(0, 200)}`);
  }
  return (await res.json()) as { access_token: string; expires_in: number };
}

export async function fetchGmailProfile(accessToken: string): Promise<{
  emailAddress: string;
  historyId: string;
}> {
  const data = await gmailFetch<{ emailAddress?: string; historyId?: string }>(accessToken, '/profile');
  if (!data.emailAddress) throw new Error('Gmail profile missing email');
  if (!data.historyId) throw new Error('Gmail profile missing historyId');
  return { emailAddress: data.emailAddress, historyId: data.historyId };
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string> {
  const profile = await fetchGmailProfile(accessToken);
  return profile.emailAddress;
}

export async function listLabels(accessToken: string): Promise<GmailLabel[]> {
  const data = await gmailFetch<{ labels?: GmailLabel[] }>(accessToken, '/labels');
  return data.labels ?? [];
}

export async function findApplyLabelId(accessToken: string): Promise<string | null> {
  return findLabelIdByName(accessToken, 'apply');
}

export async function findInterviewLabelId(accessToken: string): Promise<string | null> {
  return findLabelIdByName(accessToken, 'interview');
}

export async function findLabelIdByName(accessToken: string, labelName: string): Promise<string | null> {
  const labels = await listLabels(accessToken);
  const match = labels.find((l) => l.name?.toLowerCase() === labelName.toLowerCase());
  return match?.id ?? null;
}

export async function listApplyMessageIds(
  accessToken: string,
  applyLabelId: string,
  pageToken?: string,
): Promise<{ ids: string[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    labelIds: applyLabelId,
    maxResults: '100',
  });
  if (pageToken) params.set('pageToken', pageToken);

  const data = await gmailFetch<{
    messages?: { id: string }[];
    nextPageToken?: string;
  }>(accessToken, `/messages?${params}`);

  return {
    ids: (data.messages ?? []).map((m) => m.id),
    nextPageToken: data.nextPageToken,
  };
}

export async function listAllApplyMessageIds(
  accessToken: string,
  applyLabelId: string,
): Promise<string[]> {
  const allIds: string[] = [];
  let pageToken: string | undefined;
  do {
    const page = await listApplyMessageIds(accessToken, applyLabelId, pageToken);
    allIds.push(...page.ids);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return allIds;
}

export async function listHistoryMessageIds(
  accessToken: string,
  startHistoryId: string,
  applyLabelId: string,
  pageToken?: string,
): Promise<{ messageIds: string[]; nextPageToken?: string; latestHistoryId?: string }> {
  const params = new URLSearchParams({
    startHistoryId,
    labelId: applyLabelId,
    historyTypes: 'labelAdded',
    maxResults: '100',
  });
  params.append('historyTypes', 'messageAdded');
  if (pageToken) params.set('pageToken', pageToken);

  const data = await gmailFetch<{
    history?: Array<{
      messages?: { id: string }[];
      messagesAdded?: { message: { id: string } }[];
      labelsAdded?: { message: { id: string }; labelIds: string[] }[];
    }>;
    nextPageToken?: string;
    historyId?: string;
  }>(accessToken, `/history?${params}`);

  const ids = new Set<string>();
  for (const record of data.history ?? []) {
    for (const added of record.labelsAdded ?? []) {
      if (added.labelIds.includes(applyLabelId)) {
        ids.add(added.message.id);
      }
    }
    for (const added of record.messagesAdded ?? []) {
      ids.add(added.message.id);
    }
    for (const msg of record.messages ?? []) {
      ids.add(msg.id);
    }
  }

  return {
    messageIds: [...ids],
    nextPageToken: data.nextPageToken,
    latestHistoryId: data.historyId,
  };
}

export async function collectHistoryMessageIds(
  accessToken: string,
  startHistoryId: string,
  applyLabelId: string,
): Promise<{ messageIds: string[]; latestHistoryId: string }> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  let latestHistoryId = startHistoryId;

  do {
    const page = await listHistoryMessageIds(accessToken, startHistoryId, applyLabelId, pageToken);
    for (const id of page.messageIds) ids.add(id);
    pageToken = page.nextPageToken;
    if (page.latestHistoryId) latestHistoryId = page.latestHistoryId;
  } while (pageToken);

  return { messageIds: [...ids], latestHistoryId };
}

export function isGmailHistoryNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('404') && (msg.includes('History') || msg.includes('not found'));
}

export async function getMessageMetadata(
  accessToken: string,
  messageId: string,
): Promise<GmailMessageMeta> {
  const params = new URLSearchParams({
    format: 'metadata',
    metadataHeaders: 'From',
  });
  params.append('metadataHeaders', 'Subject');

  const data = await gmailFetch<{
    id: string;
    threadId: string;
    labelIds?: string[];
    internalDate?: string;
    payload?: { headers?: { name: string; value: string }[] };
  }>(accessToken, `/messages/${messageId}?${params}`);

  const headers = data.payload?.headers ?? [];
  const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value ?? null;
  const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value ?? null;

  return {
    id: data.id,
    threadId: data.threadId,
    labelIds: data.labelIds ?? [],
    internalDate: data.internalDate ?? '0',
    from,
    subject,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

export async function getMessageMetadataBatch(
  accessToken: string,
  messageIds: string[],
  concurrency = 20,
): Promise<GmailMessageMeta[]> {
  return mapWithConcurrency(messageIds, concurrency, (id) => getMessageMetadata(accessToken, id));
}

export async function getValidAccessToken(
  accessTokenEncrypted: string | null,
  refreshTokenEncrypted: string | null,
  tokenExpiry: string | null,
  clientId: string,
  clientSecret: string,
  encrypt: (s: string) => string,
  decrypt: (s: string) => string,
): Promise<{ accessToken: string; accessTokenEncrypted: string; tokenExpiry: string }> {
  const now = Date.now();
  const expiryMs = tokenExpiry ? new Date(tokenExpiry).getTime() : 0;

  if (accessTokenEncrypted && expiryMs > now + 60_000) {
    return {
      accessToken: decrypt(accessTokenEncrypted),
      accessTokenEncrypted,
      tokenExpiry: tokenExpiry!,
    };
  }

  if (!refreshTokenEncrypted) throw new Error('No refresh token available');

  const refreshed = await refreshAccessToken(refreshTokenEncrypted, clientId, clientSecret, decrypt);
  const newExpiry = new Date(now + refreshed.expires_in * 1000).toISOString();
  const newEncrypted = encrypt(refreshed.access_token);
  return {
    accessToken: refreshed.access_token,
    accessTokenEncrypted: newEncrypted,
    tokenExpiry: newExpiry,
  };
}
