-- Gmail Interview label sync (mirrors Apply label pattern)

ALTER TABLE public.google_connections
  ADD COLUMN IF NOT EXISTS interview_label_id text;

-- Postgres cannot add a column to a view via CREATE OR REPLACE when it shifts positions — drop first.
DROP VIEW IF EXISTS public.google_connections_public;

CREATE VIEW public.google_connections_public AS
SELECT
  id,
  candidate_id,
  google_email,
  token_expiry,
  scopes,
  apply_label_id,
  interview_label_id,
  status,
  connected_at,
  disconnected_at,
  last_synced_at,
  error_message,
  created_at,
  updated_at
FROM public.google_connections;

GRANT SELECT ON public.google_connections_public TO authenticated;
ALTER VIEW public.google_connections_public SET (security_invoker = true);

CREATE TABLE IF NOT EXISTS public.gmail_interview_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  google_connection_id uuid NOT NULL REFERENCES public.google_connections(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL,
  gmail_thread_id text,
  from_email text,
  from_name text,
  subject text,
  internal_date bigint,
  received_date timestamptz NOT NULL,
  label_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, gmail_message_id)
);

CREATE INDEX IF NOT EXISTS idx_gmail_interview_messages_candidate_date
  ON public.gmail_interview_messages(candidate_id, received_date DESC);

ALTER TABLE public.gmail_interview_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read interview messages" ON public.gmail_interview_messages;
CREATE POLICY "Staff read interview messages"
  ON public.gmail_interview_messages FOR SELECT
  USING (public.can_access_candidate_gmail(candidate_id));

GRANT SELECT ON public.gmail_interview_messages TO authenticated;
