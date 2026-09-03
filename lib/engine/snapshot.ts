import { foodCostPerHead, quoteTotals, staffCost, tierPrice } from "./pricing";
import type {
  Addon,
  Catalogue,
  Cents,
  DietaryTag,
  EventInput,
  Package,
  QuoteLine,
  Settings,
  Unit,
} from "./types";

/** What a quote froze when it was sent.
 *
 *  Sent and confirmed quotes render from this, never from the live tables, so
 *  raising an ingredient price next week cannot rewrite a quote the client is
 *  already holding. Ordering deliberately ignores it and uses live costs and
 *  pack sizes — the snapshot fixes the price, not the shopping. */
export type QuoteSnapshot = {
  version: 1;
  takenAt: string;
  event: EventInput & {
    clientName: string;
    eventDate: string;
    venue: string | null;
  };
  package: {
    id: string;
    name: string;
    style: string;
    blurb: string | null;
    includes: string[];
    serviceHours: number;
    staffPerGuests: number | null;
    /** The tier price at the time, so an override can still show the list price. */
    listPricePerHead: Cents;
  };
  menu: {
    id: string;
    name: string;
    portionsPerHead: number;
    dietaryTags: DietaryTag[];
    recipe: {
      id: string;
      name: string;
      yieldPortions: number;
      items: {
        ingredientId: string;
        name: string;
        unit: Unit;
        qty: number;
        costPerUnit: Cents;
      }[];
    } | null;
  }[];
  addons: Pick<Addon, "id" | "name" | "price" | "pricingBasis">[];
  lines: QuoteLine[];
  totals: {
    subtotal: Cents;
    discount: Cents;
    total: Cents;
    gst: Cents;
    food: Cents;
    staff: Cents;
    margin: number;
  };
  settings: Settings;
};

export function buildSnapshot(input: {
  pkg: Package;
  event: EventInput & { clientName: string; eventDate: string; venue: string | null };
  pricePerHead: Cents;
  discount: Cents;
  addons: Addon[];
  lines: QuoteLine[];
  settings: Settings;
  cat: Catalogue;
  takenAt?: Date;
}): QuoteSnapshot {
  const { pkg, event, discount, addons, lines, settings, cat } = input;

  const totals = quoteTotals({ lines, discount, pkg, event, settings, cat });

  return {
    version: 1,
    takenAt: (input.takenAt ?? new Date()).toISOString(),
    event: {
      clientName: event.clientName,
      eventDate: event.eventDate,
      venue: event.venue,
      guests: event.guests,
      style: event.style,
      durationHours: event.durationHours,
      dietary: event.dietary,
    },
    package: {
      id: pkg.id,
      name: pkg.name,
      style: pkg.style,
      blurb: pkg.blurb,
      includes: pkg.includes,
      serviceHours: pkg.serviceHours,
      staffPerGuests: pkg.staffPerGuests,
      listPricePerHead: tierPrice(pkg, event.guests),
    },
    menu: pkg.menuItemIds.flatMap((id) => {
      const mi = cat.menuItems.get(id);
      if (!mi) return [];
      const recipe = mi.recipeId ? cat.recipes.get(mi.recipeId) : undefined;

      return [
        {
          id: mi.id,
          name: mi.name,
          portionsPerHead: mi.portionsPerHead,
          dietaryTags: mi.dietaryTags,
          recipe: recipe
            ? {
                id: recipe.id,
                name: recipe.name,
                yieldPortions: recipe.yieldPortions,
                items: recipe.items.flatMap((item) => {
                  const ing = cat.ingredients.get(item.ingredientId);
                  if (!ing) return [];
                  return [
                    {
                      ingredientId: ing.id,
                      name: ing.name,
                      unit: ing.unit,
                      qty: item.qty,
                      costPerUnit: ing.costPerUnit,
                    },
                  ];
                }),
              }
            : null,
        },
      ];
    }),
    addons: addons.map((a) => ({
      id: a.id,
      name: a.name,
      price: a.price,
      pricingBasis: a.pricingBasis,
    })),
    lines,
    totals: {
      subtotal: totals.subtotal,
      discount: totals.discount,
      total: totals.total,
      gst: totals.gst,
      food: foodCostPerHead(pkg, cat) * event.guests,
      staff: staffCost(pkg, event.guests, settings),
      margin: totals.margin,
    },
    settings,
  };
}
