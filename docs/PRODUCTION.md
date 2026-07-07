# MapleNest — Production Readiness

Last updated: 2026-07-06.

## Hosting components

| Component | Service | Config |
|---|---|---|
| Static SPA | Vercel | `vercel.json` (SPA rewrite), HTTPS automatic |
| Database + Auth + Realtime + Storage | Supabase project `xyvcuxcczimlibclqsod` (Canada Central) | `supabase/schema.sql` |
| CI | GitHub Actions | `.github/workflows/ci.yml` |

No servers to patch or scale; both platforms are managed.

## Secrets & configuration

- The app needs exactly two values, both **public by design**: `VITE_SUPABASE_URL` and the **anon** `VITE_SUPABASE_ANON_KEY`. Security comes from RLS, not key secrecy.
- The **service_role key must never be used client-side.** The app hard-fails at startup if one is detected in `VITE_SUPABASE_ANON_KEY`.
- ⚠️ **Outstanding action (2026-07-06):** the local `.env` historically contained the service_role key in that slot, and at least one local build embedded it in `dist/`. **Rotate the service_role key** (Supabase → Project Settings → API → Reset), then put the anon key in local `.env` and in Vercel env vars, and redeploy.
- No other secrets exist. CI uses placeholder env values for the build step.

## Security model

- **Authentication**: Supabase Auth (email/password, email confirmation, password reset with expired-link fallback).
- **Authorization**: Postgres RLS on every table; `FORCE ROW LEVEL SECURITY` on listings. Cross-user access is blocked at the database, so URL/payload tampering in the SPA cannot leak data.
- **Privilege escalation closed**: signup role is whitelisted to renter/landlord in the `handle_new_user` trigger; `profiles.role` changes are admin-only via the `lock_profile_role` trigger; admins are promoted manually in SQL.
- **Atomic operations**: unread counters, conversation creation, tenant assignment/ending run as `SECURITY DEFINER` RPCs that re-verify the caller — no client-composed multi-step writes.
- **Uploads**: type/size validated client-side (images, ≤5 MB avatars / ≤10 MB listing photos); storage policies restrict writes to `{auth.uid()}/...` paths per bucket; buckets are public-read by design (listing photos and avatars are public content).
- **Input handling**: search input is sanitized before PostgREST `.or()` interpolation; all other input goes through parameterized PostgREST filters.
- **Error copy**: `mapSupabaseError` prevents raw RLS/Postgres details from reaching users.

## Database

- `supabase/schema.sql` initializes a clean environment from scratch **and** upgrades existing ones (idempotent). Runbook: `supabase/README.md`.
- **Upgrade required for the live project**: re-run `schema.sql` — the audit on 2026-07-06 found the messaging RPCs (`bump_unread`, `reset_unread`, `start_conversation_with_message`, `user_unread_total`), tenancy RPCs (`assign_tenant`, `end_tenancy`), and `increment_views` missing. Until it runs, sending the first message in a new conversation, tenant assignment, and the navbar badge fail on production data.
- One-off data fix after upgrade: `migration_orphan_conversations_cleanup.sql`.
- Indexes cover the hot paths (listings by status/city/landlord, conversations by participant/recency, messages by conversation, tenancies, units).

## Release process

1. Branch from `main`; open a PR.
2. CI must pass: lint → tests → production build → audit.
3. If the change includes SQL: run it in the Supabase SQL Editor **before** merging the frontend change that depends on it (schema is idempotent; functions are additive, so old clients keep working).
4. Merge → Vercel auto-deploys `main`.
5. Smoke test: `npm run build && npm run preview &` then `npm run smoke`
   (automated: homepage, listings, search, detail, 404, auth, protected
   redirect, mobile). Manually: log in, open `/messages`, send a message.
6. Rollback: Vercel → promote previous deployment. SQL rollback per-file notes in `supabase/README.md`.

## Monitoring & incident basics

- **Client errors**: React error boundary catches render crashes; wire Sentry (or similar) in `ErrorBoundary.componentDidCatch` when ready.
- **Backend**: Supabase Dashboard → Logs (PostgREST, Auth, Realtime); Reports page for API error rates.
- **Dependency alerts**: enable GitHub Dependabot on the repo.
- Common failures:
  - Blank data / 401s → wrong or rotated anon key in Vercel env.
  - "Could not start conversation" → messaging RPCs missing (run schema.sql).
  - Messages not live-updating → Realtime outage; polling fallback covers it (5 s).
  - Signup emails missing → Supabase email rate limits; configure SMTP.

## Scaling considerations

- Vercel static hosting scales automatically; Supabase free tier limits (500 MB DB, 1 GB storage, 2 GB egress, Realtime connection caps) are the first ceiling — upgrade the Supabase plan before a marketing push.
- Add listings pagination and a server-side analytics aggregate as inventory grows past a few hundred rows.
- Images are stored as-uploaded; add a resize/transform step (Supabase Image Transformations) if egress costs grow.

## Backups

- Supabase Pro: automated daily backups. Free tier: manual `pg_dump` before schema changes (connection string in Project Settings → Database).
- Storage buckets need separate export; they are not in `pg_dump`.

## Production-readiness checklist

- [x] Clean checkout installs (`npm ci`) and builds
- [x] Lint, 89 unit/component tests, production build all pass
- [x] DB initializable from a single idempotent script
- [x] AuthN/AuthZ enforced server-side (RLS + definer RPCs)
- [x] Env validation with fail-visible startup
- [x] Error boundary + friendly error copy
- [x] CI on PRs and main
- [ ] **Rotate leaked service_role key** (manual, dashboard)
- [ ] **Re-run schema.sql on the live project** (manual, SQL editor)
- [ ] Set anon key in Vercel env vars and redeploy
- [ ] Configure custom SMTP before real traffic
- [ ] Wire an error-reporting service (post-launch acceptable)
