# 🍁 MapleNest

**PEI's community housing platform** — connecting renters and landlords through verified listings, direct messaging, and transparent pricing.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| Real-time | Supabase Realtime (chat) |
| Deployment | Vercel |

## Getting Started

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/maplenest.git
cd maplenest
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up Supabase
1. Create a free project at [supabase.com](https://supabase.com)
2. Copy your project URL and anon key
3. Create a `.env` file:

```bash
cp .env.example .env
# Then fill in your Supabase credentials
```

### 4. Run the database schema
Copy and run the SQL from `supabase/schema.sql` in your Supabase SQL editor.

### 5. Start the dev server
```bash
npm run dev
```

## Project Roadmap

- **Phase 0** ✅ — Repo setup, auth, routing
- **Phase 1** 🔄 — Listings (create, browse, search)
- **Phase 2** — Chat system (Supabase Realtime)
- **Phase 3** — Verification & trust badges
- **Phase 4** — Launch to PEI beta users

## Target Market

Starting with **Prince Edward Island** — UPEI students, Holland College students, young professionals, and local landlords.

---

Built for PEI 🇨🇦 | Expanding to all of Canada
