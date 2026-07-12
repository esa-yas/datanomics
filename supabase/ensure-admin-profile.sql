-- Run after fix-rls-recursion.sql if data pages are empty but you are logged in.
-- Ensures your auth user has a profile row with admin role so RLS is_employee() passes.

INSERT INTO public.profiles (
  id,
  email,
  display_name,
  role,
  status,
  timezone,
  weekly_target_applications,
  reply_sla_hours
)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)),
  'admin'::user_role,
  'active'::user_status,
  'America/New_York',
  100,
  24
FROM auth.users u
WHERE u.email = 'admin@datanomicstech.com'
ON CONFLICT (id) DO UPDATE SET
  role = 'admin'::user_role,
  status = 'active'::user_status,
  email = EXCLUDED.email;
