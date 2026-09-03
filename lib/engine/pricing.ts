import type {
  Addon,
  Catalogue,
  Cents,
  EventInput,
  Package,
  QuoteLine,
  Recipe,
  Settings,
} from "./types";

/** First tier whose ceiling the guest count fits under, else the last tier.
 *  Tiers are assumed sorted ascending by upToGuests; sortTiers guarantees it. */
export function tierPrice(pkg: Package, guests: number): Cents {
  const tiers = sortTiers(pkg.tiers);
  const hit = tiers.find((t) => guests <= t.upToGuests);
  const last = tiers[tiers.length - 1];
  return (hit ?? last)?.pricePerHead ?? 0;
}

export const sortTiers = (tiers: PackageTiers) =>
  [...tiers].sort((a, b) => a.upToGuests - b.upToGuests);

type PackageTiers = Package["tiers"];

/** Σ(qty × cost_per_unit) / yield_portions. Fractional cents by design. */
export function recipeCostPerPortion(recipe: Recipe, cat: Catalogue): Cents {
  if (recipe.yieldPortions <= 0) return 0;
  const batch = recipe.items.reduce((sum, item) => {
    const ing = cat.ingredients.get(item.ingredientId);
    return ing ? sum + item.qty * ing.costPerUnit : sum;
  }, 0);
  return batch / recipe.yieldPortions;
}

export function menuItemCostPerHead(menuItemId: string, cat: Catalogue): Cents {
  const mi = cat.menuItems.get(menuItemId);
  if (!mi?.recipeId) return 0;
  const recipe = cat.recipes.get(mi.recipeId);
  if (!recipe) return 0;
  return recipeCostPerPortion(recipe, cat) * mi.portionsPerHead;
}

/** Σ over the package's menu items of cost-per-portion × portions-per-head. */
export function foodCostPerHead(pkg: Package, cat: Catalogue): Cents {
  return pkg.menuItemIds.reduce((sum, id) => sum + menuItemCostPerHead(id, cat), 0);
}

/** ceil(guests / staff_per_guests) × service_hours × staff_hourly_cost.
 *  Zero when the package carries no staff. */
export function staffCount(pkg: Package, guests: number): number {
  if (!pkg.staffPerGuests) return 0;
  return Math.ceil(guests / pkg.staffPerGuests);
}

export function staffCost(pkg: Package, guests: number, settings: Settings): Cents {
  return staffCount(pkg, guests) * pkg.serviceHours * settings.staffHourlyCost;
}

export function extraHours(pkg: Package, event: EventInput): number {
  return Math.max(0, event.durationHours - pkg.serviceHours);
}

/** The quote's lines, in the order the mockup builds them: the package line
 *  first, then each add-on, then extended service. Custom lines are appended
 *  by the caller — they are staff's own text and carry no cost. */
export function buildQuoteLines(input: {
  pkg: Package;
  event: EventInput;
  pricePerHead: Cents;
  addons: Addon[];
  settings: Settings;
  customLines?: Omit<QuoteLine, "sort" | "source">[];
}): QuoteLine[] {
  const { pkg, event, pricePerHead, addons, settings, customLines = [] } = input;
  const lines: Omit<QuoteLine, "sort">[] = [
    {
      label: `${pkg.name} — ${event.guests} guests`,
      qty: event.guests,
      unitPrice: pricePerHead,
      source: "package",
    },
  ];

  for (const addon of addons) {
    lines.push({
      label: addon.name,
      qty: addon.pricingBasis === "head" ? event.guests : 1,
      unitPrice: addon.price,
      source: "addon",
      addonId: addon.id,
    });
  }

  const extra = extraHours(pkg, event);
  const staff = staffCount(pkg, event.guests);
  if (extra > 0 && staff > 0) {
    lines.push({
      label: `Extended service (${formatHours(extra)}h × ${staff} staff)`,
      qty: extra * staff,
      unitPrice: settings.staffHourlyCharge,
      source: "extended_service",
    });
  }

  for (const custom of customLines) {
    lines.push({ ...custom, source: "custom" });
  }

  return lines.map((line, sort) => ({ ...line, sort }));
}

const formatHours = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(1));

export type QuoteTotals = {
  subtotal: Cents;
  discount: Cents;
  total: Cents;
  /** GST component of a GST-inclusive total. */
  gst: Cents;
  food: Cents;
  staff: Cents;
  margin: number;
  /** Custom lines have no recipe behind them, so the margin understates cost. */
  hasUncostedLines: boolean;
};

export function quoteTotals(input: {
  lines: QuoteLine[];
  discount: Cents;
  pkg: Package | null;
  event: EventInput;
  settings: Settings;
  cat: Catalogue;
}): QuoteTotals {
  const { lines, discount, pkg, event, settings, cat } = input;

  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
  const total = subtotal - discount;
  const food = pkg ? foodCostPerHead(pkg, cat) * event.guests : 0;
  const staff = pkg ? staffCost(pkg, event.guests, settings) : 0;

  return {
    subtotal,
    discount,
    total,
    gst: gstComponent(total, settings.gstRate),
    food,
    staff,
    margin: total ? (total - food - staff) / total : 0,
    hasUncostedLines: lines.some((l) => l.source === "custom"),
  };
}

/** Prices are GST inclusive, so the tax is a fraction of the total, not a
 *  markup on top of it. */
export const gstComponent = (totalIncGst: Cents, rate: number): Cents =>
  rate <= 0 ? 0 : totalIncGst * (rate / (1 + rate));

/** The mockup flags anything under 55% in red. */
export const MARGIN_FLOOR = 0.55;
export const isMarginHealthy = (margin: number) => margin >= MARGIN_FLOOR;
