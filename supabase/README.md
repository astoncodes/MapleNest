# MapleNest — Database Setup & Migrations

All SQL here runs in the Supabase **SQL Editor** (Dashboard → SQL Editor → New query).
There is no migration framework; `schema.sql` is the single idempotent source of
truth, and the `migration_*.sql` files are the historical, reviewable steps that
were folded into it.

## Fresh project (from scratch)

1. Create a Supabase project.
2. Run **`schema.sql`**. It is idempotent and creates everything:
   tables, RLS policies, triggers, RPC functions, indexes, and both storage
   buckets (`listing-images`, `avatars`) with their policies. No manual
   bucket-creation step is needed.
3. (Optional, non-production) Run `seed_pei_listings.sql` for demo listings.
   **Never run the seed against production.**

## Existing deployment — upgrade path

`schema.sql` is safe to re-run on an existing database: every statement is
`IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP POLICY IF EXISTS` + recreate.

Audit of the live project (`xyvcuxcczimlibclqsod`, 2026-07-06) found these
RPCs **missing** — the app's messaging, tenancy, view-count, and navbar-badge
features fail until they exist:

- `increment_views`
- `bump_unread`, `reset_unread`, `start_conversation_with_message`, `user_unread_total`
- `assign_tenant`, `end_tenancy`

**To upgrade: re-run `schema.sql`**, then run the one-off data fix:

- `migration_orphan_conversations_cleanup.sql` — archives conversations that
  have no messages (pre-B5 orphans). Review its backup table before dropping.

### Order-sensitive notes

- `schema.sql` drops the old `UNIQUE(listing_id, renter_id)` constraint on
  `conversations` and replaces it with a unique index over
  `(listing_id, renter_id, unit_id, room_id)`. If duplicate rows exist for the
  same tuple, the index creation fails — find them first with:

  ```sql
  SELECT listing_id, renter_id, unit_id, room_id, count(*)
  FROM public.conversations
  GROUP BY 1, 2, 3, 4
  HAVING count(*) > 1;
  ```

- After running the role-security triggers for the first time, audit
  privileged profiles:

  ```sql
  SELECT id, email, role, created_at FROM public.profiles
  WHERE role IN ('landlord', 'admin') ORDER BY created_at;
  ```

  Demote anything unexpected: `UPDATE public.profiles SET role = 'renter' WHERE id = '<uuid>';`

## Historical migration files

Kept for review/rollback context; their content is already in `schema.sql`
(except the one-off data fix noted above). Chronological order:

| File | Purpose |
|---|---|
| `migration_sublease.sql`, `migration_sublease_rls.sql` | sublease listing type + renter RLS |
| `migration_saved_listings.sql` | saved listings table |
| `migration_increment_views.sql` | atomic view counter |
| `migration_messages_rls.sql`, `migration_reports_rls.sql` | messaging/reports RLS |
| `migration_reviews_rls.sql`, `migration_reviews_rls_tighten.sql` | review RLS, then tenancy-scoped tightening (B23) |
| `migration_storage_policies.sql` | listing-images bucket policies |
| `migration_listing_units.sql` | multi-unit listings |
| `migration_tenancies_reviews.sql` | tenancy + review-window system |
| `migration_role_lock.sql` | admin-only `profiles.role` updates (B1/V1) |
| `migration_handle_new_user_role_validation.sql` | whitelist signup role (no self-serve admin) |
| `migration_messaging_rpcs.sql` | atomic unread counters + conversation start (B3/B5/B10) |
| `migration_conversations_unit_unique.sql` | per-unit conversation threads (B2) |
| `migration_orphan_conversations_cleanup.sql` | **one-off data fix** — run manually |
| `migration_tenancy_rpcs.sql` | atomic assign/end tenancy (B6/B7) |
| `migration_listings_owner_select.sql` | owners can read own non-active listings |
| `migration_avatars_bucket.sql` | dedicated avatars bucket (B12) |
| `migration_conversations_indexes.sql` | participant + recency indexes (B38) |

## Rollback

Each migration file documents its own rollback at the bottom where applicable.
For function-only changes, re-running the previous file's
`CREATE OR REPLACE FUNCTION` restores the old behavior. For a full disaster
recovery, restore from a Supabase backup (Dashboard → Database → Backups —
daily on paid plans; take a manual `pg_dump` before schema changes on the
free tier).

## Backups

- Supabase Pro keeps automated daily backups. On the free tier, export before
  risky changes: Dashboard → Database → Backups, or
  `pg_dump "$SUPABASE_DB_URL" > backup.sql` using the connection string from
  Project Settings → Database.
- Storage buckets are not covered by `pg_dump`; download bucket contents
  separately if needed.
