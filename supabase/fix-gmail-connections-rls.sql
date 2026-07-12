-- Gmail sync RLS fix: allow staff to create/update pending google_connections rows
DROP POLICY IF EXISTS "Staff insert connections" ON public.google_connections;
CREATE POLICY "Staff insert connections"
  ON public.google_connections FOR INSERT
  WITH CHECK (public.is_employee() AND public.can_access_candidate_gmail(candidate_id));

DROP POLICY IF EXISTS "Staff update connections" ON public.google_connections;
CREATE POLICY "Staff update connections"
  ON public.google_connections FOR UPDATE
  USING (public.can_access_candidate_gmail(candidate_id))
  WITH CHECK (public.can_access_candidate_gmail(candidate_id));
