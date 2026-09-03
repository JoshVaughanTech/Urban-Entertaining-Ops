# Urban Entertaining — Operations

Internal quoting and ordering app. Two tools over one data model:

1. **Quote builder** — enter an event, match it against the packages UE sells, produce a
   customisable client quote with live cost and margin.
2. **Ordering** — roll confirmed quotes over a date window into an ingredient order list,
   rounded to supplier pack sizes and grouped by supplier.

Both are outputs of the same chain: **package → menu items → recipes → ingredients**.
There is exactly one copy of that data.

## Stack

Next.js 15 (App Router, TypeScript strict) · Postgres on Supabase · Drizzle ORM ·
Supabase Auth (email magic link) · CSS Modules with global tokens · Vitest · Vercel.

## Getting started

```bash
npm install
```

Copy the env template and fill it in from the Supabase dashboard:

```bash
cp .env.local.example .env.local
```

| Variable | Where it comes from |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string (URI) |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` in dev; the Vercel URL in production |
| `RESEND_API_KEY` | Phase 3 — sending client quotes |

Then:

```bash
npm run dev
```

Without `.env.local` the app still boots, but every screen redirects to `/login`, which
explains what is missing. No key is ever faked or defaulted.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest — the calculation engine |
| `npm run db:generate` | Generate a migration from `lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Load `seed/*.json` (Phase 1) |

## Layout

```
app/
  globals.css        design tokens — the palette, not suggestions
  login/             magic-link sign in
  auth/              callback + sign out
  app/               everything behind auth
components/          Sidebar, shell, CSS-Modules UI kit
lib/
  auth.ts            requireUser() — the gate every server action starts with
  db/schema.ts       Drizzle schema
  engine/            pure calculation functions, no DB access (Phase 1)
  supabase/          browser / server / middleware clients
reference/mockup.jsx the approved interactive mockup — the design authority
seed/*.json          placeholder catalogue data behind the mockup
```

## Conventions

- **Money is integer cents.** Quantities are `numeric(10,3)`. Format for display only.
- **The engine is pure.** `lib/engine/` has no DB access and is unit tested. The UI never
  does arithmetic the engine could do.
- **No server action without an auth check.** `/q/[token]` (Phase 3) is the only public route.
- **The mockup is the design.** Deviations are limited to what the web needs — focus rings,
  responsive stacking, loading states — and are commented where they occur.

## Build status

- [x] **Phase 0** — scaffold, auth, shell, proposed schema
- [ ] **Phase 1** — migrations, seed, catalogue admin, CSV import
- [ ] **Phase 2** — quote builder
- [ ] **Phase 3** — client-facing quote + PDF
- [ ] **Phase 4** — ordering
- [ ] **Phase 5** — handover polish

No migration has been generated yet — the schema in `lib/db/schema.ts` is awaiting sign-off.
