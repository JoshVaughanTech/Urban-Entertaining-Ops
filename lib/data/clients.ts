/* Clients: what the office learned last time.
 *
 * Takes the db as an argument like the other data layers, so it can be tested
 * against a throwaway Postgres with no credentials.
 *
 * The rule this module must not break: **nothing here may be joined into a
 * client-facing quote.** A sent quote renders from its snapshot and from
 * events.client_name, so editing a client cannot rewrite a quote they are
 * already holding. `lib/data/client-freeze.test.ts` guards it.
 */

import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

import { sameClient } from "@/lib/clients/match";
import type {
  Client,
  ClientBrief,
  ClientContact,
  ClientHistoryEntry,
  ClientMatch,
  ClientSummary,
  ClientWriteInput,
  ContactWriteInput,
} from "@/lib/clients/types";
import * as s from "@/lib/db/schema";
import type { Cents } from "@/lib/engine/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = PgDatabase<any, any, any>;

export class ClientError extends Error {}

const toContact = (row: typeof s.clientContacts.$inferSelect): ClientContact => ({
  id: row.id,
  role: row.role,
  name: row.name,
  email: row.email,
  phone: row.phone,
  isPrimary: row.isPrimary,
});

/** Primary first, then by role, so the panel reads booker-downwards. */
const contactOrder = (a: ClientContact, b: ClientContact) =>
  Number(b.isPrimary) - Number(a.isPrimary) || a.role.localeCompare(b.role);

/* ── reading ───────────────────────────────────────────────────────────── */

/** Every client, most recently active first — which is who staff are looking
 *  for. Aggregates are computed in SQL rather than by loading every quote.
 *
 *  lifetimeValue counts **confirmed** quotes only, and reads the total out of
 *  the frozen snapshot, because that is what the client actually agreed to
 *  pay. A draft has never been priced to anyone and contributes nothing. */
export async function listClients(db: Db): Promise<ClientSummary[]> {
  const { rows } = await db.execute(sql`
    with agg as (
      select
        e.client_id,
        count(distinct e.id)::int                             as event_count,
        max(e.event_date)                                     as last_event_date,
        coalesce(sum(
          case when q.status = 'confirmed'
            then (q.snapshot -> 'totals' ->> 'total')::bigint
          end
        ), 0)::bigint                                         as lifetime_value
      from events e
      left join quotes q on q.event_id = e.id
      where e.client_id is not null
      group by e.client_id
    ),
    primary_contact as (
      select client_id, name, email
      from client_contacts
      where is_primary
    )
    select
      c.id,
      c.name,
      c.discount_pct,
      p.name  as primary_contact_name,
      p.email as primary_contact_email,
      coalesce(a.event_count, 0)   as event_count,
      a.last_event_date,
      coalesce(a.lifetime_value, 0) as lifetime_value
    from clients c
    left join agg a on a.client_id = c.id
    left join primary_contact p on p.client_id = c.id
    order by a.last_event_date desc nulls last, lower(c.name)
  `);

  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    discountPct: Number(r.discount_pct),
    primaryContactName: (r.primary_contact_name as string | null) ?? null,
    primaryContactEmail: (r.primary_contact_email as string | null) ?? null,
    eventCount: Number(r.event_count),
    lastEventDate: (r.last_event_date as string | null) ?? null,
    // bigint comes back as a string from the driver; parse at this boundary.
    lifetimeValue: Number(r.lifetime_value) as Cents,
  }));
}

/** Names for the typeahead. Deliberately not listClients: that one joins
 *  quotes, digs the total out of each snapshot and joins contacts, none of
 *  which a suggestion shows, and it would run on every keystroke. */
export async function listClientsForSearch(db: Db): Promise<ClientMatch[]> {
  const { rows } = await db.execute(sql`
    select c.id, c.name, c.discount_pct, count(e.id)::int as event_count
    from clients c
    left join events e on e.client_id = c.id
    group by c.id, c.name, c.discount_pct
    order by max(e.event_date) desc nulls last, lower(c.name)
  `);

  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    discountPct: Number(r.discount_pct),
    eventCount: Number(r.event_count),
  }));
}

export async function loadClient(db: Db, id: string): Promise<Client | null> {
  const [row] = await db.select().from(s.clients).where(eq(s.clients.id, id)).limit(1);
  if (!row) return null;

  const contactRows = await db
    .select()
    .from(s.clientContacts)
    .where(eq(s.clientContacts.clientId, id));

  return {
    id: row.id,
    name: row.name,
    discountPct: row.discountPct,
    preferences: row.preferences,
    staffNotes: row.staffNotes,
    contacts: contactRows.map(toContact).sort(contactOrder),
  };
}

/** Their quotes, newest event first. `total` comes from the snapshot, so it is
 *  null for a draft — a draft has no frozen price and inventing one here would
 *  put a second, live number next to the client's frozen copies. */
export async function loadClientHistory(db: Db, clientId: string): Promise<ClientHistoryEntry[]> {
  const rows = await db
    .select({
      quoteId: s.quotes.id,
      ref: s.quotes.ref,
      status: s.quotes.status,
      eventDate: s.events.eventDate,
      guests: s.events.guests,
      packageName: s.packages.name,
      snapshot: s.quotes.snapshot,
    })
    .from(s.quotes)
    .innerJoin(s.events, eq(s.quotes.eventId, s.events.id))
    .leftJoin(s.packages, eq(s.quotes.packageId, s.packages.id))
    .where(eq(s.events.clientId, clientId))
    .orderBy(desc(s.events.eventDate));

  return rows.map((r: Record<string, any>) => ({
    quoteId: r.quoteId,
    ref: r.ref,
    status: r.status,
    eventDate: r.eventDate,
    guests: r.guests,
    packageName: r.packageName ?? null,
    total: (r.snapshot?.totals?.total as number | undefined) ?? null,
  }));
}

/** Events referencing this client. This, not the quote count, is what stands
 *  in the way of deleting them: one event quoted three times is one blocker,
 *  and an event with no quote blocks while showing nothing in history. */
export async function countClientEvents(db: Db, clientId: string): Promise<number> {
  const { rows } = await db.execute(
    sql`select count(*)::int as n from events where client_id = ${clientId}`,
  );
  return Number((rows[0] as { n: number }).n);
}

/** What the quote builder needs on selecting a returning client. */
export async function loadClientBrief(db: Db, id: string): Promise<ClientBrief | null> {
  const client = await loadClient(db, id);
  if (!client) return null;
  return { client, history: await loadClientHistory(db, id) };
}

/* ── writing ───────────────────────────────────────────────────────────── */

function cleanName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name) throw new ClientError("A client needs a name.");
  return name;
}

function cleanPct(raw: number): number {
  if (!Number.isFinite(raw)) throw new ClientError("The discount has to be a number.");
  const pct = Math.round(raw);
  if (pct < 0 || pct > 100) throw new ClientError("The discount has to be between 0 and 100%.");
  return pct;
}

const blankToNull = (v: string | null) => {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
};

/** Turns the database's own unique-index violation into something a person can
 *  read. The constraint is the authority, not a pre-flight select: two staff
 *  saving the same new client at once would both pass a check-then-insert. */
function asDuplicate(error: unknown, name: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("clients_name_lower_idx")) {
    return new ClientError(`There is already a client called ${name}.`);
  }
  return error instanceof Error ? error : new Error(message);
}

export async function createClient(db: Db, input: ClientWriteInput): Promise<Client> {
  const name = cleanName(input.name);
  try {
    const [row] = await db
      .insert(s.clients)
      .values({
        name,
        discountPct: cleanPct(input.discountPct),
        preferences: blankToNull(input.preferences),
        staffNotes: blankToNull(input.staffNotes),
      })
      .returning();
    return { ...row, contacts: [] } as Client;
  } catch (error) {
    throw asDuplicate(error, name);
  }
}

export async function updateClient(db: Db, id: string, input: ClientWriteInput): Promise<void> {
  const name = cleanName(input.name);
  try {
    await db
      .update(s.clients)
      .set({
        name,
        discountPct: cleanPct(input.discountPct),
        preferences: blankToNull(input.preferences),
        staffNotes: blankToNull(input.staffNotes),
        updatedAt: new Date(),
      })
      .where(eq(s.clients.id, id));
  } catch (error) {
    throw asDuplicate(error, name);
  }
}

/** Refused while any event still points at them: losing the client behind a
 *  confirmed event would orphan real money. The FK would refuse anyway; this
 *  turns it into a sentence rather than a Postgres error. */
export async function deleteClient(db: Db, id: string): Promise<void> {
  const [used] = await db
    .select({ id: s.events.id })
    .from(s.events)
    .where(eq(s.events.clientId, id))
    .limit(1);

  if (used) {
    throw new ClientError(
      "This client has events against them, so they cannot be deleted. Edit them instead.",
    );
  }

  await db.delete(s.clients).where(eq(s.clients.id, id));
}

/** Finds an existing client by name, or creates one. Used by the quote builder
 *  when staff type a name rather than picking a suggestion.
 *
 *  Matching is `sameClient` — exact once normalised — so "Harper" never
 *  silently attaches to "Harper & Co.". Anything looser belongs in the
 *  typeahead's suggestions, where a person decides. */
export async function findOrCreateClient(db: Db, rawName: string): Promise<Client> {
  const name = cleanName(rawName);

  // Candidates first, so a match on punctuation or a company suffix is found
  // even though the unique index only knows about lower(name).
  const rows = await db.select().from(s.clients);
  const hit = (rows as (typeof s.clients.$inferSelect)[]).find((r) => sameClient(r.name, name));
  if (hit) {
    const loaded = await loadClient(db, hit.id);
    if (loaded) return loaded;
  }

  /* Insert without letting it fail.
   *
   * This runs inside createQuote’s transaction, and in Postgres a failed
   * statement aborts the whole block — every later command is refused until it
   * ends. So "insert, catch, select" cannot recover here: the recovery SELECT
   * is itself refused, and the caller sees "current transaction is aborted"
   * instead of their quote being saved.
   *
   * Conflicts are not rare enough to treat as exceptional, either. Any name
   * that normalises to nothing — "---", "!!!" — is invisible to sameClient, so
   * the insert is attempted every time and collides from the second one on. */
  const [created] = await db
    .insert(s.clients)
    .values({ name, discountPct: 0, preferences: null, staffNotes: null })
    .onConflictDoNothing()
    .returning();

  if (created) return { ...created, contacts: [] } as Client;

  /* Someone already holds that name: a concurrent save, or a name sameClient
     cannot match. Read back whichever row is there. */
  const [existing] = await db
    .select()
    .from(s.clients)
    .where(sql`lower(${s.clients.name}) = lower(${name})`)
    .limit(1);

  if (existing) {
    const loaded = await loadClient(db, existing.id);
    if (loaded) return loaded;
  }

  throw new ClientError(`Could not attach the quote to a client called ${name}.`);
}

/* ── contacts ──────────────────────────────────────────────────────────── */

/** A client's primary contact is the address a quote is sent to. There can be
 *  at most one, enforced by a partial unique index, so promoting a contact has
 *  to demote the incumbent in the same transaction. */
export async function addContact(
  db: Db,
  clientId: string,
  input: ContactWriteInput,
): Promise<ClientContact> {
  const name = cleanName(input.name);

  return db.transaction(async (tx: Db) => {
    if (input.isPrimary) await demoteOthers(tx, clientId, null);
    const [row] = await tx
      .insert(s.clientContacts)
      .values({
        clientId,
        role: input.role,
        name,
        email: blankToNull(input.email),
        phone: blankToNull(input.phone),
        isPrimary: input.isPrimary,
      })
      .returning();
    if (!row) throw new ClientError("That contact could not be saved.");
    return toContact(row);
  });
}

export async function updateContact(
  db: Db,
  contactId: string,
  input: ContactWriteInput,
): Promise<void> {
  const name = cleanName(input.name);

  await db.transaction(async (tx: Db) => {
    const [existing] = await tx
      .select()
      .from(s.clientContacts)
      .where(eq(s.clientContacts.id, contactId))
      .limit(1);
    if (!existing) throw new ClientError("That contact no longer exists.");

    if (input.isPrimary) await demoteOthers(tx, existing.clientId, contactId);

    await tx
      .update(s.clientContacts)
      .set({
        role: input.role,
        name,
        email: blankToNull(input.email),
        phone: blankToNull(input.phone),
        isPrimary: input.isPrimary,
        updatedAt: new Date(),
      })
      .where(eq(s.clientContacts.id, contactId));
  });
}

export async function removeContact(db: Db, contactId: string): Promise<void> {
  await db.delete(s.clientContacts).where(eq(s.clientContacts.id, contactId));
}

async function demoteOthers(tx: Db, clientId: string, keepId: string | null): Promise<void> {
  const where = keepId
    ? and(eq(s.clientContacts.clientId, clientId), ne(s.clientContacts.id, keepId))
    : eq(s.clientContacts.clientId, clientId);
  await tx.update(s.clientContacts).set({ isPrimary: false }).where(where);
}

/** The address a new quote for this client should default to. */
export function primaryEmail(client: Client): string | null {
  return client.contacts.find((c) => c.isPrimary)?.email ?? null;
}
