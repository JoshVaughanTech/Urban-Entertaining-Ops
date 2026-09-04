/* The client-facing quote, as one plain object.
 *
 * The preview screen, the PDF and the public link all render from this, so
 * the three can never drift apart. Pure: hand it a quote, a catalogue and
 * settings, get back everything the client should see.
 *
 * A sent quote is built from its snapshot; a draft from live data. That is
 * the whole point of the snapshot — the client's copy stops moving. */

import { addDays, todayISO } from "@/lib/engine/format";
import { foodCostPerHead, quoteTotals, staffCost, tierPrice } from "@/lib/engine/pricing";
import type { Catalogue, Cents, DietaryTag, QuoteLine, Settings } from "@/lib/engine/types";
import { DIETARY_LABELS } from "@/lib/engine/types";
import type { QuoteDetail } from "@/lib/data/quotes";

export type QuoteDocumentLine = {
  label: string;
  qty: number;
  unitPrice: Cents;
  amount: Cents;
  /** The mockup only shows "qty × unit" when there is more than one. */
  showUnit: boolean;
};

export type QuoteDocument = {
  brand: string;
  title: string;
  ref: string;
  clientName: string;
  eventDate: string;
  guests: number;
  venue: string | null;
  packageName: string | null;
  lines: QuoteDocumentLine[];
  discount: Cents;
  total: Cents;
  gst: Cents;
  includes: string[];
  menu: string[];
  dietary: string[];
  validUntil: string;
  depositPct: number;
  depositAmount: Cents;
  terms: string;
  /** Internal only — never rendered on the client-facing copy. */
  internal: {
    food: Cents;
    staff: Cents;
    margin: number;
    listPricePerHead: Cents;
    pricePerHead: Cents;
    hasUncostedLines: boolean;
  };
};

const BRAND = "Urban Entertaining";

const toDocLine = (line: QuoteLine): QuoteDocumentLine => ({
  label: line.label,
  qty: line.qty,
  unitPrice: line.unitPrice,
  amount: line.qty * line.unitPrice,
  showUnit: line.qty > 1,
});

export function buildQuoteDocument(input: {
  quote: QuoteDetail;
  cat: Catalogue;
  settings: Settings;
}): QuoteDocument {
  const { quote, cat, settings } = input;
  const snapshot = quote.snapshot;

  /* Settings are frozen into the snapshot too, so validity and deposit terms
     stay as they were quoted even if the business changes them later. */
  const effectiveSettings = snapshot?.settings ?? settings;

  const lines = quote.lines.map(toDocLine);

  const totals = snapshot
    ? snapshot.totals
    : quoteTotals({
        lines: quote.lines,
        discount: quote.discount,
        pkg: quote.packageId ? (cat.packages.get(quote.packageId) ?? null) : null,
        event: {
          guests: quote.event.guests,
          style: quote.event.style,
          durationHours: quote.event.durationHours,
          dietary: quote.event.dietary,
        },
        settings,
        cat,
      });

  const pkg = quote.packageId ? cat.packages.get(quote.packageId) : undefined;

  const includes = snapshot?.package.includes ?? pkg?.includes ?? [];

  const menu = snapshot
    ? snapshot.menu.map((item) => item.name)
    : (pkg?.menuItemIds.flatMap((id) => {
        const item = cat.menuItems.get(id);
        return item ? [item.name] : [];
      }) ?? []);

  /* Validity runs from the day it was sent, not from today — otherwise an
     old quote would quietly renew itself every time someone opened it. */
  const from = quote.sentAt ? quote.sentAt.toISOString().slice(0, 10) : todayISO();
  const validUntil = addDays(from, effectiveSettings.quoteValidityDays);

  const depositAmount = Math.round((totals.total * effectiveSettings.depositPct) / 100);

  const listPricePerHead =
    snapshot?.package.listPricePerHead ?? (pkg ? tierPrice(pkg, quote.event.guests) : 0);

  return {
    brand: BRAND,
    title: "Quotation",
    ref: quote.ref,
    clientName: quote.event.clientName,
    eventDate: quote.event.eventDate,
    guests: quote.event.guests,
    venue: quote.event.venue,
    packageName: snapshot?.package.name ?? pkg?.name ?? null,
    lines,
    discount: quote.discount,
    total: totals.total,
    gst: totals.gst,
    includes,
    menu,
    dietary: (quote.event.dietary as DietaryTag[]).map((tag) => DIETARY_LABELS[tag]),
    validUntil,
    depositPct: effectiveSettings.depositPct,
    depositAmount,
    terms:
      `Valid for ${effectiveSettings.quoteValidityDays} days. ` +
      `A ${effectiveSettings.depositPct}% deposit confirms your date.`,
    internal: {
      food: snapshot
        ? snapshot.totals.food
        : pkg
          ? foodCostPerHead(pkg, cat) * quote.event.guests
          : 0,
      staff: snapshot
        ? snapshot.totals.staff
        : pkg
          ? staffCost(pkg, quote.event.guests, settings)
          : 0,
      margin: totals.margin,
      listPricePerHead,
      pricePerHead: quote.pricePerHead,
      hasUncostedLines: quote.lines.some((l) => l.source === "custom"),
    },
  };
}
