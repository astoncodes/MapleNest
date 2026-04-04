-- Run in Supabase SQL Editor: Dashboard → SQL Editor → New query
-- Adds missing RLS INSERT policy for the reports table.
-- Without this, all report submissions are silently blocked by RLS default-deny.

DROP POLICY IF EXISTS "Authenticated users can submit reports" ON public.reports;
CREATE POLICY "Authenticated users can submit reports" ON public.reports
  FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);
