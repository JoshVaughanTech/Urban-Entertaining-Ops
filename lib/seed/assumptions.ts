/* Everything the seed needs that `seed/*.json` does not contain.
 *
 * The JSON in `seed/` is the client-supplied placeholder pack and stays
 * byte-for-byte as delivered. Anything derived, inferred or assumed lives
 * here instead, so it is all reviewable in one place — and so replacing the
 * placeholder data with real data later means replacing JSON, not hunting
 * through a seed script for invented values.
 *
 * Nothing here is fabricated from nothing: each value is traced to the
 * mockup below. */

import type { DietaryTag } from "@/lib/engine/types";

/* ── settings ───────────────────────────────────────────────────────────
   Every value is read off the approved mockup:
     staffHourlyCost   — STAFF_RATE = 48
     staffHourlyCharge — the mockup charges extended service at
                         STAFF_RATE * 1.6 = 76.80
     gstRate           — the mockup labels totals "inc. GST"; 10% is the
                         Australian rate
     validity/deposit  — "Valid for 14 days. A 30% deposit confirms your date."
   Open question 5 for Josh: confirm the real cost and charge-out rates. */

export const SETTINGS = {
  staffHourlyCost: 4_800,
  staffHourlyCharge: 7_680,
  gstRate: "0.1000",
  quoteValidityDays: 14,
  depositPct: 30,
  quoteRefPrefix: "UE",
  /* The mockup generates new refs from 1050; its seed quotes run 1042–1049. */
  quoteRefNext: 1_050,
} as const;

/* ── dietary capability ─────────────────────────────────────────────────
   ASSUMPTION, needs Josh's confirmation.

   `seed/menu_items.json` carries no dietary tags at all, so on the letter of
   the data model no package can satisfy any dietary requirement. The mockup,
   however, blocks exactly one combination — vegan on the grazing table — and
   words it "Grazing has no vegan build yet", which says the other packages
   *do* have builds for it.

   So menu item tags stay empty (that is what the data says) and package-level
   adaptability carries the behaviour: every package can be adapted for every
   diet, except grazing, which cannot do vegan. That reproduces the mockup
   exactly. Replace this with the real per-package capability once Josh
   confirms which packages genuinely have which builds. */

const ALL_DIETS: DietaryTag[] = ["vegetarian", "vegan", "gf", "df", "halal", "nut_free"];

export const PACKAGE_ADAPTABLE_DIETARY: Record<string, DietaryTag[]> = {
  cocktail_classic: ALL_DIETS,
  cocktail_signature: ALL_DIETS,
  grazing: ALL_DIETS.filter((d) => d !== "vegan"),
  seated_three: ALL_DIETS,
  corporate_lunch: ALL_DIETS,
};

/* ── suppliers ──────────────────────────────────────────────────────────
   Names come from `seed/ingredients.json`. contact_email is deliberately
   null: inventing a supplier address would send real purchase orders to a
   made-up inbox. Josh supplies these before Phase 4 can send anything. */

export const supplierSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/* ── seed events and quotes ─────────────────────────────────────────────
   Straight from the mockup's SEED_QUOTES. The mockup has no event record,
   so style and duration are taken from the chosen package (the event was
   built to fit it) and contact email, venue and dietary are left empty
   rather than invented. The two confirmed September events are the
   Phase 4 acceptance case. */

export type SeedQuote = {
  ref: string;
  clientName: string;
  eventDate: string;
  guests: number;
  packageSlug: string;
  pricePerHead: number;
  addonSlugs: string[];
  status: "draft" | "sent" | "confirmed" | "declined" | "cancelled";
};

export const SEED_QUOTES: SeedQuote[] = [
  {
    ref: "UE-1042",
    clientName: "Harper & Co. Wedding",
    eventDate: "2026-09-12",
    guests: 110,
    packageSlug: "cocktail_signature",
    pricePerHead: 8_200,
    addonSlugs: ["bar"],
    status: "confirmed",
  },
  {
    ref: "UE-1046",
    clientName: "Rothwell Partners — EOFY",
    eventDate: "2026-09-11",
    guests: 60,
    packageSlug: "seated_three",
    pricePerHead: 13_500,
    addonSlugs: [],
    status: "confirmed",
  },
  {
    ref: "UE-1049",
    clientName: "Studio Nine launch",
    eventDate: "2026-09-18",
    guests: 45,
    packageSlug: "grazing",
    pricePerHead: 3_800,
    addonSlugs: ["styling"],
    status: "sent",
  },
];
