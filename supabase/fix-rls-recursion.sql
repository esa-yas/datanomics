-- =============================================================================
-- Fix: "infinite recursion detected in policy for relation profiles"
-- Run once in Supabase → SQL Editor (Dashboard for project pigtcpmfhisewxpejuae)
-- =============================================================================
-- Cause: profiles SELECT policy calls is_manager(), which reads profiles again.
-- Fix: SECURITY DEFINER helpers bypass RLS; split profiles read policies.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_employee()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_my_role() IN (
    'admin', 'manager', 'team_lead',
    'job_search_assistant', 'resume_specialist', 'email_specialist'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_my_role() IN ('admin', 'manager');
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.get_my_role() = 'admin';
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_employee() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;

CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Managers read all profiles" ON public.profiles;
CREATE POLICY "Managers read all profiles"
  ON public.profiles
  FOR SELECT
  USING (public.is_manager());

-- First login: allow each user to create their own profile row (required for get_my_role / is_employee)
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());

-- Candidates: all employees can read/create/update (not only managers)
DROP POLICY IF EXISTS "Manager creates candidates" ON public.candidates;
DROP POLICY IF EXISTS "Employees create candidates" ON public.candidates;
CREATE POLICY "Employees create candidates"
  ON public.candidates
  FOR INSERT
  WITH CHECK (public.is_employee());

-- Resumes: allow insert for employees (created_by must be set in app)
DROP POLICY IF EXISTS "Employees manage resumes" ON public.resumes;
CREATE POLICY "Employees read resumes"
  ON public.resumes FOR SELECT USING (public.is_employee());
CREATE POLICY "Employees insert resumes"
  ON public.resumes FOR INSERT WITH CHECK (public.is_employee());
CREATE POLICY "Employees update resumes"
  ON public.resumes FOR UPDATE USING (public.is_employee());
CREATE POLICY "Employees delete resumes"
  ON public.resumes FOR DELETE USING (public.is_manager());

-- Then run supabase/ensure-admin-profile.sql to set role = admin for your login
