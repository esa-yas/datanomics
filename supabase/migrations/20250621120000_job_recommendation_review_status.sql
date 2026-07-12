-- Human review statuses for AI-found jobs

DO $$ BEGIN
  CREATE TYPE public.job_recommendation_status_new AS ENUM (
    'ai_fetched',
    'applied',
    'not_applied',
    'outdated',
    'other_recommended'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.job_recommendations
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.job_recommendations
  ALTER COLUMN status TYPE public.job_recommendation_status_new
  USING (
    CASE status::text
      WHEN 'new' THEN 'ai_fetched'
      WHEN 'reviewed' THEN 'not_applied'
      WHEN 'saved' THEN 'applied'
      WHEN 'applied' THEN 'applied'
      WHEN 'dismissed' THEN 'outdated'
      WHEN 'ai_fetched' THEN 'ai_fetched'
      WHEN 'not_applied' THEN 'not_applied'
      WHEN 'outdated' THEN 'outdated'
      WHEN 'other_recommended' THEN 'other_recommended'
      ELSE 'ai_fetched'
    END
  )::public.job_recommendation_status_new;

ALTER TABLE public.job_recommendations
  ALTER COLUMN status SET DEFAULT 'ai_fetched';

DROP TYPE IF EXISTS public.job_recommendation_status;

ALTER TYPE public.job_recommendation_status_new RENAME TO job_recommendation_status;

ALTER TABLE public.job_recommendations
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.job_recommendations.status IS
  'Human review: ai_fetched (default), applied, not_applied, outdated, other_recommended';
