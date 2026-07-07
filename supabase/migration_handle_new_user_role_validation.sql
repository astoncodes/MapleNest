-- Run in Supabase SQL Editor: Dashboard -> SQL Editor -> New query
-- B?? / Issue #28: Prevent admin role escalation at signup via auth metadata.
--
-- The existing public.handle_new_user() AFTER INSERT trigger on auth.users
-- copied raw_user_meta_data ->> 'role' straight into public.profiles.role
-- with only a COALESCE-to-'renter' fallback for NULL. A malicious client
-- could call:
--   supabase.auth.signUp({ email, password,
--     options: { data: { role: 'admin' } } })
-- and land an admin profile on first login. This is full privilege
-- escalation at signup.
--
-- The lock_profile_role() trigger in migration_role_lock.sql only fires on
-- UPDATE, so it does NOT protect the initial INSERT path -- this trigger is
-- the authoritative defense for signup.
--
-- We WHITELIST ('renter','landlord') instead of blacklisting 'admin'
-- because:
--   * Whitelists fail closed: any future role we add (e.g. 'moderator',
--     'support') is implicitly rejected until this function is updated.
--   * A blacklist must enumerate every dangerous value, including casing
--     tricks ('Admin', ' admin '), unicode lookalikes, and unknowns.
--   * Defense in depth pairs naturally with the CHECK constraint on
--     profiles.role.
--
-- Admins MUST still be promoted manually via service_role / SQL after this
-- migration. There is no self-serve admin signup path, by design.
--
-- We also pin SET search_path = public on the function (the original lacked
-- it), closing a minor SECURITY DEFINER hardening gap.
--
-- Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_role text;
  v_safe_role      text;
BEGIN
  v_requested_role := lower(trim(COALESCE(new.raw_user_meta_data ->> 'role', '')));

  IF v_requested_role IN ('renter', 'landlord') THEN
    v_safe_role := v_requested_role;
  ELSE
    v_safe_role := 'renter';
  END IF;

  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (
    new.id,
    new.email,
    v_safe_role,
    new.raw_user_meta_data ->> 'full_name'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Audit query (run manually after deploy) -- find any pre-existing
-- privileged profiles that may have been created via the vulnerable
-- pre-migration trigger:
--   SELECT id, email, role, created_at
--   FROM public.profiles
--   WHERE role IN ('landlord', 'admin')
--   ORDER BY created_at ASC;
-- Cross-reference each landlord/admin against an intentional promotion
-- record. Any 'admin' row with no audit trail should be investigated and
-- demoted via service_role:
--   UPDATE public.profiles SET role = 'renter' WHERE id = '<uuid>';
