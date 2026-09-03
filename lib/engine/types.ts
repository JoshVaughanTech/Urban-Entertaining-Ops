/** The engine's own vocabulary. Deliberately not the Drizzle row types: the
 *  engine is pure, takes plain numbers, and never knows a database exists.
 *  Callers map rows to these at the boundary. */

/** Money is always integer cents on the way in. Derived values (a cost per
 *  portion, say) can be fractional cents; round only when displaying. */
export type Cents = number;

export type Unit = "kg" | "L" | "each" | "dozen";
export type Style = "cocktail" | "seated" | "grazing" | "corporate";
export type DietaryTag = "vegetarian" | "vegan" | "gf" | "df" | "halal" | "nut_free";
export type PricingBasis = "head" | "flat";
export type QuoteLineSource = "package" | "addon" | "extended_service" | "custom";

export type Ingredient = {
  id: string;
  name: string;
  unit: Unit;
  packSize: number;
  costPerUnit: Cents;
  supplierId: string | null;
};

export type Supplier = {
  id: string;
  name: string;
  contactEmail: string | null;
};

export type Recipe = {
  id: string;
  name: string;
  yieldPortions: number;
  items: { ingredientId: string; qty: number }[];
};

export type MenuItem = {
  id: string;
  name: string;
  recipeId: string | null;
  portionsPerHead: number;
  dietaryTags: DietaryTag[];
};

export type PackageTier = { upToGuests: number; pricePerHead: Cents };

export type Package = {
  id: string;
  name: string;
  style: Style;
  blurb: string | null;
  minGuests: number;
  maxGuests: number;
  staffPerGuests: number | null;
  serviceHours: number;
  includes: string[];
  menuItemIds: string[];
  tiers: PackageTier[];
  adaptableDietary: DietaryTag[];
};

export type Addon = {
  id: string;
  name: string;
  price: Cents;
  pricingBasis: PricingBasis;
};

export type Settings = {
  staffHourlyCost: Cents;
  staffHourlyCharge: Cents;
  gstRate: number;
  quoteValidityDays: number;
  depositPct: number;
};

export type EventInput = {
  guests: number;
  style: Style | null;
  durationHours: number;
  dietary: DietaryTag[];
};

/** Everything the engine needs to resolve package → menu items → recipes →
 *  ingredients. Built once per request from the live tables (or from a
 *  quote's snapshot). */
export type Catalogue = {
  ingredients: ReadonlyMap<string, Ingredient>;
  recipes: ReadonlyMap<string, Recipe>;
  menuItems: ReadonlyMap<string, MenuItem>;
  packages: ReadonlyMap<string, Package>;
  addons: ReadonlyMap<string, Addon>;
  suppliers: ReadonlyMap<string, Supplier>;
};

export type QuoteLine = {
  sort: number;
  label: string;
  qty: number;
  unitPrice: Cents;
  source: QuoteLineSource;
  addonId?: string;
};

export const DIETARY_LABELS: Record<DietaryTag, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  gf: "Gluten free",
  df: "Dairy free",
  halal: "Halal",
  nut_free: "Nut allergy",
};

export const STYLE_LABELS: Record<Style, string> = {
  cocktail: "Cocktail",
  seated: "Seated dinner",
  grazing: "Grazing",
  corporate: "Corporate",
};

export const DIETARY_TAGS = Object.keys(DIETARY_LABELS) as DietaryTag[];
export const STYLES = Object.keys(STYLE_LABELS) as Style[];
