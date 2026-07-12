function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

export const gmailEnv = {
  get googleClientId() {
    return required('GOOGLE_CLIENT_ID');
  },
  get googleClientSecret() {
    return required('GOOGLE_CLIENT_SECRET');
  },
  get tokenEncryptionKey() {
    return required('GMAIL_TOKEN_ENCRYPTION_KEY');
  },
  get oauthRedirectUri() {
    return required('GMAIL_OAUTH_REDIRECT_URI');
  },
  get connectLinkBaseUrl() {
    return optional('GMAIL_CONNECT_LINK_BASE_URL', optional('VITE_APP_URL', 'http://localhost:5173'));
  },
  get supabaseUrl() {
    const url = optional('SUPABASE_URL', optional('VITE_SUPABASE_URL'));
    if (!url) throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL');
    return url;
  },
  get supabaseServiceRoleKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
  get supabaseAnonKey() {
    return optional('SUPABASE_ANON_KEY', optional('VITE_SUPABASE_ANON_KEY'));
  },
  gmailMetadataScope: 'https://www.googleapis.com/auth/gmail.metadata',
  dailyGoalDefault: 30,
  authLinkTtlHours: 48,
  get autoSyncIntervalMinutes() {
    const n = Number(optional('GMAIL_AUTO_SYNC_INTERVAL_MINUTES', '15'));
    return Number.isFinite(n) && n > 0 ? n : 15;
  },
  get syncMetadataConcurrency() {
    const n = Number(optional('GMAIL_SYNC_CONCURRENCY', '20'));
    return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 20;
  },
};
