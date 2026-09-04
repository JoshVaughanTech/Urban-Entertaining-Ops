/* A fuller book of work, for demonstrating the app.
 *
 * The base seed loads the catalogue and the mockup's three quotes — enough to
 * prove the calculations, too thin to show anyone. This adds a realistic
 * spread: every status populated, events either side of today so the ordering
 * window has something in it, and a mix of overrides, discounts, add-ons and
 * dietary requirements so the screens look like a working business.
 *
 * Written through the real createQuote / sendQuote / setQuoteStatus paths
 * rather than by inserting rows, so every quote is genuinely valid — snapshots
 * frozen, lines derived, references allocated in order.
 *
 * Dates are relative to today, so the demo never goes stale. */

import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

import * as s from "@/lib/db/schema";
import { loadCatalogue, loadSettings } from "@/lib/data/catalogue";
import { createQuote, sendQuote, setQuoteStatus } from "@/lib/data/quotes-write";
import { addDays, todayISO } from "@/lib/engine/format";
import type { DietaryTag, Style } from "@/lib/engine/types";
import type { QuoteStatus } from "@/lib/quotes/types";
import { seedDatabase } from "./run";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = PgDatabase<any, any, any>;

type DemoQuote = {
  clientName: string;
  contactEmail: string | null;
  /** Days from today. Negative is in the past. */
  dayOffset: number;
  guests: number;
  packageSlug: string;
  style: Style;
  durationHours: number;
  venue: string | null;
  dietary: DietaryTag[];
  addonSlugs: string[];
  /** Dollars. Omit to take the tier price. */
  pricePerHead?: number;
  discount?: number;
  customLines?: { label: string; qty: number; unitPrice: number }[];
  notes?: string;
  status: QuoteStatus;
};

const DEMO: DemoQuote[] = [
  /* ── confirmed, upcoming: these drive the ordering screen ───────────── */
  {
    clientName: "Alderman & Wyatt — partner dinner",
    contactEmail: "events@aldermanwyatt.example",
    dayOffset: 6,
    guests: 48,
    packageSlug: "seated_three",
    style: "seated",
    durationHours: 5,
    venue: "South Melbourne",
    dietary: ["gf"],
    addonSlugs: [],
    status: "confirmed",
  },
  {
    clientName: "Marchetti wedding",
    contactEmail: "sofia.marchetti@example.com",
    dayOffset: 9,
    guests: 130,
    packageSlug: "cocktail_signature",
    style: "cocktail",
    durationHours: 5,
    venue: "Abbotsford Convent",
    dietary: ["vegetarian", "gf"],
    addonSlugs: ["bar", "styling"],
    discount: 400,
    notes: "Ceremony 4pm, canapés from 5.30.",
    status: "confirmed",
  },
  {
    clientName: "Northcote Studios — launch",
    contactEmail: "hello@northcotestudios.example",
    dayOffset: 12,
    guests: 70,
    packageSlug: "grazing",
    style: "grazing",
    durationHours: 3,
    venue: "Northcote",
    dietary: [],
    addonSlugs: ["styling"],
    status: "confirmed",
  },
  {
    clientName: "Beaumont Legal — end of financial year",
    contactEmail: "ops@beaumontlegal.example",
    dayOffset: 17,
    guests: 95,
    packageSlug: "cocktail_classic",
    style: "cocktail",
    durationHours: 4,
    venue: "Collins Street",
    dietary: ["nut_free"],
    addonSlugs: ["bar"],
    pricePerHead: 58,
    notes: "Repeat client — held last year's rate.",
    status: "confirmed",
  },

  /* ── sent, waiting on the client ────────────────────────────────────── */
  {
    clientName: "Halstead & Rowe — client lunch",
    contactEmail: "reception@halsteadrowe.example",
    dayOffset: 21,
    guests: 24,
    packageSlug: "corporate_lunch",
    style: "corporate",
    durationHours: 2,
    venue: "Docklands",
    dietary: ["vegetarian", "df"],
    addonSlugs: [],
    status: "sent",
  },
  {
    clientName: "Fitzroy Print Co. — 20 years",
    contactEmail: "anna@fitzroyprint.example",
    dayOffset: 34,
    guests: 85,
    packageSlug: "cocktail_signature",
    style: "cocktail",
    durationHours: 4,
    venue: "Fitzroy",
    dietary: ["vegan"],
    addonSlugs: ["bar", "dessert"],
    status: "sent",
  },
  {
    clientName: "Ferngrove Estate — spring open day",
    contactEmail: "cellar@ferngrove.example",
    dayOffset: 45,
    guests: 140,
    packageSlug: "grazing",
    style: "grazing",
    durationHours: 4,
    venue: "Yarra Valley",
    dietary: [],
    addonSlugs: ["styling"],
    customLines: [{ label: "Travel — Yarra Valley return", qty: 1, unitPrice: 480 }],
    status: "sent",
  },

  /* ── drafts, still being written ────────────────────────────────────── */
  {
    clientName: "Templeton 60th",
    contactEmail: null,
    dayOffset: 52,
    guests: 60,
    packageSlug: "cocktail_classic",
    style: "cocktail",
    durationHours: 3,
    venue: "Kew",
    dietary: ["gf", "df"],
    addonSlugs: ["bar"],
    notes: "Waiting on final numbers.",
    status: "draft",
  },
  {
    clientName: "Carlton Chambers — welcome drinks",
    contactEmail: "practice@carltonchambers.example",
    dayOffset: 28,
    guests: 40,
    packageSlug: "cocktail_classic",
    style: "cocktail",
    durationHours: 3,
    venue: "Carlton",
    dietary: [],
    addonSlugs: [],
    status: "draft",
  },
  {
    clientName: "Whitlock Family — christening",
    contactEmail: null,
    dayOffset: 70,
    guests: 35,
    packageSlug: "grazing",
    style: "grazing",
    durationHours: 3,
    venue: "Hawthorn",
    dietary: ["halal"],
    addonSlugs: [],
    status: "draft",
  },

  /* ── didn't come off ────────────────────────────────────────────────── */
  {
    clientName: "Brunswick Athletic — presentation night",
    contactEmail: "committee@brunswickathletic.example",
    dayOffset: 30,
    guests: 110,
    packageSlug: "cocktail_classic",
    style: "cocktail",
    durationHours: 4,
    venue: "Brunswick",
    dietary: [],
    addonSlugs: [],
    pricePerHead: 52,
    notes: "Went with a cheaper quote.",
    status: "declined",
  },
  {
    clientName: "Sable & Finch — store opening",
    contactEmail: "marketing@sablefinch.example",
    dayOffset: 26,
    guests: 55,
    packageSlug: "cocktail_signature",
    style: "cocktail",
    durationHours: 3,
    venue: "Armadale",
    dietary: ["vegetarian"],
    addonSlugs: ["bar"],
    status: "declined",
  },
  {
    clientName: "Ashgrove Partners — roadshow",
    contactEmail: "events@ashgrove.example",
    dayOffset: 19,
    guests: 65,
    packageSlug: "corporate_lunch",
    style: "corporate",
    durationHours: 2,
    venue: "Southbank",
    dietary: [],
    addonSlugs: [],
    notes: "Postponed indefinitely.",
    status: "cancelled",
  },

  /* ── already happened, so the book has history ──────────────────────── */
  {
    clientName: "Prentice & Hall — winter dinner",
    contactEmail: "office@prenticehall.example",
    dayOffset: -12,
    guests: 52,
    packageSlug: "seated_three",
    style: "seated",
    durationHours: 5,
    venue: "East Melbourne",
    dietary: ["gf"],
    addonSlugs: ["bar"],
    status: "confirmed",
  },
  {
    clientName: "Rossmoyne Gallery — retrospective",
    contactEmail: "curator@rossmoyne.example",
    dayOffset: -26,
    guests: 90,
    packageSlug: "grazing",
    style: "grazing",
    durationHours: 3,
    venue: "Richmond",
    dietary: ["vegan", "gf"],
    addonSlugs: ["styling"],
    status: "confirmed",
  },
];

const MARKER = "Marchetti wedding";
const cents = (dollars: number) => Math.round(dollars * 100);

export type DemoReport = { created: number; skipped: boolean };

export async function seedDemo(db: Db): Promise<DemoReport> {
  await seedDatabase(db);

  // Idempotent: if the demo book is already here, leave it alone.
  const existing = await db
    .select({ id: s.events.id })
    .from(s.events)
    .where(eq(s.events.clientName, MARKER))
    .limit(1);

  if (existing.length > 0) return { created: 0, skipped: true };

  const cat = await loadCatalogue(db);
  const settings = await loadSettings(db);

  const packages = await db.select().from(s.packages);
  const addons = await db.select().from(s.addons);
  const packageId = (slug: string) => {
    const row = packages.find((p: { slug: string | null }) => p.slug === slug);
    if (!row) throw new Error(`demo seed: no package "${slug}"`);
    return row.id as string;
  };
  const addonId = (slug: string) => {
    const row = addons.find((a: { slug: string | null }) => a.slug === slug);
    if (!row) throw new Error(`demo seed: no add-on "${slug}"`);
    return row.id as string;
  };

  const today = todayISO();
  let created = 0;

  for (const q of DEMO) {
    const pkgId = packageId(q.packageSlug);
    const pkg = cat.packages.get(pkgId);
    if (!pkg) throw new Error(`demo seed: package ${q.packageSlug} missing from catalogue`);

    const { id } = await createQuote(
      db,
      {
        event: {
          clientName: q.clientName,
          contactEmail: q.contactEmail,
          eventDate: addDays(today, q.dayOffset),
          guests: q.guests,
          style: q.style,
          durationHours: q.durationHours,
          venue: q.venue,
          dietary: q.dietary,
          notes: q.notes ?? null,
        },
        packageId: pkgId,
        pricePerHead:
          q.pricePerHead !== undefined
            ? cents(q.pricePerHead)
            : (pkg.tiers.find((t) => q.guests <= t.upToGuests) ??
                pkg.tiers[pkg.tiers.length - 1])!.pricePerHead,
        discount: cents(q.discount ?? 0),
        addonIds: q.addonSlugs.map(addonId),
        customLines: (q.customLines ?? []).map((l) => ({
          label: l.label,
          qty: l.qty,
          unitPrice: cents(l.unitPrice),
        })),
      },
      cat,
      settings,
      null,
    );

    /* Move it to where it should be, through the real transitions. */
    if (q.status !== "draft") {
      if (q.status === "cancelled") {
        await setQuoteStatus(db, id, "cancelled");
      } else {
        await sendQuote(db, id, cat, settings);
        if (q.status !== "sent") await setQuoteStatus(db, id, q.status, { cat, settings });
      }
    }

    created += 1;
  }

  return { created, skipped: false };
}
