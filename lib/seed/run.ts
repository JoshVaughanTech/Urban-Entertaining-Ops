/* Loads the placeholder catalogue and the mockup's three quotes.
 *
 * Idempotent: every catalogue row upserts on its slug, so re-running the seed
 * refreshes prices without duplicating anything. Quotes are matched on ref.
 * Takes the db as an argument so the tests can run it against a throwaway
 * database. */

import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

import { buildCatalogue } from "@/lib/engine/catalogue";
import { buildQuoteLines, tierPrice } from "@/lib/engine/pricing";
import { buildSnapshot } from "@/lib/engine/snapshot";
import type { Addon, EventInput, Package } from "@/lib/engine/types";
import * as s from "@/lib/db/schema";
import { SETTINGS, SEED_QUOTES } from "./assumptions";
import {
  seedAddons,
  seedCatalogueInput,
  seedIngredients,
  seedMenuItems,
  seedPackages,
  seedRecipes,
  seedSettings,
  seedSuppliers,
} from "./fixtures";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = PgDatabase<any, any, any>;

const num = (n: number) => String(n);

export type SeedReport = {
  suppliers: number;
  ingredients: number;
  recipes: number;
  menuItems: number;
  packages: number;
  addons: number;
  quotes: number;
};

export async function seedDatabase(db: Db): Promise<SeedReport> {
  /* ── suppliers ─────────────────────────────────────────────────────── */
  const supplierRows = await db
    .insert(s.suppliers)
    .values(seedSuppliers.map((x) => ({ slug: x.id, name: x.name, contactEmail: x.contactEmail })))
    .onConflictDoUpdate({ target: s.suppliers.slug, set: { name: sql`excluded.name` } })
    .returning({ id: s.suppliers.id, slug: s.suppliers.slug });

  const supplierId = idBySlug(supplierRows);

  /* ── ingredients ───────────────────────────────────────────────────── */
  const ingredientRows = await db
    .insert(s.ingredients)
    .values(
      seedIngredients.map((x) => ({
        slug: x.id,
        name: x.name,
        unit: x.unit,
        packSize: num(x.packSize),
        costPerUnit: x.costPerUnit,
        supplierId: x.supplierId ? supplierId(x.supplierId) : null,
      })),
    )
    .onConflictDoUpdate({
      target: s.ingredients.slug,
      set: {
        name: sql`excluded.name`,
        unit: sql`excluded.unit`,
        packSize: sql`excluded.pack_size`,
        costPerUnit: sql`excluded.cost_per_unit`,
        supplierId: sql`excluded.supplier_id`,
        costUpdatedAt: sql`now()`,
      },
    })
    .returning({ id: s.ingredients.id, slug: s.ingredients.slug });

  const ingredientId = idBySlug(ingredientRows);

  /* ── recipes ───────────────────────────────────────────────────────── */
  const recipeRows = await db
    .insert(s.recipes)
    .values(seedRecipes.map((x) => ({ slug: x.id, name: x.name, yieldPortions: num(x.yieldPortions) })))
    .onConflictDoUpdate({
      target: s.recipes.slug,
      set: { name: sql`excluded.name`, yieldPortions: sql`excluded.yield_portions` },
    })
    .returning({ id: s.recipes.id, slug: s.recipes.slug });

  const recipeId = idBySlug(recipeRows);

  await db.delete(s.recipeItems).where(
    inArray(
      s.recipeItems.recipeId,
      recipeRows.map((r: { id: string }) => r.id),
    ),
  );
  await db.insert(s.recipeItems).values(
    seedRecipes.flatMap((r) =>
      r.items.map((item) => ({
        recipeId: recipeId(r.id),
        ingredientId: ingredientId(item.ingredientId),
        qty: num(item.qty),
      })),
    ),
  );

  /* ── menu items ────────────────────────────────────────────────────── */
  const menuRows = await db
    .insert(s.menuItems)
    .values(
      seedMenuItems.map((x) => ({
        slug: x.id,
        name: x.name,
        recipeId: x.recipeId ? recipeId(x.recipeId) : null,
        portionsPerHead: num(x.portionsPerHead),
        dietaryTags: x.dietaryTags,
      })),
    )
    .onConflictDoUpdate({
      target: s.menuItems.slug,
      set: {
        name: sql`excluded.name`,
        recipeId: sql`excluded.recipe_id`,
        portionsPerHead: sql`excluded.portions_per_head`,
        dietaryTags: sql`excluded.dietary_tags`,
      },
    })
    .returning({ id: s.menuItems.id, slug: s.menuItems.slug });

  const menuItemId = idBySlug(menuRows);

  /* ── packages ──────────────────────────────────────────────────────── */
  const packageRows = await db
    .insert(s.packages)
    .values(
      seedPackages.map((x) => ({
        slug: x.id,
        name: x.name,
        style: x.style,
        blurb: x.blurb,
        minGuests: x.minGuests,
        maxGuests: x.maxGuests,
        staffPerGuests: x.staffPerGuests,
        serviceHours: num(x.serviceHours),
        includes: x.includes,
        adaptableDietary: x.adaptableDietary,
      })),
    )
    .onConflictDoUpdate({
      target: s.packages.slug,
      set: {
        name: sql`excluded.name`,
        style: sql`excluded.style`,
        blurb: sql`excluded.blurb`,
        minGuests: sql`excluded.min_guests`,
        maxGuests: sql`excluded.max_guests`,
        staffPerGuests: sql`excluded.staff_per_guests`,
        serviceHours: sql`excluded.service_hours`,
        includes: sql`excluded.includes`,
        adaptableDietary: sql`excluded.adaptable_dietary`,
      },
    })
    .returning({ id: s.packages.id, slug: s.packages.slug });

  const packageId = idBySlug(packageRows);
  const packageIds = packageRows.map((p: { id: string }) => p.id);

  await db.delete(s.packageTiers).where(inArray(s.packageTiers.packageId, packageIds));
  await db.insert(s.packageTiers).values(
    seedPackages.flatMap((p) =>
      p.tiers.map((t) => ({
        packageId: packageId(p.id),
        upToGuests: t.upToGuests,
        pricePerHead: t.pricePerHead,
      })),
    ),
  );

  await db.delete(s.packageItems).where(inArray(s.packageItems.packageId, packageIds));
  await db.insert(s.packageItems).values(
    seedPackages.flatMap((p) =>
      p.menuItemIds.map((id, sort) => ({
        packageId: packageId(p.id),
        menuItemId: menuItemId(id),
        sort,
      })),
    ),
  );

  /* ── add-ons ───────────────────────────────────────────────────────── */
  const addonRows = await db
    .insert(s.addons)
    .values(
      seedAddons.map((x) => ({
        slug: x.id,
        name: x.name,
        price: x.price,
        pricingBasis: x.pricingBasis,
      })),
    )
    .onConflictDoUpdate({
      target: s.addons.slug,
      set: {
        name: sql`excluded.name`,
        price: sql`excluded.price`,
        pricingBasis: sql`excluded.pricing_basis`,
      },
    })
    .returning({ id: s.addons.id, slug: s.addons.slug });

  const addonId = idBySlug(addonRows);

  /* ── settings ──────────────────────────────────────────────────────── */
  await db
    .insert(s.settings)
    .values({
      id: 1,
      staffHourlyCost: SETTINGS.staffHourlyCost,
      staffHourlyCharge: SETTINGS.staffHourlyCharge,
      gstRate: SETTINGS.gstRate,
      quoteValidityDays: SETTINGS.quoteValidityDays,
      depositPct: SETTINGS.depositPct,
      quoteRefPrefix: SETTINGS.quoteRefPrefix,
      quoteRefNext: SETTINGS.quoteRefNext,
    })
    .onConflictDoNothing({ target: s.settings.id });

  /* ── events and quotes ─────────────────────────────────────────────── */
  const cat = buildCatalogue(seedCatalogueInput);
  const bySlug = new Map(seedPackages.map((p) => [p.id, p]));
  const addonBySlug = new Map(seedAddons.map((a) => [a.id, a]));

  let quotesWritten = 0;

  for (const q of SEED_QUOTES) {
    const existing = await db
      .select({ id: s.quotes.id })
      .from(s.quotes)
      .where(eq(s.quotes.ref, q.ref))
      .limit(1);
    if (existing.length > 0) continue;

    const pkg = bySlug.get(q.packageSlug);
    if (!pkg) throw new Error(`seed quote ${q.ref} points at unknown package ${q.packageSlug}`);

    /* The mockup has no event record — style and duration come from the
       package the event was built around. Venue, contact and dietary stay
       empty rather than invented. */
    const event: EventInput & { clientName: string; eventDate: string; venue: string | null } = {
      clientName: q.clientName,
      eventDate: q.eventDate,
      venue: null,
      guests: q.guests,
      style: pkg.style,
      durationHours: pkg.serviceHours,
      dietary: [],
    };

    const [eventRow] = await db
      .insert(s.events)
      .values({
        clientName: event.clientName,
        eventDate: event.eventDate,
        guests: event.guests,
        style: event.style,
        durationHours: num(event.durationHours),
        venue: event.venue,
        dietary: event.dietary,
      })
      .returning({ id: s.events.id });

    if (!eventRow) throw new Error(`could not create event for ${q.ref}`);

    const addons = q.addonSlugs.flatMap((slug) => {
      const a = addonBySlug.get(slug);
      return a ? [a] : [];
    });

    const lines = buildQuoteLines({
      pkg,
      event,
      pricePerHead: q.pricePerHead,
      addons,
      settings: seedSettings,
    });

    const sent = q.status === "sent" || q.status === "confirmed";
    const snapshot = sent
      ? buildSnapshot({
          pkg,
          event,
          pricePerHead: q.pricePerHead,
          discount: 0,
          addons,
          lines,
          settings: seedSettings,
          cat,
        })
      : null;

    const [quoteRow] = await db
      .insert(s.quotes)
      .values({
        ref: q.ref,
        eventId: eventRow.id,
        packageId: packageId(q.packageSlug),
        pricePerHead: q.pricePerHead,
        discount: 0,
        status: q.status,
        sentAt: sent ? new Date() : null,
        confirmedAt: q.status === "confirmed" ? new Date() : null,
        snapshot,
      })
      .returning({ id: s.quotes.id });

    if (!quoteRow) throw new Error(`could not create quote ${q.ref}`);

    if (addons.length > 0) {
      await db.insert(s.quoteAddons).values(
        addons.map((a: Addon) => ({ quoteId: quoteRow.id, addonId: addonId(a.id) })),
      );
    }

    await db.insert(s.quoteLines).values(
      lines.map((line) => ({
        quoteId: quoteRow.id,
        sort: line.sort,
        label: line.label,
        qty: num(line.qty),
        unitPrice: line.unitPrice,
        source: line.source,
        addonId: line.addonId ? addonId(line.addonId) : null,
      })),
    );

    quotesWritten += 1;
  }

  /* Keep the ref counter ahead of anything the seed just wrote. */
  await db
    .update(s.settings)
    .set({ quoteRefNext: SETTINGS.quoteRefNext })
    .where(and(eq(s.settings.id, 1), sql`${s.settings.quoteRefNext} < ${SETTINGS.quoteRefNext}`));

  return {
    suppliers: supplierRows.length,
    ingredients: ingredientRows.length,
    recipes: recipeRows.length,
    menuItems: menuRows.length,
    packages: packageRows.length,
    addons: addonRows.length,
    quotes: quotesWritten,
  };
}

function idBySlug(rows: { id: string; slug: string | null }[]) {
  const map = new Map(rows.flatMap((r) => (r.slug ? [[r.slug, r.id] as const] : [])));
  return (slug: string): string => {
    const id = map.get(slug);
    if (!id) throw new Error(`seed could not resolve slug "${slug}"`);
    return id;
  };
}

export type { Package, Addon };
