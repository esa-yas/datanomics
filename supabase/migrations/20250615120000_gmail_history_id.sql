-- Store Gmail historyId for incremental sync (metadata scope cannot use message list `q` filter).
ALTER TABLE public.google_connections
  ADD COLUMN IF NOT EXISTS gmail_history_id text;
