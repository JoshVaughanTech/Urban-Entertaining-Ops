# Urban Entertaining Ops — Claude Code handover

You are building an internal operations app for Urban Entertaining, a premium Melbourne catering and events business. Two tools, one data model:

1. **Quote builder** — staff enter an event, the app matches it against the packages UE sells, and they produce a customisable client quote with live cost and margin.
2. **Ordering** — confirmed quotes are rolled up over a date window into an ingredient order list, rounded to supplier pack sizes and grouped by supplier.

Both tools are outputs of the same chain: **package → menu items → recipes → ingredients**. Never let a second copy of any of that data exist.

`reference/mockup.jsx` is the approved interactive mockup. Match its behaviour and its calculations exactly; match its look closely. `seed/*.json` is the placeholder data behind it — use it for seeding and tests. Real client data replaces it later via import.

---

## Stack (defaults — Josh may override in the first message)

- Next.js 15, App Router, TypeScript strict. Server components by default; client components only where there is interaction.
- Postgres on Supabase. Drizzle ORM with migrations in `drizzle/`.
- Supabase Auth, email magic link. Single tenant. Two roles: `admin`, `staff`.
- CSS Modules with global tokens in `app/globals.css`. Fonts via `next/font`: Cormorant Garamond (display) and Mulish (body) — same pairing as the UE marketing site.
- Client quote PDF: `@react-pdf/renderer`.
- Tests: Vitest for the calculation engine. No E2E for v1.
- Deploy: Vercel.

Design tokens (from the mockup — these are the palette, not suggestions):
`--bg #F3F1EC`, `--paper #FFFFFF`, `--line #DDD8CE`, `--ink #1F1D19`, `--muted #7A756B`, `--green #2F4A3A`, `--green-soft #E6ECE7`, `--amber #8A5A16`, `--amber-soft #F5EBD8`, `--red #8C3A2E`, `--red-soft #F4E3DF`.

---

## Data model

```
suppliers        id, name, contact_email, notes
ingredients      id, supplier_id, name, unit (kg|L|each|dozen), pack_size, cost_per_unit,
                 cost_updated_at, active
recipes          id, name, yield_portions, notes, active
recipe_items     recipe_id, ingredient_id, qty
menu_items       id, name, recipe_id, portions_per_head, dietary_tags[] (vegetarian|vegan|gf|df|halal|nut_free)
packages         id, name, style (cocktail|seated|grazing|corporate), blurb, min_guests, max_guests,
                 staff_per_guests (nullable), service_hours, includes[] (text), active
package_tiers    package_id, up_to_guests, price_per_head
package_items    package_id, menu_item_id
addons           id, name, price, pricing_basis (head|flat)
settings         staff_hourly_cost, staff_hourly_charge, gst_rate, quote_validity_days, deposit_pct

events           id, client_name, contact_email, event_date, guests, style, duration_hours,
                 venue, dietary[], notes
quotes           id, ref (UE-####, sequential), event_id, package_id, price_per_head (overridden),
                 discount, status (draft|sent|confirmed|declined|cancelled), sent_at, confirmed_at,
                 snapshot (jsonb — see below), created_by
quote_addons     quote_id, addon_id
quote_lines      quote_id, sort, label, qty, unit_price, source (package|addon|extended_service|custom)

orders           id, window_from, window_to, created_at, status (draft|placed)
order_lines      order_id, ingredient_id, supplier_id, needed_qty, packs, order_qty, unit_cost,
                 ordered (bool), quote_ids[]
```

**Quote snapshot.** When a quote is sent, freeze the resolved package, menu items, recipes, ingredient costs and prices into `quotes.snapshot`. Sent and confirmed quotes render from the snapshot, never from live tables, so a price change next week doesn't rewrite a quote the client already has. Ordering, by contrast, uses **live** ingredient costs and pack sizes — the snapshot is for the price, not the shopping.

Custom quote lines exist (`source = custom`) so staff can add a one-off item. They carry no recipe and no cost; the margin panel flags them as "uncosted".

---

## Calculation rules (port from the mockup, then test)

Put these in `lib/engine/` as pure functions with no DB access. Vitest them against the seed data.

- `tierPrice(package, guests)` — first tier where `guests <= up_to_guests`, else the last tier.
- `recipeCostPerPortion(recipe)` — Σ(qty × cost_per_unit) / yield_portions.
- `foodCostPerHead(package)` — Σ over package menu items of `recipeCostPerPortion × portions_per_head`.
- `staffCost(package, guests)` — `ceil(guests / staff_per_guests) × service_hours × staff_hourly_cost`; 0 when `staff_per_guests` is null.
- `fitPackage(package, event)` → list of issues. Hard issues block selection: guests below min, guests above max, a dietary requirement no menu item in the package can satisfy. Soft issues warn but allow: different service style. Rank packages by issue count, hard issues last.
- Quote lines: package line (guests × price_per_head, editable), one line per add-on (`head` → qty = guests; `flat` → qty = 1), extended service when `event.duration_hours > package.service_hours` and the package has staff: qty = extra hours × staff count, unit = `staff_hourly_charge`.
- Total = Σ lines − discount. Prices are GST inclusive; show the GST component on the PDF.
- Gross margin = (total − food − staff) / total. Flag below 55% in red.
- Ingredient rollup over a set of confirmed quotes: for each quote → package → menu item → recipe, `batches = portions_per_head × guests / yield_portions`; `needed = Σ qty × batches` per ingredient; `packs = ceil(needed / pack_size)`; `order_qty = packs × pack_size`; group by supplier. Record which quote refs contributed to each line.

---

## Build phases

Work one phase at a time. Each phase ends with a short summary of what was built, what was assumed, and the commands to run it. **Stop at the review points and wait.**

### Phase 0 — Scaffold
Repo `urban-entertaining-ops`. Next.js + TS strict + CSS Modules + fonts + tokens. Supabase project wiring (Josh creates the project and supplies `.env.local`; do not invent keys). Drizzle configured. Auth with a single protected `/app` layout. Empty shell with the sidebar from the mockup: New quote, Quotes, Ordering, Packages, Recipes, Settings.

**Review point:** post the proposed Drizzle schema before running any migration.

### Phase 1 — Data layer and catalogue admin
Migrations. Seed script from `seed/*.json`. Admin CRUD screens for suppliers, ingredients, recipes (with recipe items), menu items, packages (tiers, items, includes), add-ons, settings. Recipe and ingredient CSV import at `/app/recipes/import` — template download, validation with row-level errors, dry-run preview, commit. Packages and Recipes screens match the mockup tabs (costed recipes, food cost per guest against lowest tier, ingredients by supplier with "used in").

Acceptance: seed loads; every catalogue table is editable; changing an ingredient cost changes recipe and package costs everywhere immediately; import rejects a bad file without partial writes; engine tests pass.

### Phase 2 — Quote builder
`/app/quotes/new`: event form → ranked packages with fit tags → quote panel (stats, editable lines, add-ons, discount) → save as draft. `/app/quotes`: list with status, totals, filters; open to edit while draft; "Mark confirmed" / "Mark declined". Quote refs sequential from settings. Snapshot written on send.

Acceptance: recreates every interaction in the mockup; per-head override shows the list price beside it; margin updates live; a confirmed quote is read-only except status.

**Review point:** demo before PDF work.

### Phase 3 — Client-facing quote
`/app/quotes/[id]/preview` mirroring the mockup preview. PDF download in UE branding: logo (placeholder slot), event meta, lines, GST, inclusions, menu, dietary note, validity and deposit terms from settings. "Send to client" emails the PDF via Resend (Josh supplies the key) and sets status to `sent`. Public read-only link `/q/[token]` for the client to view; no accept button in v1.

### Phase 4 — Ordering
`/app/ordering`: date window → confirmed events in window → rollup by supplier with needed / order / cost / "for" columns and per-line ordered checkbox. Save as an `orders` record so tick state persists. Export one CSV per supplier. "Send purchase orders" emails each supplier its CSV (behind a confirm dialog; uses supplier contact_email; skip suppliers with none and say so).

Acceptance: rollup for the seed's two confirmed September events matches the mockup exactly; changing a quote's guest count after confirmation changes the rollup; an ingredient with no supplier email is surfaced, not silently dropped.

### Phase 5 — Handover polish
Empty states with a clear next action (see mockup copy). Error states that say what happened and what to do. Keyboard focus visible. Mobile-usable at 390px (staff will open quotes on phones at venues). `README.md` covering env vars, seed, import format, deploy. Delete any code paths the client can't reach.

---

## Guardrails

- One data model. If you find yourself storing a price or a cost in two places, stop and refactor.
- Engine functions stay pure and tested. UI never does arithmetic that the engine could do.
- No server actions without auth check. No public routes except `/q/[token]`.
- Don't add libraries beyond the stack above without saying why in the phase summary.
- Don't redesign. The mockup is the design; deviate only where the web needs it (focus rings, responsive stacking, loading states).
- Never fabricate env values, API keys, supplier emails or client data.
- Money is stored in cents as integers, quantities as `numeric(10,3)`. Format for display only.

## Working style

- Before each phase: list the files you'll touch and any assumptions, then go.
- Commit per phase with a plain commit message.
- If something in this doc conflicts with the mockup, the mockup wins for behaviour and this doc wins for data model. Say when that happens.
- Ask only when blocked. Prefer a stated assumption over a question.

## Open questions for the client (Josh confirms before Phase 2)

1. Real package list and how they actually price — flat per head, tiered, or negotiated? Tiers are the current assumption.
2. Recipe data: what format is it in today, and does every menu item have a written recipe with yields? Items without a recipe can't be ordered against.
3. Are ingredient prices maintained by hand in this app, or should they eventually come from supplier invoices/order history? Manual is v1; leave the schema ready (`cost_updated_at`, per-supplier ingredients).
4. Do they hold pantry stock they'd want subtracted from orders? Not in v1; don't build it, don't block it.
5. Staff cost and charge-out rates for the settings table.
