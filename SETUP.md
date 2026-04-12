# MapleNest Setup Guide

## 1. Push to GitHub

```bash
git init
git add .
git commit -m "feat: initial MapleNest project scaffold"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/maplenest.git
git push -u origin main
```

## 2. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Name it `maplenest`, choose **Canada (Central)** region
3. Copy your **Project URL** and **anon public key**
4. Go to **Storage** → create a bucket called `listing-images` (public)
5. Go to **SQL Editor** → paste and run `supabase/schema.sql`

If you already ran the schema before creating storage policies, run the SQL files in `supabase/migration_*.sql` from the SQL Editor.

## 3. Configure Environment

```bash
cp .env.example .env
```

Fill in `.env`:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## 4. Install & Run

```bash
npm install
npm run dev
```

Open http://localhost:5173

## 5. Deploy to Vercel

1. Push repo to GitHub
2. Import at [vercel.com](https://vercel.com)
3. Add environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
4. Deploy!
