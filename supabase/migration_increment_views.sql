-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query
-- Adds an atomic increment_views RPC to avoid race conditions when multiple
-- users view the same listing simultaneously.

CREATE OR REPLACE FUNCTION public.increment_views(p_listing_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.listings SET views = views + 1 WHERE id = p_listing_id;
$$;

GRANT EXECUTE ON FUNCTION public.increment_views(uuid) TO authenticated, anon;
