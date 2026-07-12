-- =============================================================================
-- Gmail Apply Label Sync — schema, RLS, safe views
-- =============================================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.gmail_auth_link_status AS ENUM ('active', 'used', 'expired', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.google_connection_status AS ENUM ('pending', 'connected', 'failed', 'disconnected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.gmail_apply_source AS ENUM ('LinkedIn', 'Dice', 'Other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.gmail_sync_status AS ENUM ('running', 'success', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- candidate_google_auth_links
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.candidate_google_auth_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  status public.gmail_auth_link_status NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_candidate_google_auth_links_candidate
  ON public.candidate_google_auth_links(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_google_auth_links_token_hash
  ON public.candidate_google_auth_links(token_hash) WHERE status = 'active';

-- -----------------------------------------------------------------------------
-- google_connections (tokens — service role / edge functions only for full row)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.google_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE REFERENCES public.candidates(id) ON DELETE CASCADE,
  google_email text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expiry timestamptz,
  scopes text[] NOT NULL DEFAULT ARRAY['https://www.googleapis.com/auth/gmail.metadata']::text[],
  apply_label_id text,
  status public.google_connection_status NOT NULL DEFAULT 'pending',
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_synced_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_connections_status
  ON public.google_connections(status) WHERE status = 'connected';

-- Safe view — no encrypted tokens
CREATE OR REPLACE VIEW public.google_connections_public AS
SELECT
  id,
  candidate_id,
  google_email,
  token_expiry,
  scopes,
  apply_label_id,
  status,
  connected_at,
  disconnected_at,
  last_synced_at,
  error_message,
  created_at,
  updated_at
FROM public.google_connections;

GRANT SELECT ON public.google_connections_public TO authenticated;

-- -----------------------------------------------------------------------------
-- gmail_apply_messages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gmail_apply_messages (
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
  detected_source public.gmail_apply_source NOT NULL DEFAULT 'Other',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, gmail_message_id)
);

CREATE INDEX IF NOT EXISTS idx_gmail_apply_messages_candidate_date
  ON public.gmail_apply_messages(candidate_id, received_date DESC);
CREATE INDEX IF NOT EXISTS idx_gmail_apply_messages_connection
  ON public.gmail_apply_messages(google_connection_id);

-- -----------------------------------------------------------------------------
-- application_daily_counts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.application_daily_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  date date NOT NULL,
  total_apply_count integer NOT NULL DEFAULT 0,
  linkedin_count integer NOT NULL DEFAULT 0,
  dice_count integer NOT NULL DEFAULT 0,
  other_count integer NOT NULL DEFAULT 0,
  daily_goal integer NOT NULL DEFAULT 30,
  remaining_count integer NOT NULL DEFAULT 30,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, date)
);

CREATE INDEX IF NOT EXISTS idx_application_daily_counts_candidate_date
  ON public.application_daily_counts(candidate_id, date DESC);

-- -----------------------------------------------------------------------------
-- gmail_sync_logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gmail_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  google_connection_id uuid REFERENCES public.google_connections(id) ON DELETE SET NULL,
  sync_started_at timestamptz NOT NULL DEFAULT now(),
  sync_finished_at timestamptz,
  status public.gmail_sync_status NOT NULL DEFAULT 'running',
  messages_found integer NOT NULL DEFAULT 0,
  messages_imported integer NOT NULL DEFAULT 0,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_gmail_sync_logs_candidate
  ON public.gmail_sync_logs(candidate_id, sync_started_at DESC);

-- -----------------------------------------------------------------------------
-- Access helper: assigned staff or managers/admins
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_candidate_gmail(p_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin()
    OR public.is_manager()
    OR EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.id = p_candidate_id
        AND (
          c.primary_assignee_id = auth.uid()
          OR c.application_specialist_id = auth.uid()
          OR c.resume_specialist_id = auth.uid()
          OR c.email_specialist_id = auth.uid()
          OR c.manager_id = auth.uid()
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_candidate_gmail(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.candidate_google_auth_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_apply_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_daily_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_sync_logs ENABLE ROW LEVEL SECURITY;

-- candidate_google_auth_links: staff read metadata only (no token_hash in client queries — enforced by not selecting it)
DROP POLICY IF EXISTS "Staff read auth links" ON public.candidate_google_auth_links;
CREATE POLICY "Staff read auth links"
  ON public.candidate_google_auth_links FOR SELECT
  USING (public.can_access_candidate_gmail(candidate_id));

DROP POLICY IF EXISTS "Staff insert auth links" ON public.candidate_google_auth_links;
CREATE POLICY "Staff insert auth links"
  ON public.candidate_google_auth_links FOR INSERT
  WITH CHECK (public.is_employee() AND public.can_access_candidate_gmail(candidate_id));

DROP POLICY IF EXISTS "Staff update auth links" ON public.candidate_google_auth_links;
CREATE POLICY "Staff update auth links"
  ON public.candidate_google_auth_links FOR UPDATE
  USING (public.can_access_candidate_gmail(candidate_id));

-- google_connections: staff may read rows for assigned candidates (frontend uses safe view / column lists)
DROP POLICY IF EXISTS "Staff read connections via view only" ON public.google_connections;
DROP POLICY IF EXISTS "Staff read public connections" ON public.google_connections;
CREATE POLICY "Staff read connections"
  ON public.google_connections FOR SELECT
  USING (public.can_access_candidate_gmail(candidate_id));

DROP POLICY IF EXISTS "Staff insert connections" ON public.google_connections;
CREATE POLICY "Staff insert connections"
  ON public.google_connections FOR INSERT
  WITH CHECK (public.is_employee() AND public.can_access_candidate_gmail(candidate_id));

DROP POLICY IF EXISTS "Staff update connections" ON public.google_connections;
CREATE POLICY "Staff update connections"
  ON public.google_connections FOR UPDATE
  USING (public.can_access_candidate_gmail(candidate_id))
  WITH CHECK (public.can_access_candidate_gmail(candidate_id));

-- gmail_apply_messages
DROP POLICY IF EXISTS "Staff read apply messages" ON public.gmail_apply_messages;
CREATE POLICY "Staff read apply messages"
  ON public.gmail_apply_messages FOR SELECT
  USING (public.can_access_candidate_gmail(candidate_id));

-- application_daily_counts
DROP POLICY IF EXISTS "Staff read daily counts" ON public.application_daily_counts;
CREATE POLICY "Staff read daily counts"
  ON public.application_daily_counts FOR SELECT
  USING (public.can_access_candidate_gmail(candidate_id));

-- gmail_sync_logs
DROP POLICY IF EXISTS "Staff read sync logs" ON public.gmail_sync_logs;
CREATE POLICY "Staff read sync logs"
  ON public.gmail_sync_logs FOR SELECT
  USING (public.can_access_candidate_gmail(candidate_id));

-- View RLS (security invoker — uses policies on google_connections)
ALTER VIEW public.google_connections_public SET (security_invoker = true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS google_connections_updated_at ON public.google_connections;
CREATE TRIGGER google_connections_updated_at
  BEFORE UPDATE ON public.google_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS application_daily_counts_updated_at ON public.application_daily_counts;
CREATE TRIGGER application_daily_counts_updated_at
  BEFORE UPDATE ON public.application_daily_counts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
