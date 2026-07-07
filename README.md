# 🍁 MapleNest

**MapleNest** is a community-focused housing platform that makes renting easier, more transparent, and more accessible for students, young professionals, and local landlords — starting in **Prince Edward Island**.

Renters browse and search listings, save favourites, message landlords per unit/room, and leave post-tenancy reviews. Landlords post single- or multi-unit listings with photos, manage conversations, assign tenants, and build a reviewed track record. Renters can also post subleases.

## Architecture

MapleNest is a single-page React app backed entirely by Supabase — there is no custom backend server:

```
Browser (React SPA, Vercel-hosted static assets)
   │
   ├── Supabase Auth        — signup/login/reset, JWT sessions
   ├── Supabase PostgREST   — CRUD guarded by Postgres Row Level Security
   ├── Postgres RPCs        — atomic multi-step ops (messaging counters,
   │                          conversation start, tenant assign/end)
   ├── Supabase Realtime    — live message delivery (polling fallback)
   └── Supabase Storage     — listing-images + avatars buckets
```

All authorization is enforced **server-side** by RLS policies and
`SECURITY DEFINER` functions (see [supabase/schema.sql](supabase/schema.sql));
the client never gets more than the anon key.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, Tailwind CSS 3, React Router 6 |
| Backend | Supabase (Postgres, PostgREST, GoTrue, Realtime, Storage) |
| Tests | Vitest + Testing Library (jsdom) |
| CI | GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) |
| Hosting | Vercel (static SPA, [vercel.json](vercel.json) rewrites all routes to index.html) |

## Repository structure

```
src/
  App.jsx                 routes, ProtectedRoute, config-error screen, error boundary
  lib/supabase.js         client init + env validation (rejects service_role keys)
  lib/supabaseErrors.js   raw error -> user-safe copy
  hooks/useAuth.jsx       session bootstrap, profile enrichment, role
  hooks/useSavedListings.jsx
  components/             navbar, listing units, tenancy, reviews UI
  pages/                  one file per route
  utils/listingPermissions.js
supabase/
  schema.sql              complete idempotent installer (tables, RLS, RPCs, buckets)
  migration_*.sql         historical steps (see supabase/README.md)
  seed_pei_listings.sql   demo data — never run in production
docs/                     design/plan documents + PRODUCTION.md
```

## Local development

Requirements: **Node 20+** and npm.

```bash
git clone https://github.com/astoncodes/MapleNest.git
cd MapleNest
npm ci
cp .env.example .env     # then fill in values (see below)
npm run dev              # http://localhost:5173
```

### Environment variables

| Variable | Where to find it | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | same page, **"anon public"** | ⚠️ never the service_role key — the app refuses to boot if one is detected, because `VITE_*` values are baked into the public bundle |

### Database setup

Run [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL Editor. It is idempotent — it both bootstraps a fresh project (including storage buckets) and upgrades an existing one. Full runbook, upgrade notes, and rollback guidance: [supabase/README.md](supabase/README.md).

### Commands

```bash
npm run dev        # dev server with HMR
npm run lint       # ESLint (zero-warning policy)
npm test           # Vitest, single run
npm run test:watch
npm run build      # production build -> dist/
npm run preview    # serve the production build locally
```

## Deployment (Vercel)

1. Import the GitHub repo in Vercel (framework preset: **Vite**).
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (anon key only) in Project → Settings → Environment Variables.
3. Ensure the database is migrated (`supabase/schema.sql`, see runbook).
4. Deploy. `vercel.json` already rewrites all paths to `index.html` for client-side routing; Vercel serves over HTTPS by default.

Rollback: Vercel → Deployments → promote a previous deployment. Database rollback guidance lives in [supabase/README.md](supabase/README.md).

CI runs lint, tests, a production build, and a dependency audit on every push/PR to `main`. Merge only when CI is green.

## Operations

- **Health**: the app is static; "up" means Vercel serves it and Supabase responds. Supabase status: `https://status.supabase.com`. A misconfigured deploy fails visibly with a config-error screen rather than a blank page.
- **Error visibility**: an app-level React error boundary catches render crashes; `ErrorBoundary.componentDidCatch` is the single hook point for wiring an error-reporting service (e.g. Sentry).
- **Realtime degradation**: if the Realtime channel errors, conversations automatically fall back to 5-second polling.
- **Backups**: see [supabase/README.md](supabase/README.md#backups).

More detail: [docs/PRODUCTION.md](docs/PRODUCTION.md).

## Known limitations

- **Email delivery** uses Supabase's built-in sender (rate-limited, generic from-address). Configure custom SMTP in Supabase Auth settings before real user traffic.
- **`npm audit` dev-only advisory**: esbuild/Vite dev-server issue (GHSA-67mh-4wv8-2f99); affects `npm run dev` only, not production output. Fix requires a Vite major upgrade.
- **Admin tooling**: reports are stored but there is no moderation UI; admins work through the Supabase dashboard. Admin promotion is manual SQL by design.
- **Analytics page** aggregates all active listings client-side; fine at PEI scale, needs a server-side aggregate beyond ~thousands of listings.
- **No pagination** on the listings grid yet (34 listings today; add `.range()` paging as inventory grows).

---

**Built for PEI 🇨🇦**
