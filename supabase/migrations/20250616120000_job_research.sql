-- AI Job Research — recommendations from web search per candidate

DO $$ BEGIN
  CREATE TYPE public.job_research_run_status AS ENUM ('running', 'success', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.job_recommendation_status AS ENUM ('new', 'reviewed', 'saved', 'applied', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.job_apply_type AS ENUM ('direct', 'easy', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS job_research_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS last_job_research_at timestamptz;

CREATE TABLE IF NOT EXISTS public.job_research_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  status public.job_research_run_status NOT NULL DEFAULT 'running',
  trigger_source text NOT NULL DEFAULT 'manual',
  queries_used text[] NOT NULL DEFAULT '{}',
  results_found integer NOT NULL DEFAULT 0,
  results_saved integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_job_research_runs_candidate
  ON public.job_research_runs(candidate_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.job_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.job_research_runs(id) ON DELETE SET NULL,
  title text NOT NULL,
  company text NOT NULL DEFAULT '',
  location text,
  work_mode text,
  job_url text,
  apply_type public.job_apply_type NOT NULL DEFAULT 'unknown',
  source_label text,
  match_score integer,
  rationale text,
  snippet text,
  status public.job_recommendation_status NOT NULL DEFAULT 'new',
  dedupe_key text NOT NULL,
  searched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_job_recommendations_candidate_status
  ON public.job_recommendations(candidate_id, status, searched_at DESC);

ALTER TABLE public.job_research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read job research runs" ON public.job_research_runs;
CREATE POLICY "Staff read job research runs"
  ON public.job_research_runs FOR SELECT
  USING (public.can_access_candidate_gmail(candidate_id));

DROP POLICY IF EXISTS "Staff read job recommendations" ON public.job_recommendations;
CREATE POLICY "Staff read job recommendations"
  ON public.job_recommendations FOR SELECT
  USING (public.can_access_candidate_gmail(candidate_id));

DROP POLICY IF EXISTS "Staff update job recommendations" ON public.job_recommendations;
CREATE POLICY "Staff update job recommendations"
  ON public.job_recommendations FOR UPDATE
  USING (public.can_access_candidate_gmail(candidate_id));
