/* Drives the whole quote lifecycle against an in-process Postgres.
 *
 * The server actions are thin auth-and-validate wrappers over these
 * functions, so this is where the behaviour that matters gets proven:
 * sequential refs, derived lines, draft-only editing, and a snapshot that
 * does not move once the client has been told a price. */

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import * as s from "@/lib/db/schema";
import { loadCatalogue, loadSettings } from "@/lib/data/catalogue";
import { loadConfirmedInWindow, loadQuote, loadQuoteList, totalsFor } from "@/lib/data/quotes";
import {
  QuoteError,
  createQuote,
  deleteDraft,
  sendQuote,
  setQuoteStatus,
  updateQuote,
} from "@/lib/data/quotes-write";
import { ingredientRollup, rollupTotalCost } from "@/lib/engine/ordering";
import type { Catalogue, Settings } from "@/lib/engine/types";
import { seedDatabase } from "@/lib/seed/run";
import { toCents } from "@/lib/seed/fixtures";
import type { QuoteWriteInput } from "@/lib/quotes/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let cat: Catalogue;
let settings: Settings;
let signaturePackageId: string;
let grazingPackageId: string;
let barAddonId: string;

beforeAll(async () => {
  const client = new PGlite();
  db = drizzle(client, { casing: "snake_case" });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedDatabase(db);

  cat = await loadCatalogue(db);
  settings = await loadSettings(db);

  const packages = await db.select().from(s.packages);
  const addons = await db.select().from(s.addons);

  signaturePackageId = packages.find((p: { slug: string }) => p.slug === "cocktail_signature").id;
  grazingPackageId = packages.find((p: { slug: string }) => p.slug === "grazing").id;
  barAddonId = addons.find((a: { slug: string }) => a.slug === "bar").id;
}, 120_000);

const input = (over: Partial<QuoteWriteInput> = {}): QuoteWriteInput => ({
  event: {
    clientName: "Test Client",
    contactEmail: null,
    eventDate: "2026-11-14",
    guests: 80,
    style: "cocktail",
    durationHours: 5,
    venue: "Fitzroy",
    dietary: [],
    notes: null,
    ...over.event,
  },
  packageId: over.packageId ?? signaturePackageId,
  pricePerHead: over.pricePerHead ?? toCents(82),
  discount: over.discount ?? 0,
  addonIds: over.addonIds ?? [],
  customLines: over.customLines ?? [],
});

describe("creating a quote", () => {
  it("takes the next reference from settings, in order", async () => {
    const first = await createQuote(db, input(), cat, settings, null);
    const second = await createQuote(db, input(), cat, settings, null);

    // The seed leaves the counter at 1050.
    expect(first.ref).toBe("UE-1050");
    expect(second.ref).toBe("UE-1051");
  });

  it("derives lines rather than trusting what was typed", async () => {
    const { id } = await createQuote(
      db,
      input({ addonIds: [barAddonId] }),
      cat,
      settings,
      null,
    );

    const quote = await loadQuote(db, id);
    expect(quote).not.toBeNull();
    expect(quote!.lines.map((l) => l.source)).toEqual([
      "package",
      "addon",
      "extended_service",
    ]);

    // 80 guests at $82, bar at $18/head, 1 extra hour × 4 staff at $76.80.
    expect(quote!.lines[0]).toMatchObject({ qty: 80, unitPrice: toCents(82) });
    expect(quote!.lines[1]).toMatchObject({ qty: 80, unitPrice: toCents(18) });
    expect(quote!.lines[2]).toMatchObject({ qty: 4, unitPrice: toCents(76.8) });
  });

  it("starts as a draft with no snapshot", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    const quote = await loadQuote(db, id);
    expect(quote!.status).toBe("draft");
    expect(quote!.snapshot).toBeNull();
    expect(quote!.publicToken).toBeNull();
  });

  it("refuses a package that no longer exists", async () => {
    await expect(
      createQuote(
        db,
        input({ packageId: "00000000-0000-0000-0000-000000000000" }),
        cat,
        settings,
        null,
      ),
    ).rejects.toThrow(QuoteError);
  });

  it("records a custom line as uncosted", async () => {
    const { id } = await createQuote(
      db,
      input({ customLines: [{ label: "Late-night pizza", qty: 1, unitPrice: toCents(400) }] }),
      cat,
      settings,
      null,
    );

    const quote = await loadQuote(db, id);
    const custom = quote!.lines.find((l) => l.source === "custom");
    expect(custom).toMatchObject({ label: "Late-night pizza", qty: 1, unitPrice: toCents(400) });

    const totals = totalsFor(quote!, cat, settings);
    expect(totals.hasUncostedLines).toBe(true);
  });
});

describe("editing", () => {
  it("re-derives the lines when the guest count changes", async () => {
    const { id } = await createQuote(db, input({ addonIds: [barAddonId] }), cat, settings, null);

    await updateQuote(
      db,
      id,
      input({ event: { ...input().event, guests: 120 }, addonIds: [barAddonId] }),
      cat,
      settings,
    );

    const quote = await loadQuote(db, id);
    expect(quote!.event.guests).toBe(120);
    expect(quote!.lines[0]!.qty).toBe(120);
    expect(quote!.lines[1]!.qty).toBe(120);
    // 120 guests at 1 per 20 is 6 staff, so extended service doubles.
    expect(quote!.lines[2]!.qty).toBe(6);
  });

  it("drops an add-on that was unticked", async () => {
    const { id } = await createQuote(db, input({ addonIds: [barAddonId] }), cat, settings, null);
    await updateQuote(db, id, input({ addonIds: [] }), cat, settings);

    const quote = await loadQuote(db, id);
    expect(quote!.addonIds).toEqual([]);
    expect(quote!.lines.some((l) => l.source === "addon")).toBe(false);
  });

  it("refuses to edit a quote that has been sent", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    await sendQuote(db, id, cat, settings);

    await expect(updateQuote(db, id, input({ discount: toCents(100) }), cat, settings)).rejects.toThrow(
      /already been sent/,
    );
  });
});

describe("sending", () => {
  it("freezes a snapshot and hands out a public token", async () => {
    const { id } = await createQuote(db, input({ addonIds: [barAddonId] }), cat, settings, null);
    const { token } = await sendQuote(db, id, cat, settings);

    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const quote = await loadQuote(db, id);
    expect(quote!.status).toBe("sent");
    expect(quote!.sentAt).toBeInstanceOf(Date);
    expect(quote!.snapshot).not.toBeNull();
    expect(quote!.snapshot!.version).toBe(1);
    expect(quote!.snapshot!.package.name).toBe("Cocktail — Signature");
    expect(quote!.snapshot!.menu).toHaveLength(6);
    expect(quote!.snapshot!.totals.total).toBe(
      toCents(80 * 82 + 80 * 18 + 4 * 76.8),
    );
  });

  it("records the list price alongside an override", async () => {
    const { id } = await createQuote(db, input({ pricePerHead: toCents(70) }), cat, settings, null);
    await sendQuote(db, id, cat, settings);

    const quote = await loadQuote(db, id);
    // The tier price for 80 guests is $82; staff quoted $70.
    expect(quote!.snapshot!.package.listPricePerHead).toBe(toCents(82));
    expect(quote!.pricePerHead).toBe(toCents(70));
  });

  it("will not send the same quote twice", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    await sendQuote(db, id, cat, settings);
    await expect(sendQuote(db, id, cat, settings)).rejects.toThrow(/already been sent/);
  });
});

describe("status", () => {
  it("moves sent to confirmed and stamps the time", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    await sendQuote(db, id, cat, settings);
    await setQuoteStatus(db, id, "confirmed");

    const quote = await loadQuote(db, id);
    expect(quote!.status).toBe("confirmed");
    expect(quote!.confirmedAt).toBeInstanceOf(Date);
  });

  /* The mockup offers "Mark confirmed" on anything not already confirmed,
     including a draft — staff confirm over the phone before sending. */
  it("confirms a draft directly, as the mockup does", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    await setQuoteStatus(db, id, "confirmed", { cat, settings });

    const quote = await loadQuote(db, id);
    expect(quote!.status).toBe("confirmed");
    expect(quote!.confirmedAt).toBeInstanceOf(Date);
  });

  it("freezes a snapshot when a draft is confirmed without ever being sent", async () => {
    const { id } = await createQuote(db, input({ addonIds: [barAddonId] }), cat, settings, null);
    expect((await loadQuote(db, id))!.snapshot).toBeNull();

    await setQuoteStatus(db, id, "confirmed", { cat, settings });

    const quote = await loadQuote(db, id);
    expect(quote!.snapshot, "a confirmed quote must render from a snapshot").not.toBeNull();
    expect(quote!.snapshot!.totals.total).toBe(toCents(80 * 82 + 80 * 18 + 4 * 76.8));
    // Never sent, so no client link was ever issued.
    expect(quote!.publicToken).toBeNull();
    expect(quote!.sentAt).toBeNull();
  });

  it("leaves an existing snapshot alone when confirming a sent quote", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    await sendQuote(db, id, cat, settings);
    const before = (await loadQuote(db, id))!.snapshot;

    await setQuoteStatus(db, id, "confirmed", { cat, settings });

    expect((await loadQuote(db, id))!.snapshot).toEqual(before);
  });

  it("can recover a quote cancelled by mistake", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    await setQuoteStatus(db, id, "cancelled");
    await setQuoteStatus(db, id, "confirmed", { cat, settings });
    expect((await loadQuote(db, id))!.status).toBe("confirmed");
  });

  it("refuses to decline a quote that was already confirmed", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    await sendQuote(db, id, cat, settings);
    await setQuoteStatus(db, id, "confirmed");
    await expect(setQuoteStatus(db, id, "declined")).rejects.toThrow(/cannot be marked declined/);
  });

  it("keeps the confirmation date when a confirmed quote is later cancelled", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    await setQuoteStatus(db, id, "confirmed", { cat, settings });
    const confirmedAt = (await loadQuote(db, id))!.confirmedAt;

    await setQuoteStatus(db, id, "cancelled");

    const after = await loadQuote(db, id);
    expect(after!.status).toBe("cancelled");
    expect(after!.confirmedAt).toEqual(confirmedAt);
  });

  it("lets anything be cancelled", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    await setQuoteStatus(db, id, "cancelled");
    expect((await loadQuote(db, id))!.status).toBe("cancelled");
  });
});

describe("deleting", () => {
  it("removes a draft and the event behind it", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    const [row] = await db
      .select({ eventId: s.quotes.eventId })
      .from(s.quotes)
      .where(eq(s.quotes.id, id))
      .limit(1);

    await deleteDraft(db, id);

    expect(await loadQuote(db, id)).toBeNull();
    const orphans = await db.select().from(s.events).where(eq(s.events.id, row.eventId));
    expect(orphans).toEqual([]);
  });

  it("refuses to delete a sent quote", async () => {
    const { id } = await createQuote(db, input(), cat, settings, null);
    await sendQuote(db, id, cat, settings);
    await expect(deleteDraft(db, id)).rejects.toThrow(/Only a draft/);
  });
});

describe("the list", () => {
  it("totals each quote from its own stored lines", async () => {
    const { id } = await createQuote(
      db,
      input({ addonIds: [barAddonId], discount: toCents(250) }),
      cat,
      settings,
      null,
    );

    const rows = await loadQuoteList(db);
    const row = rows.find((r) => r.id === id);

    expect(row).toBeDefined();
    expect(row!.total).toBe(toCents(80 * 82 + 80 * 18 + 4 * 76.8 - 250));
    expect(row!.packageName).toBe("Cocktail — Signature");
    expect(row!.clientName).toBe("Test Client");
  });

  it("includes the three seeded quotes", async () => {
    const rows = await loadQuoteList(db);
    const refs = rows.map((r) => r.ref);
    expect(refs).toEqual(expect.arrayContaining(["UE-1042", "UE-1046", "UE-1049"]));
  });
});

/* The behaviour the whole snapshot design exists for. */
describe("a price rise after sending", () => {
  it("leaves a sent quote alone but re-costs a draft", async () => {
    const draft = await createQuote(db, input({ packageId: grazingPackageId }), cat, settings, null);
    const sent = await createQuote(db, input({ packageId: grazingPackageId }), cat, settings, null);
    await sendQuote(db, sent.id, cat, settings);

    const sentBefore = await loadQuote(db, sent.id);
    const foodBefore = sentBefore!.snapshot!.totals.food;

    const ingredients = await db.select().from(s.ingredients);
    const brie = ingredients.find((i: { slug: string }) => i.slug === "brie");
    await db
      .update(s.ingredients)
      .set({ costPerUnit: toCents(84) }) // double it
      .where(eq(s.ingredients.id, brie.id));

    const fresh = await loadCatalogue(db);

    const sentAfter = await loadQuote(db, sent.id);
    expect(totalsFor(sentAfter!, fresh, settings).food).toBe(foodBefore);

    const draftAfter = await loadQuote(db, draft.id);
    expect(totalsFor(draftAfter!, fresh, settings).food).toBeGreaterThan(foodBefore);

    await db
      .update(s.ingredients)
      .set({ costPerUnit: toCents(42) })
      .where(eq(s.ingredients.id, brie.id));
  });
});

/* Groundwork for Phase 4 — ordering reads confirmed quotes, live costs. */
describe("confirmed quotes feed ordering", () => {
  it("appears in the window once confirmed, and moves the rollup when guests change", async () => {
    const { id } = await createQuote(
      db,
      input({
        event: { ...input().event, clientName: "Ordering Test", eventDate: "2026-12-05", guests: 60 },
        packageId: grazingPackageId,
      }),
      cat,
      settings,
      null,
    );

    const before = await loadConfirmedInWindow(db, "2026-12-01", "2026-12-31");
    expect(before.some((q) => q.id === id)).toBe(false);

    await sendQuote(db, id, cat, settings);
    await setQuoteStatus(db, id, "confirmed");

    const after = await loadConfirmedInWindow(db, "2026-12-01", "2026-12-31");
    const row = after.find((q) => q.id === id);
    expect(row).toMatchObject({ guests: 60, clientName: "Ordering Test" });

    const fresh = await loadCatalogue(db);
    const smallRollup = ingredientRollup([{ ...row!, ref: row!.ref }], fresh);

    await db.update(s.events).set({ guests: 150 }).where(
      eq(
        s.events.id,
        (await db.select().from(s.quotes).where(eq(s.quotes.id, id)).limit(1))[0].eventId,
      ),
    );

    const bigger = await loadConfirmedInWindow(db, "2026-12-01", "2026-12-31");
    const biggerRow = bigger.find((q) => q.id === id)!;
    const bigRollup = ingredientRollup([biggerRow], fresh);

    expect(biggerRow.guests).toBe(150);
    expect(rollupTotalCost(bigRollup.lines)).toBeGreaterThan(rollupTotalCost(smallRollup.lines));
  });

  it("ignores quotes outside the window", async () => {
    const rows = await loadConfirmedInWindow(db, "2026-09-07", "2026-09-20");
    // The two seeded September events, and nothing from December.
    expect(rows.map((r) => r.ref).sort()).toEqual(["UE-1042", "UE-1046"]);
  });
});
