/* Runs the real migration and the real seed against an in-process Postgres.
 *
 * This is not an E2E test — it is the only way to prove that 235 lines of
 * generated SQL are valid Postgres and that the seed actually loads, without
 * asking Josh for credentials. PGlite is a devDependency only; nothing in the
 * app imports it. */

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import * as s from "@/lib/db/schema";
import { loadCatalogue, loadSettings } from "@/lib/data/catalogue";
import { foodCostPerHead, recipeCostPerPortion, tierPrice } from "@/lib/engine/pricing";
import { ingredientRollup, rollupTotalCost } from "@/lib/engine/ordering";
import { toCents } from "./fixtures";
import { seedDatabase, type SeedReport } from "./run";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let report: SeedReport;

beforeAll(async () => {
  const client = new PGlite();
  db = drizzle(client, { casing: "snake_case" });
  await migrate(db, { migrationsFolder: "./drizzle" });
  report = await seedDatabase(db);
}, 120_000);

const bySlug = async <T extends { id: string; slug: string | null }>(rows: T[], slug: string) => {
  const row = rows.find((r) => r.slug === slug);
  if (!row) throw new Error(`no row with slug ${slug}`);
  return row;
};

describe("migration", () => {
  it("creates every table the app needs", async () => {
    const { rows } = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    const names = rows.map((r: { table_name: string }) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "addons",
        "app_users",
        "events",
        "ingredients",
        "menu_items",
        "order_lines",
        "orders",
        "package_items",
        "package_tiers",
        "packages",
        "quote_addons",
        "quote_lines",
        "quotes",
        "recipe_items",
        "recipes",
        "settings",
        "suppliers",
      ]),
    );
  });

  it("enforces the settings singleton", async () => {
    await expect(
      db.insert(s.settings).values({
        id: 2,
        staffHourlyCost: 1,
        staffHourlyCharge: 1,
        gstRate: "0.1000",
        quoteValidityDays: 1,
        depositPct: 1,
        quoteRefNext: 1,
      }),
    ).rejects.toThrow();
  });

  it("refuses a recipe line with a zero quantity", async () => {
    const [recipe] = await db.select().from(s.recipes).limit(1);
    const [ingredient] = await db.select().from(s.ingredients).limit(1);
    await expect(
      db
        .insert(s.recipeItems)
        .values({ recipeId: recipe.id, ingredientId: ingredient.id, qty: "0" }),
    ).rejects.toThrow();
  });

  it("refuses to delete an ingredient a recipe still uses", async () => {
    const ingredients = await db.select().from(s.ingredients);
    const beef = await bySlug(ingredients, "beef_eye");
    await expect(db.delete(s.ingredients).where(eq(s.ingredients.id, beef.id))).rejects.toThrow();
  });
});

describe("seed", () => {
  it("loads the whole placeholder catalogue", () => {
    expect(report).toEqual({
      suppliers: 6,
      ingredients: 20,
      recipes: 11,
      menuItems: 11,
      packages: 5,
      addons: 4,
      quotes: 3,
    });
  });

  it("links every ingredient to a supplier", async () => {
    const rows = await db.select().from(s.ingredients);
    expect(rows).toHaveLength(20);
    expect(rows.every((r: { supplierId: string | null }) => r.supplierId !== null)).toBe(true);
  });

  it("leaves supplier emails empty rather than inventing them", async () => {
    const rows = await db.select().from(s.suppliers);
    expect(rows.every((r: { contactEmail: string | null }) => r.contactEmail === null)).toBe(true);
  });

  it("writes the settings the mockup implies", async () => {
    const settings = await loadSettings(db);
    expect(settings).toEqual({
      staffHourlyCost: 4_800,
      staffHourlyCharge: 7_680,
      gstRate: 0.1,
      quoteValidityDays: 14,
      depositPct: 30,
    });
  });

  it("is idempotent — re-running changes no counts", async () => {
    const before = await counts();
    const second = await seedDatabase(db);
    const after = await counts();
    expect(after).toEqual(before);
    expect(second.quotes).toBe(0);
  });

  it("snapshots sent and confirmed quotes, but not drafts", async () => {
    const rows = await db.select().from(s.quotes);
    expect(rows).toHaveLength(3);
    for (const q of rows) {
      expect(q.snapshot, `${q.ref} should carry a snapshot`).not.toBeNull();
      expect(q.snapshot.version).toBe(1);
      expect(q.snapshot.package.name).toBeTruthy();
      expect(q.snapshot.menu.length).toBeGreaterThan(0);
    }
  });

  it("freezes ingredient costs into the snapshot", async () => {
    const [quote] = await db.select().from(s.quotes).where(eq(s.quotes.ref, "UE-1042"));
    const beef = quote.snapshot.menu
      .flatMap((m: { recipe: { items: { ingredientId: string; costPerUnit: number }[] } | null }) =>
        m.recipe ? m.recipe.items : [],
      )
      .find((i: { name: string }) => i.name === "Beef eye fillet");
    expect(beef.costPerUnit).toBe(toCents(62));
  });

  it("writes quote lines in the engine's order", async () => {
    const [quote] = await db.select().from(s.quotes).where(eq(s.quotes.ref, "UE-1042"));
    const lines = await db
      .select()
      .from(s.quoteLines)
      .where(eq(s.quoteLines.quoteId, quote.id))
      .orderBy(s.quoteLines.sort);

    expect(lines.map((l: { source: string }) => l.source)).toEqual(["package", "addon"]);
    expect(lines[0].label).toBe("Cocktail — Signature — 110 guests");
    expect(lines[0].unitPrice).toBe(toCents(82));
    expect(Number(lines[1].qty)).toBe(110);
  });
});

describe("catalogue round trip", () => {
  it("survives Postgres with its numbers intact", async () => {
    const cat = await loadCatalogue(db);
    const recipes = await db.select().from(s.recipes);
    const beefCrostini = await bySlug(recipes, "beef_crostini");

    const recipe = cat.recipes.get(beefCrostini.id);
    expect(recipe).toBeDefined();
    expect(recipeCostPerPortion(recipe!, cat)).toBeCloseTo(1.8005 * 100, 3);
  });

  it("costs packages the same as the mockup after a database round trip", async () => {
    const cat = await loadCatalogue(db);
    const packages = await db.select().from(s.packages);

    const expected: Record<string, number> = {
      cocktail_classic: 7.119417,
      cocktail_signature: 9.519083,
      grazing: 9.35,
      seated_three: 28.445667,
      corporate_lunch: 5.921667,
    };

    for (const [slug, dollars] of Object.entries(expected)) {
      const row = await bySlug(packages, slug);
      const pkg = cat.packages.get(row.id);
      expect(pkg, slug).toBeDefined();
      expect(foodCostPerHead(pkg!, cat), slug).toBeCloseTo(dollars * 100, 3);
    }
  });

  it("keeps tier prices in the right order", async () => {
    const cat = await loadCatalogue(db);
    const packages = await db.select().from(s.packages);
    const row = await bySlug(packages, "cocktail_classic");
    const pkg = cat.packages.get(row.id)!;

    expect(pkg.tiers.map((t) => t.upToGuests)).toEqual([60, 120, 250]);
    expect(tierPrice(pkg, 61)).toBe(toCents(62));
  });

  it("keeps package menu items in their intended order", async () => {
    const cat = await loadCatalogue(db);
    const packages = await db.select().from(s.packages);
    const row = await bySlug(packages, "seated_three");
    const pkg = cat.packages.get(row.id)!;

    expect(pkg.menuItemIds.map((id) => cat.menuItems.get(id)?.name)).toEqual([
      "Heirloom tomato, burrata, basil",
      "Eye fillet, kipfler, jus",
      "Roast salmon, heirloom tomato, salsa verde",
      "Dark chocolate tart, sea salt",
    ]);
  });
});

/* Phase 1 acceptance: changing an ingredient cost must move every derived
   number, everywhere, immediately — no cached copy anywhere. */
describe("a price change propagates", () => {
  it("moves recipe cost, package cost and the order total together", async () => {
    const ingredients = await db.select().from(s.ingredients);
    const beef = await bySlug(ingredients, "beef_eye");
    const packages = await db.select().from(s.packages);
    const seated = await bySlug(packages, "seated_three");

    const before = await loadCatalogue(db);
    const beforeCost = foodCostPerHead(before.packages.get(seated.id)!, before);
    const beforeRollup = ingredientRollup(
      [{ id: "q", ref: "UE-1046", guests: 60, packageId: seated.id }],
      before,
    );

    await db
      .update(s.ingredients)
      .set({ costPerUnit: toCents(124) }) // double it
      .where(eq(s.ingredients.id, beef.id));

    const after = await loadCatalogue(db);
    const afterCost = foodCostPerHead(after.packages.get(seated.id)!, after);
    const afterRollup = ingredientRollup(
      [{ id: "q", ref: "UE-1046", guests: 60, packageId: seated.id }],
      after,
    );

    // beef_main is $14.21/portion, of which beef is $12.40. Doubling beef
    // adds $12.40 per head to a package that serves one main per guest.
    expect(afterCost - beforeCost).toBeCloseTo(toCents(12.4), 3);
    expect(rollupTotalCost(afterRollup.lines)).toBeGreaterThan(
      rollupTotalCost(beforeRollup.lines),
    );

    // A sent quote's snapshot must NOT move.
    const [quote] = await db.select().from(s.quotes).where(eq(s.quotes.ref, "UE-1042"));
    const snapshotBeef = quote.snapshot.menu
      .flatMap((m: { recipe: { items: { name: string; costPerUnit: number }[] } | null }) =>
        m.recipe ? m.recipe.items : [],
      )
      .find((i: { name: string }) => i.name === "Beef eye fillet");
    expect(snapshotBeef.costPerUnit).toBe(toCents(62));

    // put it back
    await db
      .update(s.ingredients)
      .set({ costPerUnit: toCents(62) })
      .where(eq(s.ingredients.id, beef.id));
  });
});

async function counts() {
  const tables = [s.suppliers, s.ingredients, s.recipes, s.menuItems, s.packages, s.addons, s.quotes];
  const out: number[] = [];
  for (const t of tables) {
    const [row] = await db.select({ c: sql<number>`count(*)::int` }).from(t);
    out.push(row.c);
  }
  return out;
}
