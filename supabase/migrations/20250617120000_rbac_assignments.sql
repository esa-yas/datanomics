-- RBAC: job search assistants see only assigned candidates + staff JSON imports

CREATE OR REPLACE FUNCTION public.is_job_search_assistant()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_my_role() = 'job_search_assistant';
$$;

CREATE OR REPLACE FUNCTION public.candidate_assigned_to_me(p_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.candidates c
    WHERE c.id = p_candidate_id
      AND (
        c.primary_assignee_id = auth.uid()
        OR c.application_specialist_id = auth.uid()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_candidate(p_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin()
    OR public.is_manager()
    OR public.get_my_role() IN ('team_lead', 'resume_specialist', 'email_specialist')
    OR (
      public.is_job_search_assistant()
      AND public.candidate_assigned_to_me(p_candidate_id)
    )
    OR (
      public.get_my_role() = 'client'
      AND EXISTS (
        SELECT 1 FROM public.candidates c
        JOIN public.profiles p ON p.id = auth.uid()
        WHERE c.id = p_candidate_id AND c.email = p.email
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_job_search_assistant() TO authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_assigned_to_me(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_candidate(uuid) TO authenticated;

-- Candidates: scoped read/update for job search assistants
DROP POLICY IF EXISTS "Employees read all candidates" ON public.candidates;
CREATE POLICY "Employees read candidates"
  ON public.candidates FOR SELECT
  USING (public.is_employee() AND public.can_read_candidate(id));

DROP POLICY IF EXISTS "Employees update candidates" ON public.candidates;
CREATE POLICY "Employees update assigned candidates"
  ON public.candidates FOR UPDATE
  USING (
    public.is_employee()
    AND (
      NOT public.is_job_search_assistant()
      OR public.candidate_assigned_to_me(id)
    )
  );

DROP POLICY IF EXISTS "Employees create candidates" ON public.candidates;
CREATE POLICY "Employees create candidates"
  ON public.candidates FOR INSERT
  WITH CHECK (public.is_employee() AND NOT public.is_job_search_assistant());

-- Applications: job search assistants only see assigned candidates' apps
DROP POLICY IF EXISTS "Employees read applications" ON public.applications;
CREATE POLICY "Employees read applications"
  ON public.applications FOR SELECT
  USING (
    public.is_employee()
    AND (
      NOT public.is_job_search_assistant()
      OR public.candidate_assigned_to_me(candidate_id)
    )
  );

-- Staff JSON imports (admin pastes reference data per job search assistant)
CREATE TABLE IF NOT EXISTS public.staff_data_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  import_data jsonb NOT NULL DEFAULT '{}',
  raw_text text,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_data_imports_staff ON public.staff_data_imports(staff_user_id);

ALTER TABLE public.staff_data_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read own import" ON public.staff_data_imports;
CREATE POLICY "Staff read own import"
  ON public.staff_data_imports FOR SELECT
  USING (
    staff_user_id = auth.uid()
    OR public.is_admin()
    OR public.is_manager()
  );

DROP POLICY IF EXISTS "Admin manage imports" ON public.staff_data_imports;
CREATE POLICY "Admin manage imports"
  ON public.staff_data_imports FOR ALL
  USING (public.is_admin() OR public.is_manager())
  WITH CHECK (public.is_admin() OR public.is_manager());
