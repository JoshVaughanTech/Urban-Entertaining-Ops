"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { DIETARY_TAGS, STYLES } from "@/lib/engine/types";
import { Validator, failed, succeeded, type ActionState } from "@/lib/validate";

const UNITS = ["kg", "L", "each", "dozen"] as const;
const BASES = ["head", "flat"] as const;

/** Every catalogue change invalidates every costed screen, because a single
 *  ingredient price moves recipes, packages, quotes in progress and orders. */
function revalidateCatalogue() {
  for (const path of ["/app/packages", "/app/recipes", "/app/ordering", "/app/quotes"]) {
    revalidatePath(path, "layout");
  }
}

/* ── suppliers ─────────────────────────────────────────────────────────── */

export async function saveSupplier(_prev: ActionState, data: FormData): Promise<ActionState> {
  await requireUser();
  const v = new Validator(data);

  const id = v.optionalText("id");
  const values = {
    name: v.text("name", "Name", { required: true, max: 120 }),
    contactEmail: v.email("contactEmail", "Contact email"),
    notes: v.optionalText("notes"),
  };

  if (!v.ok) return failed("Check the highlighted fields.", v.errors);

  try {
    if (id) {
      await db.update(s.suppliers).set(values).where(eq(s.suppliers.id, id));
    } else {
      await db.insert(s.suppliers).values(values);
    }
  } catch (err) {
    return failed(describe(err));
  }

  revalidateCatalogue();
  redirect("/app/suppliers");
}

export async function deleteSupplier(_prev: ActionState, data: FormData): Promise<ActionState> {
  await requireUser();
  const id = String(data.get("id") ?? "");
  if (!id) return failed("No supplier to delete.");

  try {
    await db.delete(s.suppliers).where(eq(s.suppliers.id, id));
  } catch (err) {
    return failed(
      isForeignKeyViolation(err)
        ? "This supplier still has ingredients. Move them to another supplier first."
        : describe(err),
    );
  }

  revalidateCatalogue();
  redirect("/app/suppliers");
}

/* ── ingredients ───────────────────────────────────────────────────────── */

export async function saveIngredient(_prev: ActionState, data: FormData): Promise<ActionState> {
  await requireUser();
  const v = new Validator(data);

  const id = v.optionalText("id");
  const costPerUnit = v.money("costPerUnit", "Cost per unit", { required: true, min: 0 });
  const values = {
    name: v.text("name", "Name", { required: true, max: 120 }),
    unit: v.enum("unit", "Unit", UNITS),
    packSize: String(v.number("packSize", "Pack size", { required: true, min: 0.001 })),
    costPerUnit,
    supplierId: v.optionalText("supplierId"),
    active: data.get("active") !== null,
  };

  if (!v.ok) return failed("Check the highlighted fields.", v.errors);

  try {
    if (id) {
      // Only stamp cost_updated_at when the cost actually moved.
      const [before] = await db
        .select({ costPerUnit: s.ingredients.costPerUnit })
        .from(s.ingredients)
        .where(eq(s.ingredients.id, id))
        .limit(1);

      await db
        .update(s.ingredients)
        .set({
          ...values,
          updatedAt: new Date(),
          ...(before && before.costPerUnit !== costPerUnit ? { costUpdatedAt: new Date() } : {}),
        })
        .where(eq(s.ingredients.id, id));
    } else {
      await db.insert(s.ingredients).values(values);
    }
  } catch (err) {
    return failed(describe(err));
  }

  revalidateCatalogue();
  redirect("/app/recipes?tab=ingredients");
}

export async function deleteIngredient(_prev: ActionState, data: FormData): Promise<ActionState> {
  await requireUser();
  const id = String(data.get("id") ?? "");
  if (!id) return failed("No ingredient to delete.");

  try {
    await db.delete(s.ingredients).where(eq(s.ingredients.id, id));
  } catch (err) {
    return failed(
      isForeignKeyViolation(err)
        ? "This ingredient is still used by a recipe. Remove it from those recipes first, or mark it inactive."
        : describe(err),
    );
  }

  revalidateCatalogue();
  redirect("/app/recipes?tab=ingredients");
}

/* ── recipes ───────────────────────────────────────────────────────────── */

export async function saveRecipe(_prev: ActionState, data: FormData): Promise<ActionState> {
  await requireUser();
  const v = new Validator(data);

  const id = v.optionalText("id");
  const values = {
    name: v.text("name", "Name", { required: true, max: 160 }),
    yieldPortions: String(v.number("yieldPortions", "Yield", { required: true, min: 0.001 })),
    notes: v.optionalText("notes"),
    active: data.get("active") !== null,
  };

  /* Recipe lines arrive as parallel arrays: ingredientId[] and qty[]. */
  const ingredientIds = data.getAll("ingredientId").map(String);
  const quantities = data.getAll("qty").map(String);

  const items: { ingredientId: string; qty: string }[] = [];
  const seen = new Set<string>();

  ingredientIds.forEach((ingredientId, i) => {
    const rawQty = quantities[i] ?? "";
    if (!ingredientId || rawQty.trim() === "") return;

    const qty = Number(rawQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      v.errors[`qty.${i}`] = "Quantity must be greater than zero.";
      return;
    }
    if (seen.has(ingredientId)) {
      v.errors[`ingredientId.${i}`] = "This ingredient is already on the recipe.";
      return;
    }
    seen.add(ingredientId);
    items.push({ ingredientId, qty: String(qty) });
  });

  if (items.length === 0) {
    v.errors["items"] = "A recipe needs at least one ingredient.";
  }

  if (!v.ok) return failed("Check the highlighted fields.", v.errors);

  try {
    await db.transaction(async (tx) => {
      let recipeId = id;
      if (recipeId) {
        await tx
          .update(s.recipes)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(s.recipes.id, recipeId));
      } else {
        const [row] = await tx.insert(s.recipes).values(values).returning({ id: s.recipes.id });
        recipeId = row!.id;
      }

      await tx.delete(s.recipeItems).where(eq(s.recipeItems.recipeId, recipeId));
      await tx
        .insert(s.recipeItems)
        .values(items.map((item) => ({ ...item, recipeId: recipeId! })));
    });
  } catch (err) {
    return failed(describe(err));
  }

  revalidateCatalogue();
  redirect("/app/recipes");
}

export async function deleteRecipe(_prev: ActionState, data: FormData): Promise<ActionState> {
  await requireUser();
  const id = String(data.get("id") ?? "");
  if (!id) return failed("No recipe to delete.");

  try {
    await db.delete(s.recipes).where(eq(s.recipes.id, id));
  } catch (err) {
    return failed(
      isForeignKeyViolation(err)
        ? "A menu item still points at this recipe. Repoint or delete that menu item first."
        : describe(err),
    );
  }

  revalidateCatalogue();
  redirect("/app/recipes");
}

/* ── menu items ────────────────────────────────────────────────────────── */

export async function saveMenuItem(_prev: ActionState, data: FormData): Promise<ActionState> {
  await requireUser();
  const v = new Validator(data);

  const id = v.optionalText("id");
  const values = {
    name: v.text("name", "Name", { required: true, max: 160 }),
    recipeId: v.optionalText("recipeId"),
    portionsPerHead: String(
      v.number("portionsPerHead", "Portions per guest", { required: true, min: 0.001 }),
    ),
    dietaryTags: v.multi("dietaryTags", DIETARY_TAGS),
    active: data.get("active") !== null,
  };

  if (!v.ok) return failed("Check the highlighted fields.", v.errors);

  try {
    if (id) {
      await db
        .update(s.menuItems)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(s.menuItems.id, id));
    } else {
      await db.insert(s.menuItems).values(values);
    }
  } catch (err) {
    return failed(describe(err));
  }

  revalidateCatalogue();
  redirect("/app/menu-items");
}

export async function deleteMenuItem(_prev: ActionState, data: FormData): Promise<ActionState> {
  await requireUser();
  const id = String(data.get("id") ?? "");
  if (!id) return failed("No menu item to delete.");

  try {
    await db.delete(s.menuItems).where(eq(s.menuItems.id, id));
  } catch (err) {
    return failed(
      isForeignKeyViolation(err)
        ? "This menu item is still in a package. Remove it from those packages first."
        : describe(err),
    );
  }

  revalidateCatalogue();
  redirect("/app/menu-items");
}

/* ── packages ──────────────────────────────────────────────────────────── */

export async function savePackage(_prev: ActionState, data: FormData): Promise<ActionState> {
  await requireUser();
  const v = new Validator(data);

  const id = v.optionalText("id");
  const minGuests = v.number("minGuests", "Minimum guests", {
    required: true,
    min: 1,
    integer: true,
  });
  const maxGuests = v.number("maxGuests", "Maximum guests", {
    required: true,
    min: 1,
    integer: true,
  });

  if (maxGuests < minGuests) {
    v.errors["maxGuests"] = "Maximum guests cannot be below the minimum.";
  }

  const values = {
    name: v.text("name", "Name", { required: true, max: 160 }),
    style: v.enum("style", "Service style", STYLES),
    blurb: v.optionalText("blurb"),
    minGuests,
    maxGuests,
    staffPerGuests: v.optionalNumber("staffPerGuests", "Staff ratio", { min: 1 }),
    serviceHours: String(v.number("serviceHours", "Service hours", { required: true, min: 0 })),
    includes: v.lines("includes"),
    adaptableDietary: v.multi("adaptableDietary", DIETARY_TAGS),
    active: data.get("active") !== null,
  };

  /* Tiers arrive as parallel arrays. */
  const upTo = data.getAll("upToGuests").map(String);
  const prices = data.getAll("pricePerHead").map(String);

  const tiers: { upToGuests: number; pricePerHead: number }[] = [];
  const seenTiers = new Set<number>();

  upTo.forEach((rawUpTo, i) => {
    const rawPrice = prices[i] ?? "";
    if (rawUpTo.trim() === "" && rawPrice.trim() === "") return;

    const guests = Number(rawUpTo);
    const price = Math.round(Number(rawPrice.replace(/^\$/, "").replace(/,/g, "")) * 100);

    if (!Number.isInteger(guests) || guests < 1) {
      v.errors[`upToGuests.${i}`] = "Must be a whole number of guests.";
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      v.errors[`pricePerHead.${i}`] = "Must be an amount, like 68.";
      return;
    }
    if (seenTiers.has(guests)) {
      v.errors[`upToGuests.${i}`] = "Two tiers cannot share a ceiling.";
      return;
    }
    seenTiers.add(guests);
    tiers.push({ upToGuests: guests, pricePerHead: price });
  });

  if (tiers.length === 0) v.errors["tiers"] = "A package needs at least one price tier.";

  const menuItemIds = data.getAll("menuItemId").map(String).filter(Boolean);
  if (menuItemIds.length === 0) v.errors["menuItems"] = "A package needs at least one menu item.";
  if (new Set(menuItemIds).size !== menuItemIds.length) {
    v.errors["menuItems"] = "The same menu item is listed twice.";
  }

  if (!v.ok) return failed("Check the highlighted fields.", v.errors);

  try {
    await db.transaction(async (tx) => {
      let packageId = id;
      if (packageId) {
        await tx
          .update(s.packages)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(s.packages.id, packageId));
      } else {
        const [row] = await tx.insert(s.packages).values(values).returning({ id: s.packages.id });
        packageId = row!.id;
      }

      await tx.delete(s.packageTiers).where(eq(s.packageTiers.packageId, packageId));
      await tx
        .insert(s.packageTiers)
        .values(tiers.map((t) => ({ ...t, packageId: packageId! })));

      await tx.delete(s.packageItems).where(eq(s.packageItems.packageId, packageId));
      await tx.insert(s.packageItems).values(
        menuItemIds.map((menuItemId, sort) => ({ packageId: packageId!, menuItemId, sort })),
      );
    });
  } catch (err) {
    return failed(describe(err));
  }

  revalidateCatalogue();
  redirect("/app/packages");
}

export async function deletePackage(_prev: ActionState, data: FormData): Promise<ActionState> {
  await requireUser();
  const id = String(data.get("id") ?? "");
  if (!id) return failed("No package to delete.");

  try {
    await db.delete(s.packages).where(eq(s.packages.id, id));
  } catch (err) {
    return failed(
      isForeignKeyViolation(err)
        ? "A quote still uses this package. Mark it inactive instead so old quotes keep working."
        : describe(err),
    );
  }

  revalidateCatalogue();
  redirect("/app/packages");
}

/* ── add-ons ───────────────────────────────────────────────────────────── */

export async function saveAddon(_prev: ActionState, data: FormData): Promise<ActionState> {
  await requireUser();
  const v = new Validator(data);

  const id = v.optionalText("id");
  const values = {
    name: v.text("name", "Name", { required: true, max: 120 }),
    price: v.money("price", "Price", { required: true, min: 0 }),
    pricingBasis: v.enum("pricingBasis", "Pricing basis", BASES),
    active: data.get("active") !== null,
  };

  if (!v.ok) return failed("Check the highlighted fields.", v.errors);

  try {
    if (id) {
      await db
        .update(s.addons)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(s.addons.id, id));
    } else {
      await db.insert(s.addons).values(values);
    }
  } catch (err) {
    return failed(describe(err));
  }

  revalidateCatalogue();
  redirect("/app/addons");
}

export async function deleteAddon(_prev: ActionState, data: FormData): Promise<ActionState> {
  await requireUser();
  const id = String(data.get("id") ?? "");
  if (!id) return failed("No add-on to delete.");

  try {
    await db.delete(s.addons).where(eq(s.addons.id, id));
  } catch (err) {
    return failed(
      isForeignKeyViolation(err)
        ? "A quote still includes this add-on. Mark it inactive instead."
        : describe(err),
    );
  }

  revalidateCatalogue();
  redirect("/app/addons");
}

/* ── settings ──────────────────────────────────────────────────────────── */

export async function saveSettings(_prev: ActionState, data: FormData): Promise<ActionState> {
  await requireUser();
  const v = new Validator(data);

  const gstPercent = v.number("gstPercent", "GST rate", { required: true, min: 0, max: 100 });

  const values = {
    staffHourlyCost: v.money("staffHourlyCost", "Staff hourly cost", { required: true, min: 0 }),
    staffHourlyCharge: v.money("staffHourlyCharge", "Staff hourly charge", {
      required: true,
      min: 0,
    }),
    gstRate: (gstPercent / 100).toFixed(4),
    quoteValidityDays: v.number("quoteValidityDays", "Quote validity", {
      required: true,
      min: 1,
      integer: true,
    }),
    depositPct: v.number("depositPct", "Deposit", {
      required: true,
      min: 0,
      max: 100,
      integer: true,
    }),
    quoteRefPrefix: v.text("quoteRefPrefix", "Quote reference prefix", {
      required: true,
      max: 8,
    }),
    updatedAt: new Date(),
  };

  if (values.staffHourlyCharge < values.staffHourlyCost) {
    v.errors["staffHourlyCharge"] = "Charging staff out below cost would lose money on every hour.";
  }

  if (!v.ok) return failed("Check the highlighted fields.", v.errors);

  try {
    await db
      .insert(s.settings)
      .values({ id: 1, ...values, quoteRefNext: 1000 })
      .onConflictDoUpdate({ target: s.settings.id, set: values });
  } catch (err) {
    return failed(describe(err));
  }

  revalidateCatalogue();
  revalidatePath("/app/settings");
  return succeeded("Settings saved.");
}

/* ── error shaping ─────────────────────────────────────────────────────── */

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "23503";
}

function describe(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    if (err.code === "23505") return "Something with that name already exists.";
    if (err.code === "23514") return "That value is outside what the database allows.";
  }
  return err instanceof Error ? err.message : "Could not save. Try again.";
}

