import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ── enums ─────────────────────────────────────────────────────────────── */

export const unitEnum = pgEnum("unit", ["kg", "L", "each", "dozen"]);
export const styleEnum = pgEnum("style", ["cocktail", "seated", "grazing", "corporate"]);
export const dietaryEnum = pgEnum("dietary_tag", [
  "vegetarian",
  "vegan",
  "gf",
  "df",
  "halal",
  "nut_free",
]);
export const pricingBasisEnum = pgEnum("pricing_basis", ["head", "flat"]);
export const quoteStatusEnum = pgEnum("quote_status", [
  "draft",
  "sent",
  "confirmed",
  "declined",
  "cancelled",
]);
export const quoteLineSourceEnum = pgEnum("quote_line_source", [
  "package",
  "addon",
  "extended_service",
  "custom",
]);
export const orderStatusEnum = pgEnum("order_status", ["draft", "placed"]);
export const roleEnum = pgEnum("role", ["admin", "staff"]);

/* ── shared column builders ────────────────────────────────────────────
   Money is always integer cents. Quantities are numeric(10,3) and come
   back from the driver as strings; the engine parses at its boundary. */

const money = (name: string) => integer(name);
const qty = (name: string) => numeric(name, { precision: 10, scale: 3 });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const emptyTextArray = sql`'{}'::text[]`;
const emptyDietaryArray = sql`'{}'::dietary_tag[]`;

/* ── people ────────────────────────────────────────────────────────────
   Mirrors auth.users. No FK: Supabase owns the auth schema and Drizzle
   migrations should not reach into it. Rows are created on first login. */

export const appUsers = pgTable("app_users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  role: roleEnum("role").notNull().default("staff"),
  createdAt: createdAt(),
});

/* ── catalogue ─────────────────────────────────────────────────────────
   `slug` is the stable human key the seed and the tests address rows by
   (e.g. "beef_eye"). Nullable so CSV import doesn't have to invent one. */

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").unique(),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const ingredients = pgTable(
  "ingredients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").unique(),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    unit: unitEnum("unit").notNull(),
    packSize: qty("pack_size").notNull(),
    costPerUnit: money("cost_per_unit").notNull(),
    costUpdatedAt: timestamp("cost_updated_at", { withTimezone: true }).notNull().defaultNow(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("ingredients_supplier_idx").on(t.supplierId),
    check("ingredients_pack_size_positive", sql`${t.packSize} > 0`),
    check("ingredients_cost_non_negative", sql`${t.costPerUnit} >= 0`),
  ],
);

export const recipes = pgTable("recipes", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").unique(),
  name: text("name").notNull(),
  yieldPortions: qty("yield_portions").notNull(),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const recipeItems = pgTable(
  "recipe_items",
  {
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "restrict" }),
    qty: qty("qty").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.recipeId, t.ingredientId] }),
    check("recipe_items_qty_positive", sql`${t.qty} > 0`),
  ],
);

export const menuItems = pgTable("menu_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").unique(),
  name: text("name").notNull(),
  recipeId: uuid("recipe_id").references(() => recipes.id, { onDelete: "restrict" }),
  portionsPerHead: qty("portions_per_head").notNull(),
  dietaryTags: dietaryEnum("dietary_tags").array().notNull().default(emptyDietaryArray),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const packages = pgTable("packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").unique(),
  name: text("name").notNull(),
  style: styleEnum("style").notNull(),
  blurb: text("blurb"),
  minGuests: integer("min_guests").notNull(),
  maxGuests: integer("max_guests").notNull(),
  staffPerGuests: integer("staff_per_guests"),
  serviceHours: numeric("service_hours", { precision: 4, scale: 1 }).notNull(),
  includes: text("includes").array().notNull().default(emptyTextArray),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const packageTiers = pgTable(
  "package_tiers",
  {
    packageId: uuid("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    upToGuests: integer("up_to_guests").notNull(),
    pricePerHead: money("price_per_head").notNull(),
  },
  (t) => [primaryKey({ columns: [t.packageId, t.upToGuests] })],
);

export const packageItems = pgTable(
  "package_items",
  {
    packageId: uuid("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "restrict" }),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.packageId, t.menuItemId] })],
);

export const addons = pgTable("addons", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").unique(),
  name: text("name").notNull(),
  price: money("price").notNull(),
  pricingBasis: pricingBasisEnum("pricing_basis").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ── settings ──────────────────────────────────────────────────────────
   Single row, pinned to id = 1. `quoteRefNext` is the sequential quote
   counter Phase 2 allocates from. */

export const settings = pgTable(
  "settings",
  {
    id: integer("id").primaryKey().default(1),
    staffHourlyCost: money("staff_hourly_cost").notNull(),
    staffHourlyCharge: money("staff_hourly_charge").notNull(),
    gstRate: numeric("gst_rate", { precision: 5, scale: 4 }).notNull(),
    quoteValidityDays: integer("quote_validity_days").notNull(),
    depositPct: integer("deposit_pct").notNull(),
    quoteRefPrefix: text("quote_ref_prefix").notNull().default("UE"),
    quoteRefNext: integer("quote_ref_next").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [check("settings_singleton", sql`${t.id} = 1`)],
);

/* ── events & quotes ───────────────────────────────────────────────────── */

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientName: text("client_name").notNull(),
    contactEmail: text("contact_email"),
    eventDate: text("event_date").notNull(),
    guests: integer("guests").notNull(),
    style: styleEnum("style"),
    durationHours: numeric("duration_hours", { precision: 4, scale: 1 }).notNull(),
    venue: text("venue"),
    dietary: dietaryEnum("dietary").array().notNull().default(emptyDietaryArray),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("events_date_idx").on(t.eventDate),
    check("events_guests_positive", sql`${t.guests} > 0`),
  ],
);

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ref: text("ref").notNull().unique(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    packageId: uuid("package_id").references(() => packages.id, { onDelete: "restrict" }),
    pricePerHead: money("price_per_head").notNull(),
    discount: money("discount").notNull().default(0),
    status: quoteStatusEnum("status").notNull().default("draft"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    snapshot: jsonb("snapshot"),
    publicToken: text("public_token").unique(),
    createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("quotes_status_idx").on(t.status),
    index("quotes_event_idx").on(t.eventId),
    check("quotes_discount_non_negative", sql`${t.discount} >= 0`),
  ],
);

export const quoteAddons = pgTable(
  "quote_addons",
  {
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    addonId: uuid("addon_id")
      .notNull()
      .references(() => addons.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.quoteId, t.addonId] })],
);

export const quoteLines = pgTable(
  "quote_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
    label: text("label").notNull(),
    qty: qty("qty").notNull(),
    unitPrice: money("unit_price").notNull(),
    source: quoteLineSourceEnum("source").notNull(),
    addonId: uuid("addon_id").references(() => addons.id, { onDelete: "set null" }),
  },
  (t) => [uniqueIndex("quote_lines_sort_idx").on(t.quoteId, t.sort)],
);

/* ── ordering ──────────────────────────────────────────────────────────── */

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  windowFrom: text("window_from").notNull(),
  windowTo: text("window_to").notNull(),
  status: orderStatusEnum("status").notNull().default("draft"),
  createdBy: uuid("created_by").references(() => appUsers.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const orderLines = pgTable(
  "order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "restrict" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "restrict" }),
    neededQty: qty("needed_qty").notNull(),
    packs: integer("packs").notNull(),
    orderQty: qty("order_qty").notNull(),
    unitCost: money("unit_cost").notNull(),
    ordered: boolean("ordered").notNull().default(false),
    quoteIds: uuid("quote_ids").array().notNull().default(sql`'{}'::uuid[]`),
  },
  (t) => [
    uniqueIndex("order_lines_order_ingredient_idx").on(t.orderId, t.ingredientId),
    index("order_lines_supplier_idx").on(t.supplierId),
  ],
);
