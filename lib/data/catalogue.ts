/* The boundary between the database and the engine.
 *
 * Drizzle returns numeric columns as strings (to avoid float surprises in
 * transit); this is the one place that parses them. Past here, the engine
 * deals in plain numbers and integer cents and knows nothing about Postgres. */

import { asc, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

import * as s from "@/lib/db/schema";
import { buildCatalogue } from "@/lib/engine/catalogue";
import type { Catalogue, Settings } from "@/lib/engine/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = PgDatabase<any, any, any>;

const n = (v: string | number | null): number => (v === null ? 0 : Number(v));

/** Loads the whole catalogue in one pass. It is small — a few hundred rows at
 *  most — and every screen needs the full graph to cost anything, so this is
 *  cheaper than resolving relations per row. */
export async function loadCatalogue(db: Db): Promise<Catalogue> {
  const [
    supplierRows,
    ingredientRows,
    recipeRows,
    recipeItemRows,
    menuItemRows,
    packageRows,
    tierRows,
    packageItemRows,
    addonRows,
  ] = await Promise.all([
    db.select().from(s.suppliers),
    db.select().from(s.ingredients),
    db.select().from(s.recipes),
    db.select().from(s.recipeItems),
    db.select().from(s.menuItems),
    db.select().from(s.packages),
    db.select().from(s.packageTiers).orderBy(asc(s.packageTiers.upToGuests)),
    db.select().from(s.packageItems).orderBy(asc(s.packageItems.sort)),
    db.select().from(s.addons),
  ]);

  const itemsByRecipe = new Map<string, { ingredientId: string; qty: number }[]>();
  for (const row of recipeItemRows) {
    const list = itemsByRecipe.get(row.recipeId) ?? [];
    list.push({ ingredientId: row.ingredientId, qty: n(row.qty) });
    itemsByRecipe.set(row.recipeId, list);
  }

  const tiersByPackage = new Map<string, { upToGuests: number; pricePerHead: number }[]>();
  for (const row of tierRows) {
    const list = tiersByPackage.get(row.packageId) ?? [];
    list.push({ upToGuests: row.upToGuests, pricePerHead: row.pricePerHead });
    tiersByPackage.set(row.packageId, list);
  }

  const menuByPackage = new Map<string, string[]>();
  for (const row of packageItemRows) {
    const list = menuByPackage.get(row.packageId) ?? [];
    list.push(row.menuItemId);
    menuByPackage.set(row.packageId, list);
  }

  return buildCatalogue({
    suppliers: supplierRows.map((r: typeof s.suppliers.$inferSelect) => ({
      id: r.id,
      name: r.name,
      contactEmail: r.contactEmail,
    })),
    ingredients: ingredientRows.map((r: typeof s.ingredients.$inferSelect) => ({
      id: r.id,
      name: r.name,
      unit: r.unit,
      packSize: n(r.packSize),
      costPerUnit: r.costPerUnit,
      supplierId: r.supplierId,
    })),
    recipes: recipeRows.map((r: typeof s.recipes.$inferSelect) => ({
      id: r.id,
      name: r.name,
      yieldPortions: n(r.yieldPortions),
      items: itemsByRecipe.get(r.id) ?? [],
    })),
    menuItems: menuItemRows.map((r: typeof s.menuItems.$inferSelect) => ({
      id: r.id,
      name: r.name,
      recipeId: r.recipeId,
      portionsPerHead: n(r.portionsPerHead),
      dietaryTags: r.dietaryTags,
    })),
    packages: packageRows.map((r: typeof s.packages.$inferSelect) => ({
      id: r.id,
      name: r.name,
      style: r.style,
      blurb: r.blurb,
      minGuests: r.minGuests,
      maxGuests: r.maxGuests,
      staffPerGuests: r.staffPerGuests,
      serviceHours: n(r.serviceHours),
      includes: r.includes,
      menuItemIds: menuByPackage.get(r.id) ?? [],
      tiers: tiersByPackage.get(r.id) ?? [],
      adaptableDietary: r.adaptableDietary,
    })),
    addons: addonRows.map((r: typeof s.addons.$inferSelect) => ({
      id: r.id,
      name: r.name,
      price: r.price,
      pricingBasis: r.pricingBasis,
    })),
  });
}

export async function loadSettings(db: Db): Promise<Settings> {
  const [row] = await db.select().from(s.settings).where(eq(s.settings.id, 1)).limit(1);
  if (!row) {
    throw new Error("Settings row is missing. Run `npm run db:seed`.");
  }
  return {
    staffHourlyCost: row.staffHourlyCost,
    staffHourlyCharge: row.staffHourlyCharge,
    gstRate: n(row.gstRate),
    quoteValidityDays: row.quoteValidityDays,
    depositPct: row.depositPct,
  };
}
