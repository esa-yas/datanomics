-- AI Voice Interview Practice sessions

DO $$ BEGIN
  CREATE TYPE public.interview_session_status AS ENUM (
    'pending', 'started', 'completed', 'expired', 'revoked'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.interview_type AS ENUM (
    'recruiter_screen', 'behavioral', 'technical', 'final_round'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.interview_difficulty AS ENUM ('easy', 'medium', 'hard');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.interview_message_role AS ENUM ('ai', 'candidate', 'system');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.hiring_readiness AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.interview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  job_description text NOT NULL DEFAULT '',
  resume_text text NOT NULL DEFAULT '',
  focus_notes text NOT NULL DEFAULT '',
  interview_type public.interview_type NOT NULL DEFAULT 'behavioral',
  difficulty public.interview_difficulty NOT NULL DEFAULT 'medium',
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes IN (15, 30, 45, 60)),
  status public.interview_session_status NOT NULL DEFAULT 'pending',
  secure_token_hash text NOT NULL,
  token_uses_remaining integer NOT NULL DEFAULT 1 CHECK (token_uses_remaining >= 0),
  expires_at timestamptz NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  rolling_summary text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_candidate
  ON public.interview_sessions(candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_token_hash
  ON public.interview_sessions(secure_token_hash);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_status
  ON public.interview_sessions(status, expires_at);

CREATE TABLE IF NOT EXISTS public.interview_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_session_id uuid NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  role public.interview_message_role NOT NULL,
  message_text text NOT NULL,
  message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_messages_session
  ON public.interview_messages(interview_session_id, message_at);

CREATE TABLE IF NOT EXISTS public.interview_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_session_id uuid NOT NULL UNIQUE REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  overall_score integer CHECK (overall_score BETWEEN 1 AND 100),
  communication_score integer CHECK (communication_score BETWEEN 1 AND 100),
  technical_score integer CHECK (technical_score BETWEEN 1 AND 100),
  jd_alignment_score integer CHECK (jd_alignment_score BETWEEN 1 AND 100),
  confidence_score integer CHECK (confidence_score BETWEEN 1 AND 100),
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  weaknesses jsonb NOT NULL DEFAULT '[]'::jsonb,
  missed_keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_improvements jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_practice jsonb NOT NULL DEFAULT '[]'::jsonb,
  final_summary text NOT NULL DEFAULT '',
  hiring_readiness public.hiring_readiness,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.interview_audio_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_session_id uuid NOT NULL REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  audio_url text,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS interview_sessions_updated_at ON public.interview_sessions;
CREATE TRIGGER interview_sessions_updated_at
  BEFORE UPDATE ON public.interview_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_audio_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read interview sessions" ON public.interview_sessions;
CREATE POLICY "Staff read interview sessions"
  ON public.interview_sessions FOR SELECT
  USING (public.is_employee() AND public.can_read_candidate(candidate_id));

DROP POLICY IF EXISTS "Staff create interview sessions" ON public.interview_sessions;
CREATE POLICY "Staff create interview sessions"
  ON public.interview_sessions FOR INSERT
  WITH CHECK (public.is_employee() AND public.can_read_candidate(candidate_id));

DROP POLICY IF EXISTS "Staff update interview sessions" ON public.interview_sessions;
CREATE POLICY "Staff update interview sessions"
  ON public.interview_sessions FOR UPDATE
  USING (public.is_employee() AND public.can_read_candidate(candidate_id));

DROP POLICY IF EXISTS "Staff read interview messages" ON public.interview_messages;
CREATE POLICY "Staff read interview messages"
  ON public.interview_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.interview_sessions s
      WHERE s.id = interview_session_id
        AND public.is_employee()
        AND public.can_read_candidate(s.candidate_id)
    )
  );

DROP POLICY IF EXISTS "Staff read interview results" ON public.interview_results;
CREATE POLICY "Staff read interview results"
  ON public.interview_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.interview_sessions s
      WHERE s.id = interview_session_id
        AND public.is_employee()
        AND public.can_read_candidate(s.candidate_id)
    )
  );

DROP POLICY IF EXISTS "Staff read interview audio logs" ON public.interview_audio_logs;
CREATE POLICY "Staff read interview audio logs"
  ON public.interview_audio_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.interview_sessions s
      WHERE s.id = interview_session_id
        AND public.is_employee()
        AND public.can_read_candidate(s.candidate_id)
    )
  );

-- Candidates (client role) can read their own completed sessions via email match
DROP POLICY IF EXISTS "Client read own interview sessions" ON public.interview_sessions;
CREATE POLICY "Client read own interview sessions"
  ON public.interview_sessions FOR SELECT
  USING (
    public.get_my_role() = 'client'
    AND EXISTS (
      SELECT 1 FROM public.candidates c
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE c.id = candidate_id AND c.email = p.email
    )
  );

DROP POLICY IF EXISTS "Client read own interview results" ON public.interview_results;
CREATE POLICY "Client read own interview results"
  ON public.interview_results FOR SELECT
  USING (
    public.get_my_role() = 'client'
    AND EXISTS (
      SELECT 1 FROM public.interview_sessions s
      JOIN public.candidates c ON c.id = s.candidate_id
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE s.id = interview_session_id AND c.email = p.email
    )
  );
