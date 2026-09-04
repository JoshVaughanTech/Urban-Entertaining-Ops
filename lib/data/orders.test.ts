/* Ordering, against a real Postgres.
 *
 * The headline acceptance criterion lives here: the rollup for the seed's two
 * confirmed September events has to match the approved mockup exactly, all
 * the way through the database rather than just in the engine. */

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import * as s from "@/lib/db/schema";
import {
  buildOrdering,
  loadOrderState,
  markOrderPlaced,
  setLineOrdered,
  syncOrder,
} from "@/lib/data/orders";
import { supplierCsv } from "@/lib/orders/csv";
import { seedDatabase } from "@/lib/seed/run";
import { toCents } from "@/lib/seed/fixtures";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;

/** The window the mockup defaults to, covering both confirmed events. */
const FROM = "2026-09-07";
const TO = "2026-09-20";

beforeAll(async () => {
  const client = new PGlite();
  db = drizzle(client, { casing: "snake_case" });
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seedDatabase(db);
}, 120_000);

describe("the rollup for the seeded September events", () => {
  it("picks up the two confirmed events and ignores the sent one", async () => {
    const view = await buildOrdering(db, FROM, TO);

    expect(view.quotes.map((q) => q.ref).sort()).toEqual(["UE-1042", "UE-1046"]);
    // UE-1049 is sent, not confirmed — nothing gets ordered for it.
    expect(view.quotes.map((q) => q.ref)).not.toContain("UE-1049");
  });

  it("matches the mockup exactly", async () => {
    const view = await buildOrdering(db, FROM, TO);

    expect(view.lines).toHaveLength(17);
    expect(view.totalCost).toBeCloseTo(toCents(3_246.2), 2);
    expect(view.warnings).toEqual([]);

    const expected: Record<string, { packs: number; order: number; cost: number }> = {
      "Beef eye fillet": { packs: 7, order: 17.5, cost: 1_085 },
      "Triple cream brie": { packs: 5, order: 5, cost: 210 },
      "Cultured butter": { packs: 1, order: 5, cost: 75 },
      "Free-range chicken thigh": { packs: 2, order: 10, cost: 145 },
      "70% dark chocolate": { packs: 2, order: 5, cost: 120 },
      "Thickened cream": { packs: 4, order: 8, cost: 43.2 },
      "Free-range eggs": { packs: 1, order: 15, cost: 102 },
      "Fresh figs": { packs: 2, order: 4, cost: 72 },
      "Heirloom tomatoes": { packs: 5, order: 20, cost: 240 },
      Lemons: { packs: 1, order: 5, cost: 24 },
      "Kipfler potatoes": { packs: 2, order: 20, cost: 104 },
      "Tiger prawns (16/20)": { packs: 5, order: 5, cost: 170 },
      "Prosciutto di Parma": { packs: 1, order: 1, cost: 58 },
      "Butter puff pastry": { packs: 5, order: 7.5, cost: 82.5 },
      "Wild rocket": { packs: 3, order: 3, cost: 48 },
      "Atlantic salmon fillet": { packs: 5, order: 15, cost: 570 },
      "Sourdough loaf": { packs: 15, order: 15, cost: 97.5 },
    };

    for (const [name, want] of Object.entries(expected)) {
      const line = view.lines.find((l) => l.ingredientName === name);
      expect(line, `no rollup line for ${name}`).toBeDefined();
      expect(line!.packs, name).toBe(want.packs);
      expect(line!.orderQty, name).toBeCloseTo(want.order, 5);
      expect(line!.cost, name).toBeCloseTo(toCents(want.cost), 2);
    }
  });

  it("groups into the six seeded suppliers, none of which has an email", async () => {
    const view = await buildOrdering(db, FROM, TO);

    expect(view.groups.map((g) => g.supplierName)).toEqual([
      "Bidfood",
      "Calendar Cheese",
      "Damian Pike",
      "Meatsmith",
      "Ocean Made",
      "Tivoli Road",
    ]);
    expect(view.groups.every((g) => g.contactEmail === null)).toBe(true);
    expect(view.groups.reduce((sum, g) => sum + g.cost, 0)).toBeCloseTo(view.totalCost, 2);
  });

  it("says which quotes each line is for", async () => {
    const view = await buildOrdering(db, FROM, TO);
    const beef = view.lines.find((l) => l.ingredientName === "Beef eye fillet");
    expect(beef!.quoteRefs.sort()).toEqual(["UE-1042", "UE-1046"]);

    const prawns = view.lines.find((l) => l.ingredientName === "Tiger prawns (16/20)");
    expect(prawns!.quoteRefs).toEqual(["UE-1042"]);
  });

  it("is empty for a window with no confirmed events", async () => {
    const view = await buildOrdering(db, "2027-01-01", "2027-01-31");
    expect(view.lines).toEqual([]);
    expect(view.groups).toEqual([]);
    expect(view.totalCost).toBe(0);
  });
});

describe("the order record", () => {
  it("does not exist until something is ticked", async () => {
    const state = await loadOrderState(db, "2026-10-01", "2026-10-14");
    expect(state.id).toBeNull();
    expect(state.ordered).toEqual({});
  });

  it("opens once, and re-syncing finds the same order", async () => {
    const view = await buildOrdering(db, FROM, TO);
    const first = await syncOrder(db, FROM, TO, view.lines, null);
    const second = await syncOrder(db, FROM, TO, view.lines, null);

    expect(second).toBe(first);

    const orders = await db.select().from(s.orders).where(eq(s.orders.windowFrom, FROM));
    expect(orders).toHaveLength(1);
  });

  it("stores a line per ingredient with the live cost", async () => {
    const view = await buildOrdering(db, FROM, TO);
    const orderId = await syncOrder(db, FROM, TO, view.lines, null);

    const lines = await db.select().from(s.orderLines).where(eq(s.orderLines.orderId, orderId));
    expect(lines).toHaveLength(17);

    const beef = view.lines.find((l) => l.ingredientName === "Beef eye fillet")!;
    const stored = lines.find((l: { ingredientId: string }) => l.ingredientId === beef.ingredientId);
    expect(stored.packs).toBe(7);
    expect(stored.unitCost).toBe(toCents(62));
    expect(stored.quoteIds).toHaveLength(2);
  });

  it("keeps a tick when the rollup is re-synced", async () => {
    const view = await buildOrdering(db, FROM, TO);
    const orderId = await syncOrder(db, FROM, TO, view.lines, null);
    const beef = view.lines.find((l) => l.ingredientName === "Beef eye fillet")!;

    await setLineOrdered(db, orderId, beef.ingredientId, true);
    await syncOrder(db, FROM, TO, view.lines, null);

    const state = await loadOrderState(db, FROM, TO);
    expect(state.ordered[beef.ingredientId]).toBe(true);
  });

  it("can untick", async () => {
    const view = await buildOrdering(db, FROM, TO);
    const orderId = await syncOrder(db, FROM, TO, view.lines, null);
    const salmon = view.lines.find((l) => l.ingredientName === "Atlantic salmon fillet")!;

    await setLineOrdered(db, orderId, salmon.ingredientId, true);
    await setLineOrdered(db, orderId, salmon.ingredientId, false);

    const state = await loadOrderState(db, FROM, TO);
    expect(state.ordered[salmon.ingredientId]).toBe(false);
  });

  it("drops lines that have left the window", async () => {
    const view = await buildOrdering(db, FROM, TO);
    const orderId = await syncOrder(db, FROM, TO, view.lines, null);

    const trimmed = view.lines.slice(0, 3);
    await syncOrder(db, FROM, TO, trimmed, null);

    const lines = await db.select().from(s.orderLines).where(eq(s.orderLines.orderId, orderId));
    expect(lines).toHaveLength(3);
  });

  it("refuses to tick a line that is not on the order", async () => {
    const view = await buildOrdering(db, FROM, TO);
    const orderId = await syncOrder(db, FROM, TO, view.lines, null);

    await expect(
      setLineOrdered(db, orderId, "00000000-0000-0000-0000-000000000000", true),
    ).rejects.toThrow(/no longer part of this order/);
  });

  it("records that the orders went out", async () => {
    const view = await buildOrdering(db, FROM, TO);
    const orderId = await syncOrder(db, FROM, TO, view.lines, null);

    expect((await loadOrderState(db, FROM, TO)).status).toBe("draft");
    await markOrderPlaced(db, orderId);
    expect((await loadOrderState(db, FROM, TO)).status).toBe("placed");
  });
});

describe("a supplier with no contact email", () => {
  it("is surfaced in the groups rather than dropped", async () => {
    const view = await buildOrdering(db, FROM, TO);
    const missing = view.groups.filter((g) => !g.contactEmail);

    // All six seeded suppliers, because none has an email yet.
    expect(missing).toHaveLength(6);
    // Their lines are still in the rollup and still cost money.
    expect(missing.reduce((sum, g) => sum + g.lines.length, 0)).toBe(17);
    expect(missing.reduce((sum, g) => sum + g.cost, 0)).toBeCloseTo(view.totalCost, 2);
  });

  it("still produces a CSV that can be sent by hand", async () => {
    const view = await buildOrdering(db, FROM, TO);
    const meatsmith = view.groups.find((g) => g.supplierName === "Meatsmith")!;

    const csv = supplierCsv(meatsmith, {
      windowFrom: FROM,
      windowTo: TO,
      business: "Urban Entertaining",
    });

    expect(csv).toContain("Meatsmith");
    expect(csv).toContain("Beef eye fillet");
    expect(csv).toContain("Free-range chicken thigh");
  });
});

/* Phase 4 acceptance: the rollup follows the events, not a stored copy. */
describe("changing a confirmed quote's guest count", () => {
  it("changes what has to be ordered", async () => {
    const before = await buildOrdering(db, FROM, TO);

    const [quote] = await db.select().from(s.quotes).where(eq(s.quotes.ref, "UE-1042"));
    await db.update(s.events).set({ guests: 220 }).where(eq(s.events.id, quote.eventId));

    const after = await buildOrdering(db, FROM, TO);

    expect(after.totalCost).toBeGreaterThan(before.totalCost);

    const prawnsBefore = before.lines.find((l) => l.ingredientName === "Tiger prawns (16/20)")!;
    const prawnsAfter = after.lines.find((l) => l.ingredientName === "Tiger prawns (16/20)")!;
    expect(prawnsAfter.neededQty).toBeCloseTo(prawnsBefore.neededQty * 2, 5);

    await db.update(s.events).set({ guests: 110 }).where(eq(s.events.id, quote.eventId));
  });

  it("also follows a change in ingredient cost, unlike a sent quote", async () => {
    const before = await buildOrdering(db, FROM, TO);

    const [beef] = await db.select().from(s.ingredients).where(eq(s.ingredients.slug, "beef_eye"));
    await db
      .update(s.ingredients)
      .set({ costPerUnit: toCents(124) })
      .where(eq(s.ingredients.id, beef.id));

    const after = await buildOrdering(db, FROM, TO);
    const line = after.lines.find((l) => l.ingredientName === "Beef eye fillet")!;

    // Ordering uses live costs by design — the snapshot is for the price, not
    // the shopping.
    expect(line.cost).toBeCloseTo(toCents(17.5 * 124), 2);
    expect(after.totalCost).toBeGreaterThan(before.totalCost);

    await db
      .update(s.ingredients)
      .set({ costPerUnit: toCents(62) })
      .where(eq(s.ingredients.id, beef.id));
  });
});
