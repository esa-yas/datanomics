import { Router, type IRouter, type Request, type Response } from 'express';
import { getSupabaseAdmin } from '../lib/supabaseAdmin';
import { gmailEnv } from '../lib/env';
import { generateConnectToken, hashConnectToken } from '../lib/gmail/crypto';
import {
  exchangeCodeForTokens,
  fetchGoogleUserEmail,
} from '../lib/gmail/client';
import { completeOAuthConnection, syncCandidateGmail, tryInitialGmailSync } from '../lib/gmail/sync';
import { requireStaffAuth, type AuthedRequest } from '../middleware/auth';

const router: IRouter = Router();

function connectUrl(token: string): string {
  const base = gmailEnv.connectLinkBaseUrl.replace(/\/$/, '');
  return `${base}/connect/google/${token}`;
}

function googleAuthUrl(stateToken: string): string {
  const params = new URLSearchParams({
    client_id: gmailEnv.googleClientId,
    redirect_uri: gmailEnv.oauthRedirectUri,
    response_type: 'code',
    scope: gmailEnv.gmailMetadataScope,
    access_type: 'offline',
    prompt: 'consent',
    state: stateToken,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function resolveConnectLink(token: string) {
  const supabase = getSupabaseAdmin();
  const hash = hashConnectToken(token);
  const { data: link, error } = await supabase
    .from('candidate_google_auth_links')
    .select('id, candidate_id, status, expires_at')
    .eq('token_hash', hash)
    .maybeSingle();

  if (error) throw error;
  if (!link) return null;
  if (link.status !== 'active') return { invalid: true as const, reason: link.status, link };
  if (new Date(link.expires_at) < new Date()) {
    await supabase
      .from('candidate_google_auth_links')
      .update({ status: 'expired' })
      .eq('id', link.id);
    return { invalid: true as const, reason: 'expired', link };
  }
  return { link };
}

async function connectedEmailForConnectToken(token: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const hash = hashConnectToken(token);
  const { data: link } = await supabase
    .from('candidate_google_auth_links')
    .select('candidate_id')
    .eq('token_hash', hash)
    .maybeSingle();
  if (!link) return null;

  const { data: conn } = await supabase
    .from('google_connections')
    .select('google_email, status')
    .eq('candidate_id', link.candidate_id)
    .maybeSingle();

  if (conn?.status === 'connected' && conn.google_email) return conn.google_email;
  return null;
}

function oauthResultRedirect(
  res: Response,
  params: { status: 'success' | 'error'; email?: string; message?: string },
): void {
  const base = gmailEnv.connectLinkBaseUrl.replace(/\/$/, '');
  const search = new URLSearchParams({ status: params.status });
  if (params.email) search.set('email', params.email);
  if (params.message) search.set('message', params.message);
  const location = `${base}/connect/google/result?${search}`;
  res.redirect(location);
}

/** POST /api/gmail/connect-link — staff generates one-time connect link */
router.post('/gmail/connect-link', requireStaffAuth, async (req: AuthedRequest, res: Response) => {
  try {
    if (req.userRole === 'job_search_assistant') {
      res.status(403).json({ error: 'Job search assistants cannot connect Gmail' });
      return;
    }

    const { candidateId } = req.body as { candidateId?: string };
    if (!candidateId) {
      res.status(400).json({ error: 'candidateId required' });
      return;
    }

    const supabase = req.userSupabase;
    if (!supabase) {
      res.status(500).json({ error: 'Auth context missing' });
      return;
    }

    const token = generateConnectToken();
    const hash = hashConnectToken(token);
    const expiresAt = new Date(Date.now() + gmailEnv.authLinkTtlHours * 3600_000).toISOString();

    const { error } = await supabase.from('candidate_google_auth_links').insert({
      candidate_id: candidateId,
      token_hash: hash,
      status: 'active',
      expires_at: expiresAt,
      created_by: req.userId,
    });
    if (error) throw error;

    await supabase.from('google_connections').upsert(
      {
        candidate_id: candidateId,
        status: 'pending',
        error_message: null,
      },
      { onConflict: 'candidate_id' },
    );

    res.json({
      url: connectUrl(token),
      expiresAt,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create link' });
  }
});

/** GET /api/gmail/connect/:token — public validate link + candidate name */
router.get('/gmail/connect/:token', async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token ?? '');
    const resolved = await resolveConnectLink(token);
    if (!resolved) {
      res.status(404).json({ error: 'Invalid or unknown link' });
      return;
    }
    if ('invalid' in resolved) {
      res.status(410).json({ error: `Link ${resolved.reason}` });
      return;
    }

    const supabase = getSupabaseAdmin();
    const { data: candidate } = await supabase
      .from('candidates')
      .select('full_name')
      .eq('id', resolved.link.candidate_id)
      .maybeSingle();

    res.json({
      candidateId: resolved.link.candidate_id,
      candidateName: candidate?.full_name ?? 'Candidate',
      oauthStartUrl: `/api/gmail/oauth/start?token=${encodeURIComponent(token)}`,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to validate link' });
  }
});

/** GET /api/gmail/oauth/start?token= — redirect to Google */
router.get('/gmail/oauth/start', async (req: Request, res: Response) => {
  try {
    const token = String(req.query.token ?? '');
    if (!token) {
      res.status(400).send('Missing token');
      return;
    }
    const resolved = await resolveConnectLink(token);
    if (!resolved || 'invalid' in resolved) {
      res.status(410).send('Connect link is invalid or expired');
      return;
    }
    res.redirect(googleAuthUrl(token));
  } catch {
    res.status(500).send('OAuth start failed');
  }
});

/** GET /api/gmail/oauth/callback — Google redirect */
router.get('/gmail/oauth/callback', async (req: Request, res: Response) => {
  try {
    const code = String(req.query.code ?? '');
    const stateToken = String(req.query.state ?? '');
    const oauthError = req.query.error;

    if (oauthError) {
      oauthResultRedirect(res, {
        status: 'error',
        message: String(oauthError),
      });
      return;
    }
    if (!code || !stateToken) {
      oauthResultRedirect(res, { status: 'error', message: 'missing_code' });
      return;
    }

    const existingEmail = await connectedEmailForConnectToken(stateToken);
    if (existingEmail) {
      oauthResultRedirect(res, { status: 'success', email: existingEmail });
      return;
    }

    const resolved = await resolveConnectLink(stateToken);
    if (!resolved) {
      oauthResultRedirect(res, { status: 'error', message: 'invalid_link' });
      return;
    }
    if ('invalid' in resolved) {
      oauthResultRedirect(res, { status: 'error', message: `invalid_link_${resolved.reason}` });
      return;
    }

    const tokens = await exchangeCodeForTokens(
      code,
      gmailEnv.googleClientId,
      gmailEnv.googleClientSecret,
      gmailEnv.oauthRedirectUri,
    );

    const googleEmail = await fetchGoogleUserEmail(tokens.access_token);
    const supabase = getSupabaseAdmin();
    const candidateId = resolved.link.candidate_id;

    await completeOAuthConnection(supabase, candidateId, tokens, googleEmail);
    await tryInitialGmailSync(supabase, candidateId);

    const hash = hashConnectToken(stateToken);
    await supabase
      .from('candidate_google_auth_links')
      .update({ status: 'used', used_at: new Date().toISOString() })
      .eq('token_hash', hash);

    oauthResultRedirect(res, { status: 'success', email: googleEmail });
  } catch (err) {
    const stateToken = String(req.query.state ?? '');
    const recoveredEmail = stateToken ? await connectedEmailForConnectToken(stateToken) : null;
    if (recoveredEmail) {
      oauthResultRedirect(res, { status: 'success', email: recoveredEmail });
      return;
    }

    const msg = err instanceof Error ? err.message : 'oauth_failed';
    oauthResultRedirect(res, { status: 'error', message: msg });
  }
});

/** POST /api/gmail/sync — staff-triggered sync (incremental by default) */
router.post('/gmail/sync', requireStaffAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const { candidateId, full } = req.body as { candidateId?: string; full?: boolean };
    if (!candidateId) {
      res.status(400).json({ error: 'candidateId required' });
      return;
    }
    const result = await syncCandidateGmail(getSupabaseAdmin(), candidateId, { full: full === true });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Sync failed' });
  }
});

/** POST /api/gmail/disconnect */
router.post('/gmail/disconnect', requireStaffAuth, async (req: AuthedRequest, res: Response) => {
  try {
    if (req.userRole === 'job_search_assistant') {
      res.status(403).json({ error: 'Job search assistants cannot manage Gmail connections' });
      return;
    }

    const { candidateId } = req.body as { candidateId?: string };
    if (!candidateId) {
      res.status(400).json({ error: 'candidateId required' });
      return;
    }
    const supabase = getSupabaseAdmin();
    await supabase
      .from('google_connections')
      .update({
        status: 'disconnected',
        disconnected_at: new Date().toISOString(),
        access_token_encrypted: null,
        refresh_token_encrypted: null,
        token_expiry: null,
        apply_label_id: null,
        error_message: null,
      })
      .eq('candidate_id', candidateId);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Disconnect failed' });
  }
});

/** POST /api/gmail/sync-all — cron / scheduled (requires CRON_SECRET) */
router.post('/gmail/sync-all', async (req: Request, res: Response) => {
  const secret = process.env.GMAIL_CRON_SECRET?.trim();
  if (!secret || req.headers['x-cron-secret'] !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: connections, error } = await supabase
      .from('google_connections')
      .select('candidate_id')
      .eq('status', 'connected');

    if (error) throw error;

    const results: { candidateId: string; ok: boolean; error?: string }[] = [];
    for (const conn of connections ?? []) {
      try {
        await syncCandidateGmail(supabase, conn.candidate_id);
        results.push({ candidateId: conn.candidate_id, ok: true });
      } catch (e) {
        results.push({
          candidateId: conn.candidate_id,
          ok: false,
          error: e instanceof Error ? e.message : 'failed',
        });
      }
    }

    res.json({ synced: results.filter((r) => r.ok).length, results });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Batch sync failed' });
  }
});

export default router;
