# Urban Entertaining — Operations

Internal quoting and ordering app. Two tools over one data model:

1. **Quote builder** — enter an event, match it against the packages UE sells, produce a
   customisable client quote with live cost and margin.
2. **Ordering** — roll confirmed quotes over a date window into an ingredient order list,
   rounded to supplier pack sizes and grouped by supplier.

Both are outputs of the same chain: **package → menu items → recipes → ingredients**.
There is exactly one copy of that data.

## Stack

Next.js 15 (App Router, TypeScript strict) · Postgres on Supabase · Drizzle ORM (node-postgres) ·
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
| `DATABASE_POOL_MAX` | Optional. Connection pool size, default 10 |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` in dev; the Vercel URL in production |
| `RESEND_API_KEY` | Phase 3 — sending client quotes |

Then create the schema, load the catalogue, and run it:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

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
| `npm test` | Vitest — engine, CSV import, quote lifecycle, migration and seed |
| `npm run db:generate` | Generate a migration from `lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Load `seed/*.json` — safe to re-run |

## Layout

```
app/
  globals.css        design tokens — the palette, not suggestions
  login/             magic-link sign in
  auth/              callback + sign out
  app/               everything behind auth
components/
  ui/                CSS-Modules primitives: card, table, form, tags
  forms/             client components that call server actions
lib/
  auth.ts            requireUser() — the gate every server action starts with
  actions/           server actions; each one re-checks auth
  data/              the only place that turns database rows into engine types
  db/schema.ts       Drizzle schema
  engine/            pure calculation functions, no DB access
  import/            CSV parsing and validation, pure
  seed/              seed data and the assumptions behind it
reference/mockup.jsx the approved interactive mockup — the design authority
seed/*.json          placeholder catalogue data, exactly as delivered
```

## Conventions

- **Money is integer cents.** Quantities are `numeric(10,3)`. Format for display only.
- **The engine is pure.** `lib/engine/` has no DB access and is unit tested. The UI never
  does arithmetic the engine could do.
- **No server action without an auth check.** `/q/[token]` (Phase 3) is the only public route.
- **The mockup is the design.** Deviations are limited to what the web needs — focus rings,
  responsive stacking, loading states — and are commented where they occur.
- **Assumptions live in one file.** Anything not present in the client's `seed/*.json` is in
  `lib/seed/assumptions.ts`, with the reasoning, so it can be reviewed and replaced.

## Import format

`/app/recipes/import` takes two kinds of CSV. Download a template from that screen rather
than typing the headers by hand. Nothing is written until you have seen the dry run, and a
file with any error writes nothing at all.

**Ingredients** — `name,unit,pack_size,cost_per_unit,supplier`

- `unit` must be one of `kg`, `L`, `each`, `dozen`
- `cost_per_unit` is per unit, not per pack; dollar signs and thousands separators are fine
- A supplier that does not exist yet is created by name, with no contact email
- A name that already exists is **overwritten**, and its cost timestamp is restamped

**Recipes** — `recipe,yield_portions,ingredient,qty`

- One row per ingredient; repeat the recipe name and yield on each of its rows
- Every row for one recipe must agree on `yield_portions`
- `ingredient` must match an existing ingredient name — import ingredients first
- A recipe that already exists has its ingredient list **replaced**, not merged

## Testing

```bash
npm test
```

Four suites:

- **Engine** — every calculation, checked against golden values produced by running the
  approved mockup's own functions over its own data. If a number here changes, the app has
  stopped agreeing with the design.
- **CSV import** — parsing and row-level validation.
- **Quote lifecycle** — sequential refs under a row lock, derived lines, draft-only editing,
  the allowed status transitions, and a sent snapshot that does not move when prices do.
- **Migration and seed** — runs the real migration and the real seed against an in-process
  Postgres (PGlite, a devDependency; nothing in the app imports it). This proves the
  generated SQL is valid, that the seed is idempotent, and that a price change propagates
  everywhere while a sent quote's snapshot stays frozen.

## Build status

- [x] **Phase 0** — scaffold, auth, shell, proposed schema
- [x] **Phase 1** — migration, seed, calculation engine, catalogue admin, CSV import
- [x] **Phase 2** — quote builder, quote list, status lifecycle, snapshot on send
- [ ] **Phase 3** — client-facing quote + PDF
- [ ] **Phase 4** — ordering
- [ ] **Phase 5** — handover polish

The initial migration is in `drizzle/0000_init.sql`. It has been run against an in-process
Postgres in the test suite, but not yet against a real Supabase project.
