import type {
  Addon,
  Catalogue,
  Ingredient,
  MenuItem,
  Package,
  Recipe,
  Supplier,
} from "./types";

export type CatalogueInput = {
  suppliers: Supplier[];
  ingredients: Ingredient[];
  recipes: Recipe[];
  menuItems: MenuItem[];
  packages: Package[];
  addons: Addon[];
};

const byId = <T extends { id: string }>(rows: T[]): ReadonlyMap<string, T> =>
  new Map(rows.map((row) => [row.id, row]));

/** One place that turns flat rows into the lookup maps every calculation
 *  walks. Build it once per request and pass it down. */
export function buildCatalogue(input: CatalogueInput): Catalogue {
  return {
    suppliers: byId(input.suppliers),
    ingredients: byId(input.ingredients),
    recipes: byId(input.recipes),
    menuItems: byId(input.menuItems),
    packages: byId(input.packages),
    addons: byId(input.addons),
  };
}

/** Which recipes use a given ingredient — the "used in" column on the
 *  ingredients tab. */
export function recipesUsingIngredient(cat: Catalogue): Map<string, Recipe[]> {
  const used = new Map<string, Recipe[]>();
  for (const recipe of cat.recipes.values()) {
    for (const item of recipe.items) {
      const list = used.get(item.ingredientId) ?? [];
      list.push(recipe);
      used.set(item.ingredientId, list);
    }
  }
  return used;
}

/** Which packages a menu item appears in — shown before deleting one. */
export function packagesUsingMenuItem(cat: Catalogue): Map<string, Package[]> {
  const used = new Map<string, Package[]>();
  for (const pkg of cat.packages.values()) {
    for (const id of pkg.menuItemIds) {
      const list = used.get(id) ?? [];
      list.push(pkg);
      used.set(id, list);
    }
  }
  return used;
}
