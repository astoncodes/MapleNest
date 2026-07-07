# MapleNest Setup Guide

Short version — full details in [README.md](README.md).

## 1. Create a Supabase project

1. [supabase.com](https://supabase.com) → New Project (Canada Central).
2. SQL Editor → run `supabase/schema.sql` in full. It creates all tables,
   RLS policies, RPC functions, indexes, and both storage buckets — no manual
   bucket step needed. See [supabase/README.md](supabase/README.md) for the
   upgrade path of an existing database.

## 2. Configure environment

```bash
cp .env.example .env
```

Fill in from Supabase → Project Settings → API:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<the "anon public" key>
```

⚠️ Use the **anon public** key only. The app refuses to start with a
service_role key — that key must never reach a browser bundle.

## 3. Install & run

```bash
npm ci
npm run dev     # http://localhost:5173
```

## 4. Deploy to Vercel

1. Push to GitHub and import at [vercel.com](https://vercel.com).
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars.
3. Deploy. CI (GitHub Actions) runs lint/tests/build on every PR.

Production operations, release, and rollback: [docs/PRODUCTION.md](docs/PRODUCTION.md).
