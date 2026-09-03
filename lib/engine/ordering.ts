import type { Catalogue, Cents, Unit } from "./types";

/** Just enough of a confirmed quote to order against it. */
export type OrderableQuote = {
  id: string;
  ref: string;
  guests: number;
  packageId: string;
};

export type RollupLine = {
  ingredientId: string;
  ingredientName: string;
  unit: Unit;
  supplierId: string | null;
  supplierName: string | null;
  /** What the recipes actually call for, before rounding. */
  neededQty: number;
  packSize: number;
  packs: number;
  /** packs × pack_size — what we actually have to buy. */
  orderQty: number;
  unitCost: Cents;
  cost: Cents;
  quoteIds: string[];
  quoteRefs: string[];
};

/** A menu item we cannot order against — surfaced, never silently dropped. */
export type RollupWarning = {
  code: "no_recipe" | "missing_package" | "missing_menu_item";
  message: string;
  quoteRefs: string[];
};

export type Rollup = {
  lines: RollupLine[];
  warnings: RollupWarning[];
};

/** For each quote → package → menu item → recipe:
 *    batches = portions_per_head × guests / yield_portions
 *    needed  = Σ qty × batches   (per ingredient, across every quote)
 *    packs   = ceil(needed / pack_size)
 *  Uses live ingredient costs and pack sizes, never a quote snapshot: the
 *  snapshot fixes the price the client was given, not the shopping. */
export function ingredientRollup(quotes: OrderableQuote[], cat: Catalogue): Rollup {
  const need = new Map<string, { qty: number; quoteIds: Set<string>; quoteRefs: Set<string> }>();
  const warn = new Map<string, RollupWarning>();

  const addWarning = (code: RollupWarning["code"], message: string, ref: string) => {
    const key = `${code}:${message}`;
    const existing = warn.get(key);
    if (existing) {
      if (!existing.quoteRefs.includes(ref)) existing.quoteRefs.push(ref);
    } else {
      warn.set(key, { code, message, quoteRefs: [ref] });
    }
  };

  for (const quote of quotes) {
    const pkg = cat.packages.get(quote.packageId);
    if (!pkg) {
      addWarning("missing_package", "Quote has no package to order against.", quote.ref);
      continue;
    }

    for (const menuItemId of pkg.menuItemIds) {
      const mi = cat.menuItems.get(menuItemId);
      if (!mi) {
        addWarning("missing_menu_item", `A menu item in ${pkg.name} no longer exists.`, quote.ref);
        continue;
      }

      const recipe = mi.recipeId ? cat.recipes.get(mi.recipeId) : undefined;
      if (!recipe) {
        addWarning("no_recipe", `${mi.name} has no recipe, so it can't be ordered.`, quote.ref);
        continue;
      }
      if (recipe.yieldPortions <= 0) {
        addWarning("no_recipe", `${recipe.name} yields no portions, so it can't be ordered.`, quote.ref);
        continue;
      }

      const batches = (mi.portionsPerHead * quote.guests) / recipe.yieldPortions;

      for (const item of recipe.items) {
        const entry = need.get(item.ingredientId) ?? {
          qty: 0,
          quoteIds: new Set<string>(),
          quoteRefs: new Set<string>(),
        };
        entry.qty += item.qty * batches;
        entry.quoteIds.add(quote.id);
        entry.quoteRefs.add(quote.ref);
        need.set(item.ingredientId, entry);
      }
    }
  }

  const lines: RollupLine[] = [];

  for (const [ingredientId, entry] of need) {
    const ing = cat.ingredients.get(ingredientId);
    if (!ing) continue;

    const packs = ing.packSize > 0 ? Math.ceil(entry.qty / ing.packSize) : 0;
    const orderQty = packs * ing.packSize;
    const supplier = ing.supplierId ? cat.suppliers.get(ing.supplierId) : undefined;

    lines.push({
      ingredientId,
      ingredientName: ing.name,
      unit: ing.unit,
      supplierId: ing.supplierId,
      supplierName: supplier?.name ?? null,
      neededQty: entry.qty,
      packSize: ing.packSize,
      packs,
      orderQty,
      unitCost: ing.costPerUnit,
      cost: orderQty * ing.costPerUnit,
      quoteIds: [...entry.quoteIds],
      quoteRefs: [...entry.quoteRefs],
    });
  }

  // Deterministic order — the mockup's insertion order is an accident of how
  // the packages happen to be walked.
  lines.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));

  return { lines, warnings: [...warn.values()] };
}

export type SupplierGroup = {
  supplierId: string | null;
  supplierName: string | null;
  contactEmail: string | null;
  lines: RollupLine[];
  cost: Cents;
};

/** Groups the rollup for the order sheet and the per-supplier CSVs.
 *  Ingredients with no supplier group under a null supplier and sort last —
 *  they still have to be bought by someone. */
export function groupBySupplier(lines: RollupLine[], cat: Catalogue): SupplierGroup[] {
  const groups = new Map<string, SupplierGroup>();

  for (const line of lines) {
    const key = line.supplierId ?? "";
    const group = groups.get(key) ?? {
      supplierId: line.supplierId,
      supplierName: line.supplierName,
      contactEmail: line.supplierId
        ? (cat.suppliers.get(line.supplierId)?.contactEmail ?? null)
        : null,
      lines: [],
      cost: 0,
    };
    group.lines.push(line);
    group.cost += line.cost;
    groups.set(key, group);
  }

  return [...groups.values()].sort((a, b) => {
    if (!a.supplierId) return 1;
    if (!b.supplierId) return -1;
    return (a.supplierName ?? "").localeCompare(b.supplierName ?? "");
  });
}

export const rollupTotalCost = (lines: RollupLine[]): Cents =>
  lines.reduce((sum, l) => sum + l.cost, 0);
