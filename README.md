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
| `RESEND_API_KEY` | resend.com — sending client quotes |
| `QUOTE_FROM_EMAIL` | A sender on a domain verified in Resend |

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
| `npm run db:studio` | Browse the database |
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
- **No server action without an auth check.** `/q/[token]` is the only public route, and it
  serves a sent quote from its snapshot — never a draft, never a cancelled quote.
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

Ten suites:

- **Engine** — every calculation, checked against golden values produced by running the
  approved mockup's own functions over its own data. If a number here changes, the app has
  stopped agreeing with the design.
- **CSV import** — parsing and row-level validation.
- **Form validation** — the boundary every price staff type crosses on its way into the
  catalogue: dollars to integer cents, thousands separators, rounding, and the bounds.
- **Quote payload** — the builder posts its whole state as JSON, so anyone can post anything.
  Covers what a well-formed payload produces and what a malformed or hostile one is refused
  for, including that it cannot be used to set a status or a reference.
- **Authorisation boundary** — which paths are reachable without signing in. Pins down that
  `/quotes` is not public just because `/q` is.
- **Quote lifecycle** — sequential refs under a row lock, derived lines, draft-only editing,
  the allowed status transitions, and a sent snapshot that does not move when prices do.
  Confirming is reachable from any other status, as the mockup has it; a draft confirmed
  without ever being sent is frozen at that moment.
- **Client document and PDF** — what the client sees, built from the snapshot once sent,
  plus a real PDF render and the public-link rules.
- **Purchase-order CSV** — quoting, escaping, and a round trip back through the importer's
  own parser, so the two CSV modules cannot drift apart.
- **Ordering** — the seed's two confirmed September events rolled up through the database
  and checked line by line against the mockup, plus tick persistence and the
  supplier-without-an-email path.
- **Migration and seed** — runs the real migration and the real seed against an in-process
  Postgres (PGlite, a devDependency; nothing in the app imports it). This proves the
  generated SQL is valid, that the seed is idempotent, and that a price change propagates
  everywhere while a sent quote's snapshot stays frozen.

## Build status

- [x] **Phase 0** — scaffold, auth, shell, proposed schema
- [x] **Phase 1** — migration, seed, calculation engine, catalogue admin, CSV import
- [x] **Phase 2** — quote builder, quote list, status lifecycle, snapshot on send
- [x] **Phase 3** — client preview, branded PDF, send via Resend, public link
- [x] **Phase 4** — ordering: rollup by supplier, persisted ticks, CSV export, purchase orders
- [~] **Phase 5** — handover polish: error/404 boundaries, loading states, skip link,
      focus rings, dead-code sweep, deploy docs. **The visual pass is still outstanding** —
      no database-backed screen has been seen running.

The initial migration is in `drizzle/0000_init.sql`. It has been run against an in-process
Postgres in the test suite, but not yet against a real Supabase project.

## The client-facing quote

`lib/quotes/document.ts` builds one plain `QuoteDocument`. The preview screen, the PDF and
the public link all render from it, so those three can never disagree. A draft is costed
live; a sent quote is built from its snapshot, which is why re-opening an old quote shows
the price the client was actually given.

Sending is deliberately ordered: prepare the snapshot → render the PDF from it → email it →
*only then* mark the quote sent. A quote is never left saying "sent" because an email
bounced.

**Two things are stubbed pending assets from Josh:**

- **The logo** is a dashed placeholder box in both the HTML and the PDF. Drop the real mark
  into `components/quotes/QuoteDocumentView.tsx` and `lib/pdf/QuotePdf.tsx`.
- **PDF fonts** are the built-in Times-Roman and Helvetica, standing in for Cormorant
  Garamond and Mulish. `@react-pdf` needs font *files*, not a webfont stylesheet. Follow the
  three steps in `registerBrandFonts()` in `lib/pdf/QuotePdf.tsx` once the `.ttf` files exist.

## Ordering

`/app/ordering` takes a date window, finds the **confirmed** quotes inside it, and rolls
their packages down through menu items and recipes to ingredients:

```
batches = portions_per_head × guests / yield_portions
needed  = Σ qty × batches
packs   = ceil(needed / pack_size)
```

This uses **live** ingredient costs and pack sizes — deliberately the opposite of a quote,
which renders from its frozen snapshot. The snapshot fixes the price the client was given;
it has nothing to do with what the kitchen has to buy this week.

An `orders` row is opened lazily, the first time a line is ticked, and there is one per
delivery window. Re-syncing the rollup keeps existing ticks and drops lines that have left
the window. Each supplier gets its own CSV — the same text whether downloaded from the
screen or attached to a purchase order, so the office and the supplier never hold different
sheets.

Suppliers with no `contact_email` are **never silently skipped**: they are labelled in the
table, named in the confirm dialog before anything sends, and listed again in the result.
All six seeded suppliers are in that state until real addresses arrive.

## Deploying

Vercel, from this repository.

1. **Import the repo** in Vercel. The defaults are right — it is a standard Next.js app, no
   build-command override needed.
2. **Set the environment variables** from the table above, in Vercel's project settings. Two
   differ from local:
   - `NEXT_PUBLIC_SITE_URL` must be the production URL, e.g. `https://ops.urbanentertaining.com.au`.
     Magic-link sign-in and the client's quote link are both built from it.
   - `DATABASE_URL` should be Supabase's **session pooler** connection string.
3. **Allow the production URL in Supabase.** Authentication → URL Configuration → add
   `https://your-domain/auth/callback` to the redirect allow-list. Sign-in fails silently
   without this.
4. **Run the migration against production once:**

   ```bash
   DATABASE_URL="<production connection string>" npm run db:migrate
   ```

5. **Do not seed production.** `npm run db:seed` loads the placeholder catalogue from the
   mockup. Real data goes in through `/app/recipes/import` and the catalogue screens. The
   only row production genuinely needs is `settings`, which the seed also creates — if you
   skip the seed entirely, insert that row by hand or run the seed against an empty database
   before entering real data and then delete the placeholder rows.
6. **Verify sign-in works** before handing the app to staff: the magic link is the only way in.

Migrations are not run automatically on deploy. That is deliberate — a schema change to a
live catering database should be a decision someone makes, not a side effect of a push.

## What still needs the client

Tracked here so nothing is quietly assumed:

| Item | Why it matters | Where it goes |
| --- | --- | --- |
| Supabase project + keys | Nothing runs without it | `.env.local` |
| Resend API key + verified sender | Quotes and purchase orders cannot email | `.env.local` |
| Supplier contact emails | Purchase orders skip suppliers without one | `/app/suppliers` |
| UE logo | Placeholder box on the quote and PDF | `QuoteDocumentView.tsx`, `QuotePdf.tsx` |
| Cormorant Garamond + Mulish `.ttf` | PDF falls back to Times/Helvetica | `registerBrandFonts()` |
| Real staff cost and charge-out rates | Seeded from the mockup: $48 and $76.80 | `/app/settings` |
| Which packages can be adapted for which diets | Seeded as "all except vegan on grazing" | `/app/packages` |
