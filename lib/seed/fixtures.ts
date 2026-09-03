/* Turns the placeholder JSON in `seed/` into engine types.
 *
 * Used by the seed script and by the engine tests, so the numbers the tests
 * assert on are the same numbers that reach the database. Slugs are the ids
 * here; the seed script swaps them for real uuids on insert. */

import addonsJson from "@/seed/addons.json";
import ingredientsJson from "@/seed/ingredients.json";
import menuItemsJson from "@/seed/menu_items.json";
import packagesJson from "@/seed/packages.json";
import recipesJson from "@/seed/recipes.json";

import type { CatalogueInput } from "@/lib/engine/catalogue";
import { buildCatalogue } from "@/lib/engine/catalogue";
import type {
  Addon,
  Catalogue,
  Ingredient,
  MenuItem,
  Package,
  PricingBasis,
  Recipe,
  Settings,
  Style,
  Supplier,
  Unit,
} from "@/lib/engine/types";
import { PACKAGE_ADAPTABLE_DIETARY, SETTINGS, supplierSlug } from "./assumptions";

/** The seed JSON is written in dollars, as a human would type it. Everything
 *  past this boundary is integer cents. */
export const toCents = (dollars: number): number => Math.round(dollars * 100);

export const seedSuppliers: Supplier[] = [
  ...new Set(ingredientsJson.map((i) => i.supplier)),
].map((name) => ({
  id: supplierSlug(name),
  name,
  contactEmail: null,
}));

export const seedIngredients: Ingredient[] = ingredientsJson.map((i) => ({
  id: i.id,
  name: i.name,
  unit: i.unit as Unit,
  packSize: i.pack,
  costPerUnit: toCents(i.costPerUnit),
  supplierId: supplierSlug(i.supplier),
}));

export const seedRecipes: Recipe[] = recipesJson.map((r) => ({
  id: r.id,
  name: r.name,
  yieldPortions: r.yieldPortions,
  items: r.ingredients.map((ri) => ({ ingredientId: ri.ingredientId, qty: ri.qty })),
}));

export const seedMenuItems: MenuItem[] = menuItemsJson.map((m) => ({
  id: m.id,
  name: m.name,
  recipeId: m.recipeId,
  portionsPerHead: m.portionsPerHead,
  /* The seed carries no dietary tags — see assumptions.ts. */
  dietaryTags: [],
}));

export const seedPackages: Package[] = packagesJson.map((p) => ({
  id: p.id,
  name: p.name,
  style: p.style as Style,
  blurb: p.blurb,
  minGuests: p.minGuests,
  maxGuests: p.maxGuests,
  staffPerGuests: p.staffPerGuests,
  serviceHours: p.serviceHours,
  includes: p.includes,
  menuItemIds: p.menuItemIds,
  tiers: p.tiers.map((t) => ({
    upToGuests: t.upToGuests,
    pricePerHead: toCents(t.pricePerHead),
  })),
  adaptableDietary: PACKAGE_ADAPTABLE_DIETARY[p.id] ?? [],
}));

export const seedAddons: Addon[] = addonsJson.map((a) => ({
  id: a.id,
  name: a.name,
  price: toCents(a.price),
  pricingBasis: a.pricingBasis as PricingBasis,
}));

export const seedCatalogueInput: CatalogueInput = {
  suppliers: seedSuppliers,
  ingredients: seedIngredients,
  recipes: seedRecipes,
  menuItems: seedMenuItems,
  packages: seedPackages,
  addons: seedAddons,
};

export const seedCatalogue = (): Catalogue => buildCatalogue(seedCatalogueInput);

export const seedSettings: Settings = {
  staffHourlyCost: SETTINGS.staffHourlyCost,
  staffHourlyCharge: SETTINGS.staffHourlyCharge,
  gstRate: Number(SETTINGS.gstRate),
  quoteValidityDays: SETTINGS.quoteValidityDays,
  depositPct: SETTINGS.depositPct,
};
