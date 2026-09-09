# Working on this codebase

Internal quoting and ordering app for Urban Entertaining, a Melbourne catering business.
`README.md` covers setup, deploy and the import formats. This file is the things that are
easy to get wrong.

## The one rule that matters most

**A quote freezes; ordering stays live.**

- Once a quote is sent (or confirmed straight from a draft) its `snapshot` is written, and
  every client-facing view renders from it. A price rise next week must never rewrite a
  quote the client is already holding.
- Ordering does the opposite: it always recomputes from **current** ingredient costs and
  pack sizes. The snapshot fixes the price, not the shopping.

Getting this backwards is the most expensive mistake available here, and both directions are
tested (`lib/data/quotes.test.ts`, `lib/data/orders.test.ts`). If you touch either, keep
those tests honest rather than adjusting them to match new behaviour.

## Architecture

Everything is an output of one chain: **package → menu items → recipes → ingredients**.
There is exactly one copy of that data. If you find yourself storing a price or a cost in a
second place, stop and refactor.

```
lib/engine/     pure calculations. No DB import, ever. Runs on server and client.
lib/data/       the only place database rows become engine types. Parses numerics here.
lib/actions/    server actions: auth check, validate, delegate. No business logic.
lib/quotes/     pure quote code — payload parsing, the client document, shared types.
lib/import/     CSV parsing and validation, pure.
lib/orders/     purchase-order CSV, pure.
lib/seed/       seed data, and every assumption behind it.
components/ui/  CSS-Modules primitives. components/forms/ and others build on these.
```

**Write layers take `db` as an argument** (`seedDatabase(db, …)`, `createQuote(db, …)`,
`syncOrder(db, …)`). That is what makes them testable against a throwaway Postgres without
credentials. New write code should follow the same shape; the server action stays a thin
wrapper over it.

## Conventions

- **Money is integer cents.** Always. `numeric` columns come back from the driver as
  strings and are parsed in `lib/data/catalogue.ts` — the only place that should happen.
  Format for display with `lib/engine/format.ts`, never with ad-hoc `toFixed`.
- **The engine is pure and tested.** The UI must not do arithmetic the engine could do.
- **Every exported server action calls `requireUser()` first.** Middleware is not an
  authorisation boundary on its own. `/q/[token]` is the only public route.
- **Authentication is not authorisation.** A Supabase session only proves someone owns an
  email address — anyone can get one. `app_users` is the allowlist, and `requireUser()`
  checks it on every request. Admin-only work calls `requireAdmin()`. See **Access** below.
- **Assumptions live in `lib/seed/assumptions.ts`.** The client's `seed/*.json` is untouched
  as delivered. Anything derived or inferred goes in that one file with its reasoning.
- **Never fabricate** env values, API keys, supplier emails or client data. If something is
  missing, the app should say so rather than invent a default.

## Traps that have already cost time

- **`"use server"` files may only export async functions.** Exporting a type is fine
  (erased), but a `const`, a class or a sync function breaks the build in a confusing way.
  Put them in a neighbouring pure module — that is why `lib/quotes/payload.ts` and
  `lib/import/types.ts` exist.
- **`typedRoutes` is on.** A dynamic href needs `as Route`, and a link to a route that does
  not exist yet is a type error, not a runtime 404.
- **Vitest needs `esbuild: { jsx: "automatic" }`** (already set). Without it any test that
  renders JSX fails with "React is not defined".
- **The driver is `node-postgres`, not `postgres.js`.** postgres.js could not talk to a
  local Postgres-wire test server; `pg` is the standard driver and works with Supabase
  identically. `DATABASE_POOL_MAX` exists for constrained local servers.
- **Drizzle interpolates a JS array as a record**, so a raw `sql` template with
  `<> all(...)` over an array fails with "cannot cast type record to uuid[]". Use the query
  builder's `notInArray(column, values)` instead.
- **A server component cannot read styles from a `"use client"` module.**
  `components/ui/form.tsx` is a client module; importing its `form` styles object from a
  server component yields `undefined`, so every class silently becomes empty and the markup
  renders unstyled — no error, no warning. Server components import
  `@/components/ui/form.module.css` directly. This shipped broken on the ordering screen and
  was only caught by running the app.
- **A URL fragment never reaches the server.** Supabase can finish a magic link in three
  shapes: `?code=` (PKCE, what `@supabase/ssr` asks for), `?token_hash=&type=`, or
  `#access_token=` (implicit). The third is a *fragment*, so `/auth/callback` cannot see it
  and sign-in fails with **no request in the log at all** — it looks exactly as though the
  link was never clicked. `components/auth/HashSession.tsx` catches it in the browser, on
  `/login`, which is where it ends up because fragments survive redirects. The route
  handles the other two shapes.
- **Supabase ignores `emailRedirectTo` unless that exact URL is in the redirect allowlist**,
  and falls back to the Site URL without saying so — the code then lands on `/`, where
  nothing reads it. Middleware forwards `?code=`/`?token_hash=` from `/` and `/login` to the
  callback. Only those two paths: forwarding blindly would let a stray query parameter
  hijack `/q/[token]`, which belongs to a client.
- **@react-pdf fails silently on assets it cannot load.** Given a `src` string that is not
  an http URL it still calls `fetch()`, which on a local file path throws — and the render
  carries on and emits a perfectly valid PDF with the image simply missing. A font that
  fails to register falls back to Helvetica just as quietly. So "it produced a PDF" proves
  nothing: pass images as `{ data: Buffer, format }`, and let `lib/pdf/assets.test.ts`
  assert what actually got embedded.
- **Files read at request time need `outputFileTracingIncludes`.** The PDF reads the brand
  fonts and the mark off disk. Next cannot trace a path built with `path.join`, so
  `next.config.ts` declares them; without it the build is green and the deployed route
  throws ENOENT.
- **Screens under `/app` must not be prerendered** — they read session cookies and live
  data. The layout sets `dynamic = "force-dynamic"`.

## Running it locally

`npm run db:dev` starts a Postgres for development — PGlite behind a real wire-protocol
socket, migrated and seeded — so the app can run before a Supabase project exists. It
serves **one connection at a time**, so `.env.local` must pin the pool:

```
DATABASE_URL=postgres://postgres@127.0.0.1:5433/postgres
DATABASE_POOL_MAX=1
DATABASE_IDLE_TIMEOUT=0
```

Without those the pool opens a second connection, or retires and reopens an idle one, and
the socket server resets it. Auth still needs a real Supabase project — the local database
covers the data, not the sign-in.

`npm run db:dev:demo` seeds a fuller book of work as well: 15 quotes across every status,
dated relative to today. `npm run db:demo` does the same against a real database.

**One connection means one client.** Anything else that wants the local database — a build,
`db:seed`, `db:demo` — fails with ECONNRESET while `npm run dev` is running. Stop the dev
server first, or expect the odd transient build failure. Supabase has no such limit.

## Testing

```bash
npm test
```

Twelve suites, all runnable with no credentials and no network:

- **Engine** — checked against golden values produced by running the approved mockup's own
  functions over its own data. If a number here changes, the app has stopped agreeing with
  the design. Regenerate goldens only with a deliberate decision, never to make a test pass.
- **Migration and seed, quote lifecycle, ordering** — run the real migration and the real
  seed against an in-process Postgres (PGlite, a devDependency; nothing in the app imports
  it). This is how schema and SQL get verified without a Supabase project.
- **Form validation, quote payload, public routes, access** — the trust boundaries. The
  access suite covers who gets in, and that the last admin cannot be removed.
- **CSV import and purchase-order CSV** — including a round trip through the importer's own
  parser, so the two CSV modules cannot drift apart.

Migrations are generated, never hand-written: edit `lib/db/schema.ts`, then
`npm run db:generate`. Three so far: `0000_init`, `0001_order_window_unique`,
`0002_app_users_allowlist`, `0003_viewer_role`.

## Design

`reference/mockup.jsx` is the approved interactive mockup and the **design authority for
behaviour**; `CLAUDE_HANDOVER.md` wins on the **data model**. Where they conflicted it is
noted in the code at the point of conflict.

Don't redesign. Deviate only where the web genuinely needs it — focus rings, responsive
stacking, loading states — and comment where you do.

**The palette is the live website's, not the mockup's** (client's instruction, 10 September
2026). `app/globals.css` mirrors urbanentertaining.com.au's own custom properties — navy
`#16263F`, off-white `#FCFBF9`, slate `#5B6C86` — under the token names this app already
used, and the nav is navy with white ink the way the site's is. Cormorant Garamond and
Mulish were already right; Montserrat joins them for the wordmark only.

Two things that were one token in the mockup are now two. `--accent` is the brand colour and
drives focus rings, the active nav item and selection; `--green` stayed forest and means
*confirmed*, because navy can no longer signal success once everything is navy. The website
is marketing copy and carries no status palette, so amber and red are still the mockup's.

Neither is a suggestion. If you need a new colour, take it from the site.

## Access

`app_users` is the allowlist: no row, no entry, whatever address someone signs in with.
People can be added by email before they have ever signed in — `id` is the app's own id and
`auth_user_id` binds on their first sign-in.

Three ways in, checked in order: already bound by Supabase id; added by email and binding
now; or listed in `ALLOWED_EMAILS`. If **nobody can administer the list** and
`ALLOWED_EMAILS` is unset, the first person to sign in becomes admin — otherwise a fresh
deployment would be unusable — and it closes as soon as there is an admin.

That condition is *no admins*, not *no rows*, and the difference is a real lockout: adding a
single viewer to an empty table leaves rows but nobody who can manage them, so an
"is the table empty" test shuts the door with nobody inside. That happened once, on the day
the demo account was added.

`npm run user:add -- <email> <role>` grants access without the Access screen, for a fresh
deployment or an office whose last admin has left.
`npm run user:list` prints the list. Both want the
database to themselves — stop `npm run dev` first when running against the local one.

Three roles. **admin** manages access; **staff** quote and order; **viewer** is read-only —
it sees every screen and changes nothing, which is what makes a demo account safe to hand
out. Every action that writes or sends calls `denyReadOnly()`; the only unguarded one is
`previewImport`, which validates an uploaded file and writes nothing. A viewer especially
cannot email a client or a supplier.

The matching UI lives in `components/ReadOnly.tsx` — `useReadOnly()` and `<CanWrite>`, fed
by the app layout. Write controls hide themselves rather than refusing on click.
**That is presentation only.** Hiding a button without also guarding its action would be a
security hole, not a tidy-up: the browser is never the boundary. `SubmitButton` takes
`writesNothing` for submits that only read, like the import dry run, which stay available.

The last admin cannot be removed or demoted, by anyone including themselves. Without that
guard one click leaves nobody able to manage access and no way back except editing the
database by hand.

Managed at `/app/team`. Rejected users land on `/no-access`, which is public by design and
shows nothing.

## Quote status

Every outcome can be corrected into another outcome — confirmed, declined and cancelled all
reach each other, and the mockup's "Mark confirmed" shows on anything not already confirmed.
What is refused is relabelling back into a state that is entered by *doing* something: draft
by writing the quote, sent by sending it. Confirming a draft freezes a snapshot, because a
confirmed quote must render from one.

## Dietary fit

A package satisfies a dietary requirement if a listed menu item carries the tag **or** the
package is marked adaptable for it (`packages.adaptable_dietary`). Confirmed by the client,
4 September 2026: every package adapts for everything except vegan on the grazing table, so
that is the only combination the fit checker blocks. Seeded in `lib/seed/assumptions.ts`,
editable per package at `/app/packages`.

The seed's menu items carry no tags of their own — capability lives on the package, because
it is what the kitchen can cook rather than a property of a listed dish.

## Open questions — do not silently resolve these

- **The screens have been walked once, against the local database** (4 September 2026):
  packages, ordering, the quote builder, the quotes list and the client preview all render
  correctly, and the PDF route returns a real PDF. Not yet walked: the catalogue edit forms,
  CSV import, and settings. Nothing has been seen against Supabase itself.
- **The rebrand has been seen on two screens only** (10 September 2026): `/login` and the
  public `/q/[token]`, which is the first time that page has been looked at at all. Both
  render correctly. Everything behind sign-in — the **navy nav in particular** — is
  typechecked and its CSS verified served, but nobody has laid eyes on it, and the walk on
  4 September predates the new palette. Treat the `/app` screens as unseen under this theme.
- **The PDF has not been seen either.** `lib/pdf/assets.test.ts` proves the real fonts and
  the mark are embedded and that no fallback face survives, but no one has looked at the
  page: headless Chrome will not rasterise a PDF and there is no poppler on the dev machine.
  Layout is unchanged from the version that was walked, so the risk is small, not zero.
- Outstanding client-supplied items are tabled at the end of `README.md`.
