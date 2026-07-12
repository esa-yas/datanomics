import type { SupabaseClient } from '@supabase/supabase-js';
import { gmailEnv } from '../env';
import { encryptSecret, decryptSecret } from './crypto';
import { detectApplySource, parseFromHeader } from './source';
import {
  collectHistoryMessageIds,
  findApplyLabelId,
  findInterviewLabelId,
  fetchGmailProfile,
  getMessageMetadataBatch,
  getValidAccessToken,
  isGmailHistoryNotFoundError,
  listAllApplyMessageIds,
} from './client';

export interface SyncResult {
  messagesFound: number;
  messagesImported: number;
  applyLabelId: string | null;
  dailyCounts: {
    total: number;
    linkedin: number;
    dice: number;
    other: number;
    remaining: number;
    dailyGoal: number;
  };
}

function startOfDayUtc(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

async function recomputeDailyCounts(
  supabase: SupabaseClient,
  candidateId: string,
  dailyGoal: number,
): Promise<SyncResult['dailyCounts']> {
  const today = startOfDayUtc();
  const dayStart = `${today}T00:00:00.000Z`;
  const dayEnd = `${today}T23:59:59.999Z`;

  const { data: rows, error } = await supabase
    .from('gmail_apply_messages')
    .select('detected_source')
    .eq('candidate_id', candidateId)
    .gte('received_date', dayStart)
    .lte('received_date', dayEnd);

  if (error) throw error;

  let linkedin = 0;
  let dice = 0;
  let other = 0;
  for (const row of rows ?? []) {
    if (row.detected_source === 'LinkedIn') linkedin++;
    else if (row.detected_source === 'Dice') dice++;
    else other++;
  }
  const total = linkedin + dice + other;
  const remaining = Math.max(0, dailyGoal - total);

  await supabase.from('application_daily_counts').upsert(
    {
      candidate_id: candidateId,
      date: today,
      total_apply_count: total,
      linkedin_count: linkedin,
      dice_count: dice,
      other_count: other,
      daily_goal: dailyGoal,
      remaining_count: remaining,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: 'candidate_id,date' },
  );

  return { total, linkedin, dice, other, remaining, dailyGoal };
}

async function loadKnownMessageIdsForTable(
  supabase: SupabaseClient,
  candidateId: string,
  table: 'gmail_apply_messages' | 'gmail_interview_messages',
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from(table)
    .select('gmail_message_id')
    .eq('candidate_id', candidateId);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.gmail_message_id as string));
}

async function syncLabeledMessages(
  supabase: SupabaseClient,
  accessToken: string,
  candidateId: string,
  connectionId: string,
  labelId: string,
  table: 'gmail_apply_messages' | 'gmail_interview_messages',
  knownIds: Set<string>,
  incremental: boolean,
  includeSource = false,
): Promise<number> {
  const resolved = incremental
    ? await resolveMessageIdsToFetch(accessToken, labelId, {}, knownIds, true)
    : {
        ids: await listAllApplyMessageIds(accessToken, labelId),
        messagesFound: 0,
      };

  const idsToFetch = incremental ? resolved.ids : resolved.ids;
  if (idsToFetch.length === 0) return 0;

  const concurrency = gmailEnv.syncMetadataConcurrency;
  const metas = await getMessageMetadataBatch(accessToken, idsToFetch, concurrency);

  const rows = metas
    .filter((meta) => meta.labelIds.includes(labelId))
    .map((meta) => {
      const { email, name } = parseFromHeader(meta.from);
      const received = new Date(Number(meta.internalDate));
      const base = {
        candidate_id: candidateId,
        google_connection_id: connectionId,
        gmail_message_id: meta.id,
        gmail_thread_id: meta.threadId,
        from_email: email || null,
        from_name: name,
        subject: meta.subject,
        internal_date: Number(meta.internalDate),
        received_date: received.toISOString(),
        label_ids: meta.labelIds,
      };
      if (includeSource) {
        return { ...base, detected_source: detectApplySource(email) };
      }
      return base;
    });

  const upsertBatch = 50;
  let imported = 0;
  for (let i = 0; i < rows.length; i += upsertBatch) {
    const chunk = rows.slice(i, i + upsertBatch);
    const { error: upsertErr } = await supabase.from(table).upsert(chunk, {
      onConflict: 'candidate_id,gmail_message_id',
      ignoreDuplicates: true,
    });
    if (!upsertErr) imported += chunk.length;
  }
  return imported;
}

async function syncInterviewLabel(
  supabase: SupabaseClient,
  accessToken: string,
  candidateId: string,
  conn: { id: string; interview_label_id?: string | null },
  incremental: boolean,
): Promise<void> {
  let interviewLabelId = conn.interview_label_id as string | null;
  if (!interviewLabelId) {
    interviewLabelId = await findInterviewLabelId(accessToken);
    if (!interviewLabelId) return;
    await supabase
      .from('google_connections')
      .update({ interview_label_id: interviewLabelId })
      .eq('id', conn.id);
  }

  const knownIds = incremental
    ? await loadKnownMessageIdsForTable(supabase, candidateId, 'gmail_interview_messages')
    : new Set<string>();

  await syncLabeledMessages(
    supabase,
    accessToken,
    candidateId,
    conn.id,
    interviewLabelId,
    'gmail_interview_messages',
    knownIds,
    incremental,
    false,
  );
}

async function loadKnownMessageIds(
  supabase: SupabaseClient,
  candidateId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('gmail_apply_messages')
    .select('gmail_message_id')
    .eq('candidate_id', candidateId);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.gmail_message_id as string));
}

async function resolveMessageIdsToFetch(
  accessToken: string,
  applyLabelId: string,
  conn: { gmail_history_id?: string | null },
  knownIds: Set<string>,
  incremental: boolean,
): Promise<{ ids: string[]; messagesFound: number; messagesInLabel?: number; historyId?: string }> {
  if (!incremental) {
    const allIds = await listAllApplyMessageIds(accessToken, applyLabelId);
    return { ids: allIds, messagesFound: allIds.length, messagesInLabel: allIds.length };
  }

  const storedHistoryId = conn.gmail_history_id;
  if (storedHistoryId) {
    try {
      const { messageIds, latestHistoryId } = await collectHistoryMessageIds(
        accessToken,
        storedHistoryId,
        applyLabelId,
      );
      return {
        ids: messageIds,
        messagesFound: messageIds.length,
        historyId: latestHistoryId,
      };
    } catch (err) {
      if (!isGmailHistoryNotFoundError(err)) throw err;
    }
  }

  const allIds = await listAllApplyMessageIds(accessToken, applyLabelId);
  const newIds = allIds.filter((id) => !knownIds.has(id));
  return { ids: newIds, messagesFound: newIds.length, messagesInLabel: allIds.length };
}

const inFlightSyncs = new Map<string, Promise<SyncResult>>();

export async function syncCandidateGmail(
  supabase: SupabaseClient,
  candidateId: string,
  options?: { dailyGoal?: number; full?: boolean },
): Promise<SyncResult> {
  const existing = inFlightSyncs.get(candidateId);
  if (existing) return existing;

  const job = runSyncCandidateGmail(supabase, candidateId, options).finally(() => {
    inFlightSyncs.delete(candidateId);
  });
  inFlightSyncs.set(candidateId, job);
  return job;
}

async function runSyncCandidateGmail(
  supabase: SupabaseClient,
  candidateId: string,
  options?: { dailyGoal?: number; full?: boolean },
): Promise<SyncResult> {
  const dailyGoal = options?.dailyGoal ?? gmailEnv.dailyGoalDefault;
  const incremental = options?.full !== true;

  const { data: conn, error: connErr } = await supabase
    .from('google_connections')
    .select('*')
    .eq('candidate_id', candidateId)
    .eq('status', 'connected')
    .maybeSingle();

  if (connErr) throw connErr;
  if (!conn) throw new Error('No connected Google account for this candidate');

  const logInsert = await supabase
    .from('gmail_sync_logs')
    .insert({
      candidate_id: candidateId,
      google_connection_id: conn.id,
      status: 'running',
    })
    .select('id')
    .single();

  const logId = logInsert.data?.id;

  try {
    const token = await getValidAccessToken(
      conn.access_token_encrypted,
      conn.refresh_token_encrypted,
      conn.token_expiry,
      gmailEnv.googleClientId,
      gmailEnv.googleClientSecret,
      encryptSecret,
      decryptSecret,
    );

    if (
      token.accessTokenEncrypted !== conn.access_token_encrypted ||
      token.tokenExpiry !== conn.token_expiry
    ) {
      await supabase
        .from('google_connections')
        .update({
          access_token_encrypted: token.accessTokenEncrypted,
          token_expiry: token.tokenExpiry,
        })
        .eq('id', conn.id);
    }

    let applyLabelId = conn.apply_label_id as string | null;
    if (!applyLabelId) {
      applyLabelId = await findApplyLabelId(token.accessToken);
      if (!applyLabelId) {
        throw new Error('Gmail label "Apply" not found. Create the label in Gmail first.');
      }
      await supabase
        .from('google_connections')
        .update({ apply_label_id: applyLabelId })
        .eq('id', conn.id);
    }

    const profile = await fetchGmailProfile(token.accessToken);
    const knownIds = incremental ? await loadKnownMessageIds(supabase, candidateId) : new Set<string>();
    const resolved = await resolveMessageIdsToFetch(
      token.accessToken,
      applyLabelId,
      conn,
      knownIds,
      incremental,
    );

    const messagesFound = resolved.messagesFound;
    const concurrency = gmailEnv.syncMetadataConcurrency;
    const metas = await getMessageMetadataBatch(token.accessToken, resolved.ids, concurrency);

    const rows = metas
      .filter((meta) => meta.labelIds.includes(applyLabelId))
      .map((meta) => {
        const { email, name } = parseFromHeader(meta.from);
        const source = detectApplySource(email);
        const received = new Date(Number(meta.internalDate));
        return {
          candidate_id: candidateId,
          google_connection_id: conn.id,
          gmail_message_id: meta.id,
          gmail_thread_id: meta.threadId,
          from_email: email || null,
          from_name: name,
          subject: meta.subject,
          internal_date: Number(meta.internalDate),
          received_date: received.toISOString(),
          label_ids: meta.labelIds,
          detected_source: source,
        };
      });

    const upsertBatch = 50;
    let messagesImported = 0;
    for (let i = 0; i < rows.length; i += upsertBatch) {
      const chunk = rows.slice(i, i + upsertBatch);
      const { error: upsertErr } = await supabase.from('gmail_apply_messages').upsert(chunk, {
        onConflict: 'candidate_id,gmail_message_id',
        ignoreDuplicates: true,
      });
      if (!upsertErr) messagesImported += chunk.length;
    }

    const dailyCounts = await recomputeDailyCounts(supabase, candidateId, dailyGoal);

    try {
      await syncInterviewLabel(supabase, token.accessToken, candidateId, conn, incremental);
    } catch {
      // Interview label is optional — do not fail the Apply sync
    }

    const { error: connUpdateErr } = await supabase
      .from('google_connections')
      .update({
        last_synced_at: new Date().toISOString(),
        error_message: null,
      })
      .eq('id', conn.id);
    if (connUpdateErr) throw connUpdateErr;

    const historyId = resolved.historyId ?? profile.historyId;
    await supabase
      .from('google_connections')
      .update({ gmail_history_id: historyId })
      .eq('id', conn.id);

    if (logId) {
      await supabase
        .from('gmail_sync_logs')
        .update({
          status: 'success',
          sync_finished_at: new Date().toISOString(),
          messages_found: messagesFound,
          messages_imported: messagesImported,
          error_message: null,
        })
        .eq('id', logId);
    }

    return {
      messagesFound,
      messagesImported,
      applyLabelId,
      dailyCounts,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    await supabase
      .from('google_connections')
      .update({ error_message: message })
      .eq('id', conn.id);

    if (logId) {
      await supabase
        .from('gmail_sync_logs')
        .update({
          status: 'failed',
          sync_finished_at: new Date().toISOString(),
          error_message: message,
        })
        .eq('id', logId);
    }
    throw err;
  }
}

export async function completeOAuthConnection(
  supabase: SupabaseClient,
  candidateId: string,
  tokens: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  },
  googleEmail: string,
): Promise<void> {
  const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { data: existing } = await supabase
    .from('google_connections')
    .select('id, refresh_token_encrypted')
    .eq('candidate_id', candidateId)
    .maybeSingle();

  const refreshEncrypted =
    tokens.refresh_token
      ? encryptSecret(tokens.refresh_token)
      : existing?.refresh_token_encrypted ?? null;

  if (!refreshEncrypted) throw new Error('Google did not return a refresh token');

  const row = {
    candidate_id: candidateId,
    google_email: googleEmail,
    access_token_encrypted: encryptSecret(tokens.access_token),
    refresh_token_encrypted: refreshEncrypted,
    token_expiry: expiry,
    scopes: [gmailEnv.gmailMetadataScope],
    status: 'connected' as const,
    connected_at: new Date().toISOString(),
    disconnected_at: null,
    error_message: null,
  };

  if (existing?.id) {
    await supabase.from('google_connections').update(row).eq('id', existing.id);
  } else {
    await supabase.from('google_connections').insert(row);
  }
}

/** Best-effort first sync; OAuth success must not depend on Apply label existing yet. */
export async function tryInitialGmailSync(
  supabase: SupabaseClient,
  candidateId: string,
): Promise<void> {
  try {
    await syncCandidateGmail(supabase, candidateId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Initial sync failed';
    await supabase
      .from('google_connections')
      .update({ error_message: message })
      .eq('candidate_id', candidateId);
  }
}
