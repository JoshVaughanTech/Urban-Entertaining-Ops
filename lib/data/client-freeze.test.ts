/* The invariant the client database is most likely to break.
 *
 * A quote freezes. Once it is sent, everything the client can see renders from
 * its snapshot — and now that clients are a table, there is a standing
 * temptation to join through it for the name, the contact or the discount.
 * Doing that would mean editing a client silently rewrites quotes they are
 * already holding.
 *
 * These tests pass today, because the document reads events.client_name and
 * the frozen snapshot rather than the clients table. That is the point: they
 * exist to fail the moment someone "tidies" that into a join.
 *
 * The document is what the preview, the public link and the PDF all render
 * from — document.test.ts proves that — so asserting on the document covers
 * all three. The PDF's own bytes carry a creation date and so are never
 * identical between two renders.
 */

import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import * as s from "@/lib/db/schema";
import { loadCatalogue, loadSettings } from "@/lib/data/catalogue";
import { loadQuote, loadQuoteByToken } from "@/lib/data/quotes";
import { createQuote, sendQuote } from "@/lib/data/quotes-write";
import { buildQuoteDocument } from "@/lib/quotes/document";
import type { QuoteWriteInput } from "@/lib/quotes/types";
import type { Catalogue, Settings } from "@/lib/engine/types";
import { toCents } from "@/lib/seed/fixtures";
import { seedDatabase } from "@/lib/seed/run";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let cat: Catalogue;
let settings: Settings;
let packageId: string;

const ORIGINAL_EMAIL = "bookings@harper.example";

/* Names are unique case-insensitively, so each case needs its own client. The
   event is created under the same name, which is what makes renaming the
   client afterwards a real divergence rather than a coincidence. */
let seq = 0;

beforeAll(async () => {
  db = drizzle(new PGlite(), { casing: "snake_case" });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedDatabase(db);

  cat = await loadCatalogue(db);
  settings = await loadSettings(db);
  const packages = await db.select().from(s.packages);
  packageId = packages.find((p: { slug: string }) => p.slug === "cocktail_signature").id;
}, 120_000);

const input = (clientName: string): QuoteWriteInput => ({
  event: {
    clientName,
    contactEmail: ORIGINAL_EMAIL,
    eventDate: "2026-11-14",
    guests: 80,
    style: "cocktail",
    durationHours: 4,
    venue: "Collingwood",
    dietary: [],
    notes: null,
  },
  packageId,
  pricePerHead: toCents(82),
  discount: toCents(200),
  addonIds: [],
  customLines: [],
});

/** A sent quote, with a client row behind it as the app will create one. */
async function sentQuoteWithClient() {
  seq += 1;
  const name = `Harper & Co. ${seq}`;

  const { rows } = await db.execute(sql`
    insert into clients (name, discount_pct, preferences, staff_notes)
    values (${name}, 10, 'No shellfish', 'Always requests Maria')
    returning id
  `);
  const clientId = (rows[0] as { id: string }).id;

  const { id } = await createQuote(db, input(name), cat, settings, null);
  await db.execute(sql`
    update events set client_id = ${clientId}
    where id = (select event_id from quotes where id = ${id})
  `);
  const { token } = await sendQuote(db, id, cat, settings);

  return { clientId, quoteId: id, token, name };
}

const docFor = async (id: string) => {
  const quote = await loadQuote(db, id);
  return buildQuoteDocument({ quote: quote!, cat, settings });
};

describe("a sent quote does not move when its client changes", () => {
  it("keeps its name, contact, totals and every line", async () => {
    const { clientId, quoteId, name } = await sentQuoteWithClient();
    const before = await docFor(quoteId);
    expect(before.clientName).toBe(name);

    await db.execute(sql`
      update clients
      set name = 'Harper Group Pty Ltd',
          discount_pct = 40,
          preferences = 'Rewritten entirely',
          staff_notes = 'Different staff now'
      where id = ${clientId}
    `);
    await db.execute(sql`
      insert into client_contacts (client_id, role, name, email, is_primary)
      values (${clientId}, 'booker', 'Someone Else', 'someone.else@harper.example', true)
    `);

    const after = await docFor(quoteId);
    expect(after).toEqual(before);
    // The client is now "Harper Group Pty Ltd"; the quote still says otherwise.
    expect(after.clientName).toBe(name);
  });

  it("keeps the same document on the public link the client actually opens", async () => {
    const { clientId, token } = await sentQuoteWithClient();
    const quoteBefore = await loadQuoteByToken(db, token);
    const before = buildQuoteDocument({ quote: quoteBefore!, cat, settings });

    await db.execute(sql`update clients set name = 'Renamed Again', discount_pct = 0 where id = ${clientId}`);

    const quoteAfter = await loadQuoteByToken(db, token);
    const after = buildQuoteDocument({ quote: quoteAfter!, cat, settings });
    expect(after).toEqual(before);
  });

  it("does not let a changed client discount reprice a sent quote", async () => {
    const { clientId, quoteId } = await sentQuoteWithClient();
    const before = await docFor(quoteId);

    // The client's standing discount is only ever a pre-fill for a new quote.
    await db.execute(sql`update clients set discount_pct = 95 where id = ${clientId}`);

    const after = await docFor(quoteId);
    expect(after.total).toBe(before.total);
    expect(after.discount).toBe(before.discount);
  });

  it("never carries the internal notes into the client's copy", async () => {
    const { quoteId } = await sentQuoteWithClient();
    const doc = await docFor(quoteId);

    const serialised = JSON.stringify(doc);
    expect(serialised).not.toContain("No shellfish");
    expect(serialised).not.toContain("Always requests Maria");
  });

  it("survives the client being unlinked entirely", async () => {
    const { quoteId } = await sentQuoteWithClient();
    const before = await docFor(quoteId);

    // events.client_id is nullable, so this is a state the app must tolerate.
    await db.execute(sql`
      update events set client_id = null
      where id = (select event_id from quotes where id = ${quoteId})
    `);

    const after = await docFor(quoteId);
    expect(after).toEqual(before);
  });
});
