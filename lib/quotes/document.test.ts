/* The client-facing document, end to end.
 *
 * Covers the thing that matters most about Phase 3: what the client is shown
 * comes from the snapshot once a quote is sent, and stops moving. Also
 * renders the real PDF, because a PDF that throws is a PDF nobody notices
 * until a client is waiting for it. */

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import * as s from "@/lib/db/schema";
import { loadCatalogue, loadSettings } from "@/lib/data/catalogue";
import { loadQuote, loadQuoteByToken } from "@/lib/data/quotes";
import { createQuote, sendQuote, setQuoteStatus } from "@/lib/data/quotes-write";
import { addDays, todayISO } from "@/lib/engine/format";
import type { Catalogue, Settings } from "@/lib/engine/types";
import { pdfFilename, renderQuotePdf } from "@/lib/pdf/render";
import { seedDatabase } from "@/lib/seed/run";
import { toCents } from "@/lib/seed/fixtures";
import { buildQuoteDocument } from "./document";
import type { QuoteWriteInput } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let cat: Catalogue;
let settings: Settings;
let signatureId: string;
let barId: string;

beforeAll(async () => {
  const client = new PGlite();
  db = drizzle(client, { casing: "snake_case" });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedDatabase(db);

  cat = await loadCatalogue(db);
  settings = await loadSettings(db);

  const packages = await db.select().from(s.packages);
  const addons = await db.select().from(s.addons);
  signatureId = packages.find((p: { slug: string }) => p.slug === "cocktail_signature").id;
  barId = addons.find((a: { slug: string }) => a.slug === "bar").id;
}, 120_000);

const input = (over: Partial<QuoteWriteInput> = {}): QuoteWriteInput => ({
  event: {
    clientId: null,
    clientName: "Harper & Co. Wedding",
    contactEmail: "harper@example.com",
    eventDate: "2026-11-14",
    guests: 80,
    style: "cocktail",
    durationHours: 5,
    venue: "Collingwood",
    dietary: ["vegan", "gf"],
    notes: null,
    ...over.event,
  },
  packageId: over.packageId ?? signatureId,
  pricePerHead: over.pricePerHead ?? toCents(82),
  discount: over.discount ?? 0,
  addonIds: over.addonIds ?? [barId],
  customLines: over.customLines ?? [],
});

const docFor = async (id: string) => {
  const quote = await loadQuote(db, id);
  return buildQuoteDocument({ quote: quote!, cat, settings });
};

describe("a draft quote", () => {
  it("shows the client everything the mockup's preview shows", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    const doc = await docFor(id);

    expect(doc.brand).toBe("Urban Entertaining");
    expect(doc.title).toBe("Quotation");
    expect(doc.clientName).toBe("Harper & Co. Wedding");
    expect(doc.guests).toBe(80);
    expect(doc.venue).toBe("Collingwood");
    expect(doc.packageName).toBe("Cocktail — Signature");

    expect(doc.lines.map((l) => l.label)).toEqual([
      "Cocktail — Signature — 80 guests",
      "Bar service",
      "Extended service (1h × 4 staff)",
    ]);

    expect(doc.includes).toEqual([
      "Wait staff (1 per 20 guests)",
      "Platters & service ware",
      "Setup and pack down",
    ]);
    expect(doc.menu).toHaveLength(6);
    expect(doc.dietary).toEqual(["Vegan", "Gluten free"]);
  });

  it("only shows a unit price when there is more than one of something", async () => {
    const { id } = await createQuote(
      db,
      input({ addonIds: [], customLines: [{ label: "Cake cutting", qty: 1, unitPrice: toCents(90) }] }),
      cat,
      settings,
      null,
    );
    const doc = await docFor(id);

    expect(doc.lines.find((l) => l.label === "Cake cutting")?.showUnit).toBe(false);
    expect(doc.lines[0]?.showUnit).toBe(true);
  });

  it("takes GST out of the total rather than adding it on", async () => {
    const { id } = await createQuote(db, input({ addonIds: [] }), cat, settings, null);
    const doc = await docFor(id);

    // $82 × 80 + 1h × 4 staff × $76.80
    expect(doc.total).toBe(toCents(80 * 82 + 4 * 76.8));
    expect(doc.gst).toBeCloseTo(doc.total / 11, 4);
  });

  it("states the deposit as an amount, not just a percentage", async () => {
    const { id } = await createQuote(db, input({ addonIds: [] }), cat, settings, null);
    const doc = await docFor(id);

    expect(doc.depositPct).toBe(30);
    expect(doc.depositAmount).toBe(Math.round(doc.total * 0.3));
    expect(doc.terms).toBe("Valid for 14 days. A 30% deposit confirms your date.");
  });

  it("dates validity from today while it is still a draft", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    const doc = await docFor(id);
    expect(doc.validUntil).toBe(addDays(todayISO(), 14));
  });

  it("shows a discount as its own line", async () => {
    const { id } = await createQuote(db, input({ discount: toCents(250) }), cat, settings, null);
    const doc = await docFor(id);
    expect(doc.discount).toBe(toCents(250));
  });

  it("keeps cost and margin out of the client's half of the document", async () => {
    const { id } = await createQuote(db, input({ pricePerHead: toCents(70) }), cat, settings, null);
    const doc = await docFor(id);

    // Present, but under `internal` — the view never renders these.
    expect(doc.internal.listPricePerHead).toBe(toCents(82));
    expect(doc.internal.pricePerHead).toBe(toCents(70));
    expect(doc.internal.margin).toBeGreaterThan(0);
    expect(JSON.stringify(doc.lines)).not.toContain("margin");
  });
});

describe("a sent quote", () => {
  it("renders from the snapshot and stops moving when prices do", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    await sendQuote(db, id, cat, settings);

    const before = await docFor(id);

    const ingredients = await db.select().from(s.ingredients);
    const salmon = ingredients.find((i: { slug: string }) => i.slug === "salmon");
    await db
      .update(s.ingredients)
      .set({ costPerUnit: toCents(120) })
      .where(eq(s.ingredients.id, salmon.id));

    const fresh = await loadCatalogue(db);
    const quote = await loadQuote(db, id);
    const after = buildQuoteDocument({ quote: quote!, cat: fresh, settings });

    expect(after.total).toBe(before.total);
    expect(after.internal.food).toBe(before.internal.food);
    expect(after.menu).toEqual(before.menu);

    await db
      .update(s.ingredients)
      .set({ costPerUnit: toCents(38) })
      .where(eq(s.ingredients.id, salmon.id));
  });

  it("dates validity from the day it was sent, not from today", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    await sendQuote(db, id, cat, settings);

    const quote = await loadQuote(db, id);
    const sentDay = quote!.sentAt!.toISOString().slice(0, 10);
    const doc = buildQuoteDocument({ quote: quote!, cat, settings });

    expect(doc.validUntil).toBe(addDays(sentDay, 14));
  });
});

describe("the public link", () => {
  it("finds a sent quote by its token", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    const { token } = await sendQuote(db, id, cat, settings);

    const found = await loadQuoteByToken(db, token);
    expect(found?.id).toBe(id);
    expect(found?.snapshot).not.toBeNull();
  });

  it("gives nothing away for an unknown, empty or wrong token", async () => {
    expect(await loadQuoteByToken(db, "")).toBeNull();
    expect(await loadQuoteByToken(db, "not-a-real-token")).toBeNull();
  });

  it("does not expose a draft — a draft has no token at all", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    const quote = await loadQuote(db, id);
    expect(quote!.publicToken).toBeNull();
  });

  it("stops resolving once the quote is cancelled", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    const { token } = await sendQuote(db, id, cat, settings);
    expect(await loadQuoteByToken(db, token)).not.toBeNull();

    await setQuoteStatus(db, id, "cancelled");
    expect(await loadQuoteByToken(db, token)).toBeNull();
  });

  it("keeps working after the client confirms", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    const { token } = await sendQuote(db, id, cat, settings);
    await setQuoteStatus(db, id, "confirmed");
    expect((await loadQuoteByToken(db, token))?.status).toBe("confirmed");
  });
});

describe("the PDF", () => {
  it("renders a real PDF", async () => {
    const { id } = await createQuote(db, input({ discount: toCents(250) }), cat, settings, null);
    const doc = await docFor(id);
    const buffer = await renderQuotePdf(doc);

    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(1_000);
  }, 60_000);

  it("survives a quote with no add-ons, no discount and no dietary notes", async () => {
    const { id } = await createQuote(
      db,
      input({
        event: { ...input().event, dietary: [], venue: null },
        addonIds: [],
        discount: 0,
      }),
      cat,
      settings,
      null,
    );
    const buffer = await renderQuotePdf(await docFor(id));
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  }, 60_000);

  it("names the file after the reference and the client", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    const doc = await docFor(id);
    // The ampersand is stripped; the reference always leads.
    expect(pdfFilename(doc)).toMatch(/^UE-\d+ Harper Co\. Wedding\.pdf$/);
  });
});
