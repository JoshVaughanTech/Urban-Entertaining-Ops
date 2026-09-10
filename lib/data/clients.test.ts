/* The client data layer, against a real in-process Postgres.
 *
 * The freeze rule has its own suite (client-freeze.test.ts). This one covers
 * the record itself: duplicates, the primary contact, the aggregates on the
 * list, and that history reports what a client was actually given rather than
 * a number computed today.
 */

import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { loadCatalogue, loadSettings } from "@/lib/data/catalogue";
import { createQuote, sendQuote, setQuoteStatus } from "@/lib/data/quotes-write";
import * as s from "@/lib/db/schema";
import type { Catalogue, Settings } from "@/lib/engine/types";
import type { QuoteWriteInput } from "@/lib/quotes/types";
import { toCents } from "@/lib/seed/fixtures";
import { seedDatabase } from "@/lib/seed/run";
import {
  ClientError,
  addContact,
  createClient,
  deleteClient,
  countClientEvents,
  findOrCreateClient,
  listClients,
  listClientsForSearch,
  loadClient,
  loadClientHistory,
  primaryEmail,
  removeContact,
  updateClient,
  updateContact,
} from "./clients";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let cat: Catalogue;
let settings: Settings;
let packageId: string;

beforeAll(async () => {
  db = drizzle(new PGlite(), { casing: "snake_case" });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedDatabase(db);
  cat = await loadCatalogue(db);
  settings = await loadSettings(db);
  const packages = await db.select().from(s.packages);
  packageId = packages.find((p: { slug: string }) => p.slug === "cocktail_signature").id;
}, 120_000);

const blank = { discountPct: 0, preferences: null, staffNotes: null };

const quoteInput = (clientName: string, over: Partial<QuoteWriteInput> = {}): QuoteWriteInput => ({
  event: {
    clientId: null,
    clientName,
    contactEmail: null,
    eventDate: "2026-11-14",
    guests: 80,
    style: "cocktail",
    durationHours: 4,
    venue: null,
    dietary: [],
    notes: null,
    ...over.event,
  },
  packageId,
  pricePerHead: toCents(82),
  discount: 0,
  addonIds: [],
  customLines: [],
});

/** A quote for this client, linked the way the builder will link it. */
async function quoteFor(clientId: string, clientName: string, over: Partial<QuoteWriteInput> = {}) {
  const { id } = await createQuote(db, quoteInput(clientName, over), cat, settings, null);
  await db.execute(sql`
    update events set client_id = ${clientId}
    where id = (select event_id from quotes where id = ${id})
  `);
  return id;
}

describe("creating and editing a client", () => {
  it("trims the name and collapses inner whitespace", async () => {
    const c = await createClient(db, { ...blank, name: "  Trim   Me  " });
    expect(c.name).toBe("Trim Me");
  });

  it("stores blank notes as null rather than empty strings", async () => {
    const c = await createClient(db, {
      name: "Blank Notes",
      discountPct: 0,
      preferences: "   ",
      staffNotes: "",
    });
    expect(c.preferences).toBeNull();
    expect(c.staffNotes).toBeNull();
  });

  it("refuses a name that is only whitespace", async () => {
    await expect(createClient(db, { ...blank, name: "   " })).rejects.toThrow(ClientError);
  });

  it("refuses a duplicate name differing only by case, in words", async () => {
    await createClient(db, { ...blank, name: "Duplicate Co" });
    await expect(createClient(db, { ...blank, name: "DUPLICATE CO" })).rejects.toThrow(
      /already a client called/,
    );
  });

  it("refuses a discount outside 0..100", async () => {
    await expect(createClient(db, { ...blank, name: "Bad Pct", discountPct: 101 })).rejects.toThrow(
      /between 0 and 100/,
    );
    await expect(createClient(db, { ...blank, name: "Bad Pct", discountPct: -5 })).rejects.toThrow(
      /between 0 and 100/,
    );
  });

  it("keeps the discount as a whole number of percent", async () => {
    const c = await createClient(db, { ...blank, name: "Rounded Pct", discountPct: 12.6 });
    const loaded = await loadClient(db, c.id);
    expect(loaded!.discountPct).toBe(13);
  });

  it("updates in place", async () => {
    const c = await createClient(db, { ...blank, name: "Before Rename" });
    await updateClient(db, c.id, {
      name: "After Rename",
      discountPct: 15,
      preferences: "No shellfish",
      staffNotes: "Maria",
    });
    const loaded = await loadClient(db, c.id);
    expect(loaded).toMatchObject({
      name: "After Rename",
      discountPct: 15,
      preferences: "No shellfish",
      staffNotes: "Maria",
    });
  });
});

describe("findOrCreateClient", () => {
  it("creates one when nothing matches", async () => {
    const c = await findOrCreateClient(db, "Brand New Client");
    expect(c.name).toBe("Brand New Client");
    expect(c.discountPct).toBe(0);
  });

  it("finds an existing one across punctuation, case and company suffix", async () => {
    const made = await createClient(db, { ...blank, name: "Fuzzy & Co." });
    for (const typed of ["fuzzy and co", "FUZZY & CO.", "Fuzzy and Co Pty Ltd"]) {
      const found = await findOrCreateClient(db, typed);
      expect(found.id).toBe(made.id);
    }
  });

  it("does not attach a prefix to a longer name", async () => {
    await createClient(db, { ...blank, name: "Prefix Holdings Group" });
    const made = await findOrCreateClient(db, "Prefix");
    expect(made.name).toBe("Prefix");
  });

  it("returns the client with its contacts loaded", async () => {
    const made = await createClient(db, { ...blank, name: "With Contacts" });
    await addContact(db, made.id, {
      role: "booker",
      name: "Ada",
      email: "ada@example.com",
      phone: null,
      isPrimary: true,
    });
    const found = await findOrCreateClient(db, "with contacts");
    expect(found.contacts).toHaveLength(1);
    expect(primaryEmail(found)).toBe("ada@example.com");
  });
});

describe("contacts", () => {
  it("allows one primary, and promoting demotes the incumbent", async () => {
    const c = await createClient(db, { ...blank, name: "Promote Co" });
    const first = await addContact(db, c.id, {
      role: "booker",
      name: "First",
      email: "first@example.com",
      phone: null,
      isPrimary: true,
    });
    const second = await addContact(db, c.id, {
      role: "on_site",
      name: "Second",
      email: "second@example.com",
      phone: null,
      isPrimary: false,
    });

    await updateContact(db, second.id, {
      role: "on_site",
      name: "Second",
      email: "second@example.com",
      phone: null,
      isPrimary: true,
    });

    const loaded = await loadClient(db, c.id);
    const primaries = loaded!.contacts.filter((x) => x.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0]!.id).toBe(second.id);
    expect(loaded!.contacts.find((x) => x.id === first.id)!.isPrimary).toBe(false);
  });

  it("demotes the incumbent when a new primary is added", async () => {
    const c = await createClient(db, { ...blank, name: "Add Primary Co" });
    await addContact(db, c.id, {
      role: "booker",
      name: "Old",
      email: null,
      phone: null,
      isPrimary: true,
    });
    await addContact(db, c.id, {
      role: "billing",
      name: "New",
      email: null,
      phone: null,
      isPrimary: true,
    });

    const loaded = await loadClient(db, c.id);
    expect(loaded!.contacts.filter((x) => x.isPrimary)).toHaveLength(1);
    expect(loaded!.contacts.find((x) => x.isPrimary)!.name).toBe("New");
  });

  it("sorts primary first", async () => {
    const c = await createClient(db, { ...blank, name: "Sorted Co" });
    await addContact(db, c.id, {
      role: "billing",
      name: "Billing",
      email: null,
      phone: null,
      isPrimary: false,
    });
    await addContact(db, c.id, {
      role: "on_site",
      name: "Onsite",
      email: null,
      phone: null,
      isPrimary: true,
    });
    const loaded = await loadClient(db, c.id);
    expect(loaded!.contacts[0]!.name).toBe("Onsite");
  });

  it("removes a contact without touching the client", async () => {
    const c = await createClient(db, { ...blank, name: "Remove Contact Co" });
    const contact = await addContact(db, c.id, {
      role: "booker",
      name: "Gone",
      email: null,
      phone: null,
      isPrimary: false,
    });
    await removeContact(db, contact.id);
    const loaded = await loadClient(db, c.id);
    expect(loaded!.contacts).toHaveLength(0);
    expect(loaded!.name).toBe("Remove Contact Co");
  });

  it("has no primary email when nobody is primary", async () => {
    const c = await createClient(db, { ...blank, name: "No Primary Co" });
    await addContact(db, c.id, {
      role: "booker",
      name: "Someone",
      email: "someone@example.com",
      phone: null,
      isPrimary: false,
    });
    const loaded = await loadClient(db, c.id);
    expect(primaryEmail(loaded!)).toBeNull();
  });
});

describe("deleting", () => {
  it("deletes a client with no events", async () => {
    const c = await createClient(db, { ...blank, name: "Deletable Co" });
    await deleteClient(db, c.id);
    expect(await loadClient(db, c.id)).toBeNull();
  });

  it("refuses, in words, to delete a client with events", async () => {
    const c = await createClient(db, { ...blank, name: "Has Events Co" });
    await quoteFor(c.id, "Has Events Co");
    await expect(deleteClient(db, c.id)).rejects.toThrow(/cannot be deleted/);
  });
});

describe("history", () => {
  it("reports the frozen total for a sent quote and nothing for a draft", async () => {
    const c = await createClient(db, { ...blank, name: "History Co" });
    const draftId = await quoteFor(c.id, "History Co");
    const sentId = await quoteFor(c.id, "History Co", {
      event: { ...quoteInput("History Co").event, eventDate: "2026-12-01" },
    });
    await sendQuote(db, sentId, cat, settings);

    const history = await loadClientHistory(db, c.id);
    const draft = history.find((h) => h.quoteId === draftId)!;
    const sent = history.find((h) => h.quoteId === sentId)!;

    expect(draft.total).toBeNull();
    expect(sent.total).toBeGreaterThan(0);
    expect(sent.packageName).toBeTruthy();
  });

  it("is newest event first", async () => {
    const c = await createClient(db, { ...blank, name: "Ordered History Co" });
    await quoteFor(c.id, "Ordered History Co", {
      event: { ...quoteInput("x").event, clientName: "Ordered History Co", eventDate: "2026-01-01" },
    });
    await quoteFor(c.id, "Ordered History Co", {
      event: { ...quoteInput("x").event, clientName: "Ordered History Co", eventDate: "2026-09-09" },
    });

    const history = await loadClientHistory(db, c.id);
    expect(history[0]!.eventDate).toBe("2026-09-09");
  });
});

describe("the clients list", () => {
  it("counts events and takes lifetime value from confirmed quotes only", async () => {
    const c = await createClient(db, { ...blank, name: "Aggregate Co" });

    // A draft: counts as an event, contributes nothing to value.
    await quoteFor(c.id, "Aggregate Co", {
      event: { ...quoteInput("x").event, clientName: "Aggregate Co", eventDate: "2026-02-02" },
    });

    // A sent-but-unconfirmed quote: also contributes nothing.
    const sentId = await quoteFor(c.id, "Aggregate Co", {
      event: { ...quoteInput("x").event, clientName: "Aggregate Co", eventDate: "2026-03-03" },
    });
    await sendQuote(db, sentId, cat, settings);

    // A confirmed one: this is the money.
    const confirmedId = await quoteFor(c.id, "Aggregate Co", {
      event: { ...quoteInput("x").event, clientName: "Aggregate Co", eventDate: "2026-04-04" },
    });
    await sendQuote(db, confirmedId, cat, settings);
    await setQuoteStatus(db, confirmedId, "confirmed", { cat, settings });

    const row = (await listClients(db)).find((x) => x.id === c.id)!;
    expect(row.eventCount).toBe(3);
    expect(row.lastEventDate).toBe("2026-04-04");
    expect(row.lifetimeValue).toBeGreaterThan(0);

    const history = await loadClientHistory(db, c.id);
    const confirmed = history.find((h) => h.quoteId === confirmedId)!;
    expect(row.lifetimeValue).toBe(confirmed.total);
  });

  it("shows a client who has never booked with zeroes rather than omitting them", async () => {
    const c = await createClient(db, { ...blank, name: "Never Booked Co" });
    const row = (await listClients(db)).find((x) => x.id === c.id)!;
    expect(row.eventCount).toBe(0);
    expect(row.lastEventDate).toBeNull();
    expect(row.lifetimeValue).toBe(0);
  });

  it("carries the primary contact onto the row", async () => {
    const c = await createClient(db, { ...blank, name: "Listed Contact Co" });
    await addContact(db, c.id, {
      role: "booker",
      name: "Ada Lovelace",
      email: "ada@listed.example",
      phone: null,
      isPrimary: true,
    });
    const row = (await listClients(db)).find((x) => x.id === c.id)!;
    expect(row.primaryContactName).toBe("Ada Lovelace");
    expect(row.primaryContactEmail).toBe("ada@listed.example");
  });
});

/* findOrCreateClient runs inside createQuote's transaction. A failed INSERT
   aborts that transaction, so recovering with a SELECT afterwards cannot work —
   Postgres refuses every further command until the block ends.

   The trigger is not exotic. A name that normalises to nothing ("---", "!!!")
   can never be matched by sameClient, so the insert is always attempted, and
   the second such quote hits the unique index. */
describe("findOrCreateClient inside a transaction", () => {
  it("survives a name that normalises to nothing, twice", async () => {
    await db.transaction(async (tx: typeof db) => {
      await findOrCreateClient(tx, "---");
    });

    // The second one cannot match by name, so it attempts the insert again.
    const again = await db.transaction(async (tx: typeof db) => findOrCreateClient(tx, "---"));
    expect(again.name).toBe("---");
  });

  it("returns the winner when it loses a race, without aborting the caller", async () => {
    await createClient(db, { ...blank, name: "Raced Co" });

    const found = await db.transaction(async (tx: typeof db) => {
      // Simulates the loser of a race: the row is already there.
      return findOrCreateClient(tx, "Raced Co");
    });
    expect(found.name).toBe("Raced Co");

    // The transaction must still be usable afterwards.
    const after = await db.transaction(async (tx: typeof db) => {
      await findOrCreateClient(tx, "Raced Co");
      return findOrCreateClient(tx, "Another After Race");
    });
    expect(after.name).toBe("Another After Race");
  });
});

describe("the typeahead's own query", () => {
  it("counts events without needing quotes, snapshots or contacts", async () => {
    const c = await createClient(db, { ...blank, name: "Light Query Co", discountPct: 7 });
    await quoteFor(c.id, "Light Query Co");
    await quoteFor(c.id, "Light Query Co", {
      event: { ...quoteInput("x").event, clientName: "Light Query Co", eventDate: "2026-06-06" },
    });

    const row = (await listClientsForSearch(db)).find((x) => x.id === c.id)!;
    expect(row).toEqual({
      id: c.id,
      name: "Light Query Co",
      discountPct: 7,
      eventCount: 2,
    });
  });

  it("includes a client who has never booked", async () => {
    const c = await createClient(db, { ...blank, name: "Unbooked Search Co" });
    const row = (await listClientsForSearch(db)).find((x) => x.id === c.id)!;
    expect(row.eventCount).toBe(0);
  });
});

describe("countClientEvents", () => {
  it("counts events, not quotes", async () => {
    const c = await createClient(db, { ...blank, name: "Count Events Co" });
    expect(await countClientEvents(db, c.id)).toBe(0);

    await quoteFor(c.id, "Count Events Co");
    expect(await countClientEvents(db, c.id)).toBe(1);

    // A second quote on its own event is a second event.
    await quoteFor(c.id, "Count Events Co", {
      event: { ...quoteInput("x").event, clientName: "Count Events Co", eventDate: "2026-07-07" },
    });
    expect(await countClientEvents(db, c.id)).toBe(2);
  });
});
