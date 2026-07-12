-- Imported candidate profiles (JSON intake uploads)
-- Stores the full raw submission plus denormalized columns for listing/search.

CREATE TABLE IF NOT EXISTS public.imported_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text,
  candidate_user_id text,
  full_name text NOT NULL DEFAULT '',
  email text,
  phone text,
  location text,
  job_titles text,
  work_auth text,
  skills text[] NOT NULL DEFAULT '{}',
  job_match integer,
  applied boolean NOT NULL DEFAULT false,
  application_date timestamptz,
  follow_up_date date,
  submitted_at timestamptz,
  form_data jsonb NOT NULL DEFAULT '{}',
  raw jsonb NOT NULL DEFAULT '{}',
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imported_profiles_job_match ON public.imported_profiles(job_match DESC);
CREATE INDEX IF NOT EXISTS idx_imported_profiles_applied ON public.imported_profiles(applied);
CREATE INDEX IF NOT EXISTS idx_imported_profiles_external ON public.imported_profiles(external_id);

ALTER TABLE public.imported_profiles ENABLE ROW LEVEL SECURITY;

-- Any signed-in staff member can read the imported profiles.
DROP POLICY IF EXISTS "Employees read imported profiles" ON public.imported_profiles;
CREATE POLICY "Employees read imported profiles"
  ON public.imported_profiles FOR SELECT
  USING (public.is_employee());

-- Any signed-in staff member can upload / replace / clear the dataset.
DROP POLICY IF EXISTS "Employees manage imported profiles" ON public.imported_profiles;
CREATE POLICY "Employees manage imported profiles"
  ON public.imported_profiles FOR ALL
  USING (public.is_employee())
  WITH CHECK (public.is_employee());
