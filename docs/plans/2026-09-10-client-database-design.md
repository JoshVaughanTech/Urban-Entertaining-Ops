# Client database, wired into quoting

**Date:** 10 September 2026
**Status:** agreed, not yet built

Today `events.client_name` is free text and there is no client entity. Two quotes for
Harper & Co. are unrelated rows, so nothing the office learned on the first job is
available on the second. This adds clients as a real thing and feeds their history back
into the quote builder.

## What was decided

Four questions settled the shape. Each was a genuine fork, so the reasoning is kept here
rather than left to be re-derived.

| Question | Decision | Why |
| --- | --- | --- |
| How much may history change a quote? | Money pre-fills, visibly flagged and overridable; preferences and staff notes only prompt | "Take it into account" without a rate agreed two years ago silently repricing today |
| What is special pricing? | A standing discount **percentage** on the client | A percentage is a modifier, not a second price. An agreed per-head rate would duplicate the catalogue and go stale against it without telling anyone |
| What is a staff request? | Free text on the client | No staff roster exists, and a people-and-availability subsystem is far beyond quoting |
| How is a client attached? | Typeahead that also creates | Quoting stays exactly as fast as the free-text box it replaces; a phone enquiry is not blocked |

Rejected, and easy to add later on top of this: per-package agreed rates, a named staff
roster, client-level dietary defaults, client payment terms.

## Data model

```
clients
  id            uuid pk
  name          text not null      -- case-insensitively unique
  discount_pct  integer not null default 0
  preferences   text               -- food likes, dislikes, room setup
  staff_notes   text               -- "always requests Maria on service"
  created_at / updated_at

client_contacts
  id         uuid pk
  client_id  uuid -> clients.id  on delete cascade
  role       enum: booker | on_site | billing
  name       text not null
  email      text
  phone      text
  is_primary boolean not null default false   -- who the quote emails

events
  + client_id  uuid -> clients.id  on delete restrict   (nullable)
```

### events.client_name stays

This is the part to not "tidy up" later. `events.client_name` remains alongside
`client_id`, and that is the freeze rule, not redundancy: rename a client next year and
every quote they are already holding must keep the name it was sent under.

`events.contact_email` behaves the same way. It is pre-filled from the primary contact, but
once written it records where *this* quote actually went, so editing a client's contacts
cannot rewrite history.

`client_id` is nullable so the backfill cannot fail on unexpected data and a legacy row
survives. `createQuote` always sets it, so code must still handle a null.

### Names are unique, case-insensitively

"Harper & Co" and "harper & co" cannot both exist. Two genuinely different "Smith Wedding"
clients must be disambiguated by name, which is mildly annoying and beats silently
accruing duplicates.

## Migration

`0004_clients`, generated from the schema, never hand-written.

The backfill creates one client per distinct `events.client_name` and links the existing
events. That turns the demo book into real history immediately instead of leaving every
client looking new on their next quote.

## How it plugs into quoting

The client field becomes a typeahead over `clients.name`, matching on normalised text —
case-folded, `&` and `and` alike, punctuation ignored, trailing "Pty Ltd" dropped — so
"harper and co" finds "Harper & Co.". Each suggestion carries its event count, so a regular
is obvious at a glance.

Picking an existing client shows a panel beside the event details:

- **Previous events** — date, package, guests, total, most recent first, each linking to
  that quote
- **Standing discount** — the percentage, and that it has been applied
- **Preferences** and **staff requests** — read-only here, edited at `/app/clients/[id]`
- **Contacts** — primary one pre-filled into the event's contact email

Typing a name that matches nothing does nothing until save, at which point the client is
created and linked. One-off enquiries cost no extra clicks.

### The discount is the only thing that touches money

On selection the builder computes `round(subtotal × discount_pct)` into the **existing**
discount field, labelled as coming from the client. The engine gains a pure function for
that; it does not gain a concept of percentages.

It keeps tracking the subtotal — change the guest count and it recomputes — until staff
type their own number, at which point it stops tracking and stays put. Editing it never
writes back to the client: a one-off concession is not a renegotiation.

Nothing is persisted about *where* the discount came from. Reopening a draft treats the
saved cents as staff's own number, which is honest and avoids storing the same fact twice.

### Nothing new reaches the client

Preferences and staff notes are internal operational memory. They sit with the existing
internal-only block and never appear in the client-facing document or the PDF. The discount
reaches the client the way it already does — as cents on the quote, frozen in the snapshot.

## Screens

- **`/app/clients`** — name, primary contact, event count, last event, lifetime value,
  discount. Sorted by most recent activity, since that is who staff are looking for.
- **`/app/clients/[id]`** — the record, its contacts, and the event history as a table of
  their quotes with status and total.

**Clients** goes in the nav's primary group under Quotes. It is reached for while quoting,
not configured once like the catalogue.

## Code layout

```
lib/db/schema.ts        + clients, client_contacts, events.client_id
lib/data/clients.ts     rows -> types; the only place these numerics parse
lib/actions/clients.ts  server actions: requireUser, denyReadOnly, delegate
lib/clients/match.ts    pure: name normalisation and matching
lib/clients/types.ts    shared types, so the "use server" file exports only functions
components/forms/ClientForm.tsx
components/quotes/ClientPicker.tsx
```

Write functions take `db` first — `createClient(db, …)`, `linkEvent(db, …)` — so they are
testable against the throwaway Postgres with no credentials, with the server action a thin
wrapper. Discount maths goes in the engine as a pure function, not in a component.

Every write calls `denyReadOnly()`, so the demo viewer sees clients and their history and
changes nothing. Write controls hide behind `<CanWrite>`, with the action still guarding —
the browser is never the boundary.

Deletion is `on delete restrict`. A client with quotes against them can be edited, not
deleted; losing the client behind a confirmed event would orphan real money.

## Tests

In order of importance:

1. **The freeze test.** Send a quote, then rename the client, change their discount and
   rewrite their notes. The snapshot, the rendered document and the PDF must all come back
   identical. This protects the invariant the whole app is built on, and it gets written
   first.
2. **The backfill migration** — against the in-process Postgres, over events with duplicate
   and case-varying names: one client per distinct name, every event linked.
3. **Name matching** — pure, over the normalisation rules above.
4. **Discount maths** — pure: rounding to whole cents, 0%, 100%, never a negative total.
5. **Access** — a viewer reads clients and cannot write them.

## Known risks

- **Near-duplicates survive.** "Harper & Co." and "Harper Group" are different rows and no
  constraint catches it. The typeahead surfacing existing matches first is the only
  mitigation. Merging clients is not in scope.
- **`events.client_id` is nullable**, so every read path must handle a null rather than
  assuming a client. That is the deliberate trade for a migration that cannot fail.
- The dev database serves **one connection at a time**, so the usual rule applies: stop
  `npm run dev` before running the migration or the seed against it.
