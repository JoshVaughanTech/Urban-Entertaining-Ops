import { describe, expect, it } from "vitest";

import { seedCatalogue, seedSettings, toCents } from "@/lib/seed/fixtures";
import { buildCatalogue } from "./catalogue";
import { fitPackage, hasHardIssue, rankPackages } from "./fit";
import { money, moneyPrecise, percent, shortDate, addDays } from "./format";
import { groupBySupplier, ingredientRollup, rollupTotalCost } from "./ordering";
import {
  buildQuoteLines,
  extraHours,
  foodCostPerHead,
  gstComponent,
  isMarginHealthy,
  menuItemCostPerHead,
  quoteTotals,
  recipeCostPerPortion,
  staffCost,
  staffCount,
  tierPrice,
} from "./pricing";
import type { EventInput } from "./types";

/* Expected values were produced by running the approved mockup's own
   calculation functions over its own data (scratchpad/golden.mjs). They are
   in dollars there, cents here, so the port is checked against the design
   authority rather than against itself. */

const cat = seedCatalogue();
const settings = seedSettings;

const pkg = (slug: string) => {
  const p = cat.packages.get(slug);
  if (!p) throw new Error(`no package ${slug}`);
  return p;
};

const recipe = (slug: string) => {
  const r = cat.recipes.get(slug);
  if (!r) throw new Error(`no recipe ${slug}`);
  return r;
};

const event = (over: Partial<EventInput> = {}): EventInput => ({
  guests: 80,
  style: "cocktail",
  durationHours: 3,
  dietary: [],
  ...over,
});

describe("tierPrice", () => {
  const cases: [string, number, number][] = [
    ["cocktail_classic", 1, 68],
    ["cocktail_classic", 60, 68],
    ["cocktail_classic", 61, 62],
    ["cocktail_classic", 120, 62],
    ["cocktail_classic", 121, 56],
    ["cocktail_signature", 60, 89],
    ["cocktail_signature", 80, 82],
    ["cocktail_signature", 180, 76],
    ["grazing", 50, 38],
    ["grazing", 60, 34],
    ["seated_three", 40, 145],
    ["seated_three", 80, 135],
    ["seated_three", 120, 128],
    ["corporate_lunch", 30, 32],
    ["corporate_lunch", 200, 27],
  ];

  it.each(cases)("%s at %i guests is $%i per head", (slug, guests, dollars) => {
    expect(tierPrice(pkg(slug), guests)).toBe(toCents(dollars));
  });

  it("falls back to the last tier above the top bracket", () => {
    expect(tierPrice(pkg("cocktail_classic"), 999)).toBe(toCents(56));
    expect(tierPrice(pkg("seated_three"), 5_000)).toBe(toCents(128));
  });

  it("does not care what order the tiers arrive in", () => {
    const scrambled = { ...pkg("cocktail_classic") };
    scrambled.tiers = [...scrambled.tiers].reverse();
    expect(tierPrice(scrambled, 61)).toBe(toCents(62));
  });
});

describe("recipeCostPerPortion", () => {
  const cases: [string, number][] = [
    ["beef_crostini", 1.8005],
    ["salmon_blini", 0.923],
    ["prawn_skewer", 1.458],
    ["chicken_pie", 0.940556],
    ["fig_tart", 1.623333],
    ["choc_tart", 0.941667],
    ["grazing", 9.35],
    ["beef_main", 14.21],
    ["salmon_main", 8.744],
    ["entree_tomato", 4.55],
    ["corp_sandwich", 4.98],
  ];

  it.each(cases)("%s costs $%s per portion", (slug, dollars) => {
    expect(recipeCostPerPortion(recipe(slug), cat)).toBeCloseTo(dollars * 100, 3);
  });

  it("returns zero rather than dividing by a zero yield", () => {
    const broken = { ...recipe("grazing"), yieldPortions: 0 };
    expect(recipeCostPerPortion(broken, cat)).toBe(0);
  });

  it("ignores an ingredient that no longer exists", () => {
    const orphan = {
      ...recipe("prawn_skewer"),
      items: [...recipe("prawn_skewer").items, { ingredientId: "does_not_exist", qty: 99 }],
    };
    expect(recipeCostPerPortion(orphan, cat)).toBeCloseTo(1.458 * 100, 3);
  });
});

describe("foodCostPerHead", () => {
  const cases: [string, number][] = [
    ["cocktail_classic", 7.119417],
    ["cocktail_signature", 9.519083],
    ["grazing", 9.35],
    ["seated_three", 28.445667],
    ["corporate_lunch", 5.921667],
  ];

  it.each(cases)("%s costs $%s of food per guest", (slug, dollars) => {
    expect(foodCostPerHead(pkg(slug), cat)).toBeCloseTo(dollars * 100, 3);
  });

  it("counts portions per head, not just the dish", () => {
    // beef_crostini is 1.5 per head at $1.8005 a portion.
    expect(menuItemCostPerHead("beef_crostini", cat)).toBeCloseTo(1.8005 * 1.5 * 100, 3);
  });

  it("treats a menu item with no recipe as uncosted rather than throwing", () => {
    const stripped = buildCatalogue({
      suppliers: [...cat.suppliers.values()],
      ingredients: [...cat.ingredients.values()],
      recipes: [...cat.recipes.values()],
      menuItems: [...cat.menuItems.values()].map((m) =>
        m.id === "grazing" ? { ...m, recipeId: null } : m,
      ),
      packages: [...cat.packages.values()],
      addons: [...cat.addons.values()],
    });
    expect(foodCostPerHead(pkg("grazing"), stripped)).toBe(0);
  });
});

describe("staffCost", () => {
  const cases: [string, number, number][] = [
    ["cocktail_classic", 30, 288],
    ["cocktail_classic", 60, 432],
    ["cocktail_classic", 80, 576],
    ["cocktail_classic", 110, 720],
    ["cocktail_signature", 45, 576],
    ["cocktail_signature", 80, 768],
    ["cocktail_signature", 110, 1152],
    ["seated_three", 60, 1200],
    ["seated_three", 80, 1680],
    ["seated_three", 120, 2400],
  ];

  it.each(cases)("%s at %i guests costs $%i of staff", (slug, guests, dollars) => {
    expect(staffCost(pkg(slug), guests, settings)).toBe(toCents(dollars));
  });

  it("is zero when the package carries no staff", () => {
    expect(staffCost(pkg("grazing"), 100, settings)).toBe(0);
    expect(staffCost(pkg("corporate_lunch"), 100, settings)).toBe(0);
    expect(staffCount(pkg("grazing"), 100)).toBe(0);
  });

  it("rounds staff up to whole people", () => {
    // 61 guests at 1 per 25 needs 3 staff, not 2.44.
    expect(staffCount(pkg("cocktail_classic"), 61)).toBe(3);
  });
});

describe("fitPackage", () => {
  it("reports no issues when the package fits", () => {
    expect(fitPackage(pkg("cocktail_classic"), event(), cat)).toEqual([]);
  });

  it("warns softly about a different service style", () => {
    const issues = fitPackage(pkg("grazing"), event({ style: "cocktail" }), cat);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "style", severity: "soft" });
    expect(hasHardIssue(issues)).toBe(false);
  });

  it("hard-blocks guest counts below the minimum and above the maximum", () => {
    const under = fitPackage(pkg("cocktail_classic"), event({ guests: 10 }), cat);
    expect(under).toContainEqual({
      code: "min_guests",
      severity: "hard",
      message: "Minimum 30 guests",
    });

    const over = fitPackage(pkg("seated_three"), event({ guests: 300, style: "seated" }), cat);
    expect(over).toContainEqual({
      code: "max_guests",
      severity: "hard",
      message: "Caps at 120 guests",
    });
  });

  /* The mockup blocks exactly one dietary combination: vegan on grazing. */
  it("blocks vegan on the grazing table and nothing else", () => {
    const vegan = event({ dietary: ["vegan"], style: null });
    const blocked = [...cat.packages.values()].filter((p) =>
      hasHardIssue(fitPackage(p, { ...vegan, guests: 45 }, cat)),
    );
    expect(blocked.map((p) => p.id)).toEqual(["grazing"]);
  });

  it("allows every other diet on every package", () => {
    for (const diet of ["vegetarian", "gf", "df", "halal", "nut_free"] as const) {
      const blocked = [...cat.packages.values()].filter((p) =>
        hasHardIssue(fitPackage(p, event({ dietary: [diet], style: null, guests: 45 }), cat)),
      );
      expect(blocked, `${diet} should not block any package`).toEqual([]);
    }
  });

  it("ranks clean fits first and blocked packages last", () => {
    const ranked = rankPackages([...cat.packages.values()], event({ guests: 80 }), cat);

    expect(ranked[0]?.issues).toEqual([]);
    expect(ranked[0]?.blocked).toBe(false);

    const firstBlocked = ranked.findIndex((r) => r.blocked);
    if (firstBlocked !== -1) {
      expect(ranked.slice(firstBlocked).every((r) => r.blocked)).toBe(true);
    }
  });

  it("puts a package with one hard issue behind one with two soft issues", () => {
    // 10 guests: below every minimum except corporate_lunch.
    const ranked = rankPackages([...cat.packages.values()], event({ guests: 10 }), cat);
    expect(ranked[0]?.pkg.id).toBe("corporate_lunch");
    expect(ranked.slice(1).every((r) => r.blocked)).toBe(true);
  });
});

describe("quote lines and totals", () => {
  const worked = () => {
    const p = pkg("cocktail_signature");
    const ev = event({ guests: 80, durationHours: 5 });
    const bar = cat.addons.get("bar");
    if (!bar) throw new Error("no bar addon");

    const lines = buildQuoteLines({
      pkg: p,
      event: ev,
      pricePerHead: tierPrice(p, ev.guests),
      addons: [bar],
      settings,
    });

    return { p, ev, lines };
  };

  it("builds the package line, then add-ons, then extended service", () => {
    const { lines } = worked();
    expect(lines.map((l) => l.source)).toEqual(["package", "addon", "extended_service"]);
    expect(lines[0]).toMatchObject({
      label: "Cocktail — Signature — 80 guests",
      qty: 80,
      unitPrice: toCents(82),
    });
    expect(lines[1]).toMatchObject({ label: "Bar service", qty: 80, unitPrice: toCents(18) });
  });

  it("charges extended service as extra hours × staff at the charge-out rate", () => {
    const { lines, p, ev } = worked();
    expect(extraHours(p, ev)).toBe(1);
    expect(staffCount(p, ev.guests)).toBe(4);
    expect(lines[2]).toMatchObject({
      label: "Extended service (1h × 4 staff)",
      qty: 4,
      unitPrice: 7_680,
    });
    // The mockup's float arithmetic lands on $307.20000000000005; cents are exact.
    expect(lines[2]!.qty * lines[2]!.unitPrice).toBe(toCents(307.2));
  });

  it("omits extended service when the package has no staff", () => {
    const p = pkg("grazing");
    const lines = buildQuoteLines({
      pkg: p,
      event: event({ guests: 45, durationHours: 8, style: "grazing" }),
      pricePerHead: tierPrice(p, 45),
      addons: [],
      settings,
    });
    expect(lines.map((l) => l.source)).toEqual(["package"]);
  });

  it("charges a flat add-on once and a per-head add-on per guest", () => {
    const styling = cat.addons.get("styling");
    const dessert = cat.addons.get("dessert");
    if (!styling || !dessert) throw new Error("missing addons");

    const lines = buildQuoteLines({
      pkg: pkg("cocktail_classic"),
      event: event({ guests: 50 }),
      pricePerHead: toCents(68),
      addons: [styling, dessert],
      settings,
    });

    expect(lines[1]).toMatchObject({ qty: 1, unitPrice: toCents(650) });
    expect(lines[2]).toMatchObject({ qty: 50, unitPrice: toCents(12) });
  });

  it("totals to the mockup's worked example", () => {
    const { lines, p, ev } = worked();
    const totals = quoteTotals({
      lines,
      discount: toCents(250),
      pkg: p,
      event: ev,
      settings,
      cat,
    });

    expect(totals.subtotal).toBe(toCents(8_307.2));
    expect(totals.total).toBe(toCents(8_057.2));
    expect(totals.food).toBeCloseTo(761.526667 * 100, 2);
    expect(totals.staff).toBe(toCents(768));
    expect(totals.margin).toBeCloseTo(0.810166, 6);
    expect(totals.hasUncostedLines).toBe(false);
  });

  it("takes GST out of a GST-inclusive total, not on top of it", () => {
    expect(gstComponent(toCents(1_100), 0.1)).toBeCloseTo(toCents(100), 6);
    expect(gstComponent(0, 0.1)).toBe(0);
    expect(gstComponent(toCents(500), 0)).toBe(0);
  });

  it("flags custom lines as uncosted", () => {
    const p = pkg("cocktail_classic");
    const ev = event();
    const lines = buildQuoteLines({
      pkg: p,
      event: ev,
      pricePerHead: toCents(62),
      addons: [],
      settings,
      customLines: [{ label: "Late-night pizza run", qty: 1, unitPrice: toCents(400) }],
    });

    const totals = quoteTotals({ lines, discount: 0, pkg: p, event: ev, settings, cat });
    expect(totals.hasUncostedLines).toBe(true);
    expect(totals.subtotal).toBe(toCents(62 * 80 + 400));
  });

  it("does not divide by zero when a quote totals nothing", () => {
    const p = pkg("cocktail_classic");
    const ev = event({ guests: 80 });
    const totals = quoteTotals({
      lines: buildQuoteLines({ pkg: p, event: ev, pricePerHead: 0, addons: [], settings }),
      discount: 0,
      pkg: p,
      event: ev,
      settings,
      cat,
    });
    expect(totals.total).toBe(0);
    expect(totals.margin).toBe(0);
  });

  it("flags a margin under 55%", () => {
    expect(isMarginHealthy(0.81)).toBe(true);
    expect(isMarginHealthy(0.55)).toBe(true);
    expect(isMarginHealthy(0.549)).toBe(false);
  });
});

describe("ingredientRollup", () => {
  /* The seed's two confirmed September events — the Phase 4 acceptance case. */
  const confirmed = [
    { id: "q1", ref: "UE-1042", guests: 110, packageId: "cocktail_signature" },
    { id: "q2", ref: "UE-1046", guests: 60, packageId: "seated_three" },
  ];

  const expected: Record<string, { needed: number; packs: number; order: number; cost: number }> = {
    beef_eye: { needed: 15.7125, packs: 7, order: 17.5, cost: 1_085 },
    brie: { needed: 4.466667, packs: 5, order: 5, cost: 210 },
    butter: { needed: 4.291667, packs: 1, order: 5, cost: 75 },
    chicken: { needed: 6.416667, packs: 2, order: 10, cost: 145 },
    choc: { needed: 3.541667, packs: 2, order: 5, cost: 120 },
    cream: { needed: 7.804167, packs: 4, order: 8, cost: 43.2 },
    eggs: { needed: 6.979167, packs: 1, order: 15, cost: 102 },
    figs: { needed: 2.2, packs: 2, order: 4, cost: 72 },
    heirloom: { needed: 16.2, packs: 5, order: 20, cost: 240 },
    lemon: { needed: 3.725, packs: 1, order: 5, cost: 24 },
    potato: { needed: 12, packs: 2, order: 20, cost: 104 },
    prawns: { needed: 4.4, packs: 5, order: 5, cost: 170 },
    prosciutto: { needed: 0.916667, packs: 1, order: 1, cost: 58 },
    puff: { needed: 6.325, packs: 5, order: 7.5, cost: 82.5 },
    rocket: { needed: 2.8125, packs: 3, order: 3, cost: 48 },
    salmon: { needed: 14.1, packs: 5, order: 15, cost: 570 },
    sourdough: { needed: 14.25, packs: 15, order: 15, cost: 97.5 },
  };

  const { lines, warnings } = ingredientRollup(confirmed, cat);

  it("produces one line per distinct ingredient", () => {
    expect(lines).toHaveLength(17);
    expect(warnings).toEqual([]);
  });

  it.each(Object.entries(expected))("%s matches the mockup", (id, want) => {
    const line = lines.find((l) => l.ingredientId === id);
    expect(line, `no rollup line for ${id}`).toBeDefined();
    expect(line!.neededQty).toBeCloseTo(want.needed, 5);
    expect(line!.packs).toBe(want.packs);
    expect(line!.orderQty).toBeCloseTo(want.order, 5);
    expect(line!.cost).toBeCloseTo(toCents(want.cost), 2);
  });

  it("totals the same as the mockup", () => {
    expect(rollupTotalCost(lines)).toBeCloseTo(toCents(3_246.2), 2);
  });

  it("rounds up to whole packs", () => {
    // 15.7125kg of beef in 2.5kg packs is 7 packs, so 17.5kg gets bought.
    const beef = lines.find((l) => l.ingredientId === "beef_eye");
    expect(beef?.packs).toBe(7);
    expect(beef?.orderQty).toBe(17.5);
  });

  it("records which quotes drove each line", () => {
    expect(lines.find((l) => l.ingredientId === "beef_eye")?.quoteRefs.sort()).toEqual([
      "UE-1042",
      "UE-1046",
    ]);
    // Prawns only appear in the cocktail package.
    expect(lines.find((l) => l.ingredientId === "prawns")?.quoteRefs).toEqual(["UE-1042"]);
  });

  it("changes when a confirmed quote's guest count changes", () => {
    const more = ingredientRollup(
      [{ ...confirmed[0]!, guests: 220 }, confirmed[1]!],
      cat,
    );
    // Prawns come only from the cocktail package, so doubling that quote's
    // guests doubles the prawns — and pushes the order from 5 packs to 9.
    const before = lines.find((l) => l.ingredientId === "prawns")!;
    const after = more.lines.find((l) => l.ingredientId === "prawns")!;
    expect(after.neededQty).toBeCloseTo(before.neededQty * 2, 5);
    expect(after.packs).toBe(9);
  });

  it("returns nothing for an empty window", () => {
    const empty = ingredientRollup([], cat);
    expect(empty.lines).toEqual([]);
    expect(rollupTotalCost(empty.lines)).toBe(0);
  });

  it("surfaces a menu item with no recipe instead of dropping it", () => {
    const broken = buildCatalogue({
      suppliers: [...cat.suppliers.values()],
      ingredients: [...cat.ingredients.values()],
      recipes: [...cat.recipes.values()],
      menuItems: [...cat.menuItems.values()].map((m) =>
        m.id === "prawn_skewer" ? { ...m, recipeId: null } : m,
      ),
      packages: [...cat.packages.values()],
      addons: [...cat.addons.values()],
    });

    const { lines: got, warnings: warned } = ingredientRollup(confirmed, broken);
    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatchObject({ code: "no_recipe", quoteRefs: ["UE-1042"] });
    expect(got.find((l) => l.ingredientId === "prawns")).toBeUndefined();
  });

  it("groups by supplier, cheapest bookkeeping first", () => {
    const groups = groupBySupplier(lines, cat);
    expect(groups.map((g) => g.supplierName)).toEqual([
      "Bidfood",
      "Calendar Cheese",
      "Damian Pike",
      "Meatsmith",
      "Ocean Made",
      "Tivoli Road",
    ]);
    expect(groups.every((g) => g.contactEmail === null)).toBe(true);
    expect(groups.reduce((s, g) => s + g.cost, 0)).toBeCloseTo(rollupTotalCost(lines), 2);
  });
});

describe("formatting", () => {
  it("shows whole dollars in lists and totals", () => {
    expect(money(toCents(8_057.2))).toBe("$8,057");
    expect(money(toCents(56))).toBe("$56");
    expect(money(0)).toBe("$0");
  });

  it("shows cents where they matter", () => {
    expect(moneyPrecise(180.05)).toBe("$1.80");
    expect(moneyPrecise(toCents(9.519083))).toBe("$9.52");
  });

  it("renders percentages the way the margin panel does", () => {
    expect(percent(0.810166)).toBe("81%");
    expect(percent(0.549)).toBe("55%");
  });

  it("formats a date without slipping a day", () => {
    expect(shortDate("2026-09-12")).toBe("12 Sept");
    expect(addDays("2026-09-12", 14)).toBe("2026-09-26");
    expect(addDays("2026-12-28", 5)).toBe("2027-01-02");
  });
});
