-- Run in Supabase SQL Editor: Dashboard -> SQL Editor -> New query
-- B1 / V1: Prevent self-promotion to landlord/admin via direct profile UPDATE.
--
-- The "Users can update own profile" RLS policy permits any column update,
-- including role. Combined with the (now-removed) client-side metadata path,
-- a renter could promote themselves to landlord. This trigger enforces that
-- only an admin (or a SECURITY DEFINER function / service_role) can change
-- the role column. All other updates fall back to OLD.role silently.
--
-- V7 (renter-only-sublease) is already enforced by the existing
-- "Renters can post subleases" / "Landlords can create listings" policies
-- in migration_sublease_rls.sql + schema.sql; verified, no-op here.

CREATE OR REPLACE FUNCTION public.lock_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = auth.uid();

    IF v_caller_role IS DISTINCT FROM 'admin' THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_role_lock ON public.profiles;
CREATE TRIGGER profiles_role_lock
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_profile_role();

-- Audit query (run manually after deploy):
--   SELECT id, email, role, created_at
--   FROM public.profiles
--   WHERE role IN ('landlord', 'admin')
--   ORDER BY created_at DESC;
-- Verify each landlord/admin was promoted intentionally.
