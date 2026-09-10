import { desc, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

import * as s from "@/lib/db/schema";
import type { Catalogue, Cents, QuoteLine, Settings } from "@/lib/engine/types";
import { quoteTotals } from "@/lib/engine/pricing";
import type { QuoteSnapshot } from "@/lib/engine/snapshot";
import type { QuoteEventInput, QuoteStatus } from "@/lib/quotes/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = PgDatabase<any, any, any>;

export type QuoteListRow = {
  id: string;
  ref: string;
  status: QuoteStatus;
  clientName: string;
  eventDate: string;
  guests: number;
  packageId: string | null;
  packageName: string | null;
  total: Cents;
};

export type QuoteDetail = {
  id: string;
  ref: string;
  status: QuoteStatus;
  packageId: string | null;
  pricePerHead: Cents;
  discount: Cents;
  event: QuoteEventInput;
  addonIds: string[];
  lines: QuoteLine[];
  snapshot: QuoteSnapshot | null;
  publicToken: string | null;
  sentAt: Date | null;
  confirmedAt: Date | null;
};

const sumLines = (lines: { qty: string; unitPrice: number }[]): Cents =>
  lines.reduce((sum, l) => sum + Number(l.qty) * l.unitPrice, 0);

/** The quotes list. Totals come from the stored lines, so a sent quote shows
 *  what the client was told even if the catalogue has moved since. */
export async function loadQuoteList(db: Db): Promise<QuoteListRow[]> {
  const rows = await db
    .select({
      id: s.quotes.id,
      ref: s.quotes.ref,
      status: s.quotes.status,
      discount: s.quotes.discount,
      packageId: s.quotes.packageId,
      packageName: s.packages.name,
      clientName: s.events.clientName,
      eventDate: s.events.eventDate,
      guests: s.events.guests,
    })
    .from(s.quotes)
    .innerJoin(s.events, eq(s.quotes.eventId, s.events.id))
    .leftJoin(s.packages, eq(s.quotes.packageId, s.packages.id))
    .orderBy(desc(s.quotes.createdAt));

  if (rows.length === 0) return [];

  const allLines = await db
    .select({
      quoteId: s.quoteLines.quoteId,
      qty: s.quoteLines.qty,
      unitPrice: s.quoteLines.unitPrice,
    })
    .from(s.quoteLines);

  const linesByQuote = new Map<string, { qty: string; unitPrice: number }[]>();
  for (const line of allLines) {
    const list = linesByQuote.get(line.quoteId) ?? [];
    list.push({ qty: line.qty, unitPrice: line.unitPrice });
    linesByQuote.set(line.quoteId, list);
  }

  return rows.map((row: any) => ({
    id: row.id,
    ref: row.ref,
    status: row.status,
    clientName: row.clientName,
    eventDate: row.eventDate,
    guests: row.guests,
    packageId: row.packageId,
    packageName: row.packageName,
    total: sumLines(linesByQuote.get(row.id) ?? []) - row.discount,
  }));
}

export async function loadQuote(db: Db, id: string): Promise<QuoteDetail | null> {
  const [row] = await db
    .select()
    .from(s.quotes)
    .where(eq(s.quotes.id, id))
    .limit(1);

  if (!row) return null;

  const [event] = await db
    .select()
    .from(s.events)
    .where(eq(s.events.id, row.eventId))
    .limit(1);

  if (!event) return null;

  const [addonRows, lineRows] = await Promise.all([
    db.select().from(s.quoteAddons).where(eq(s.quoteAddons.quoteId, id)),
    db.select().from(s.quoteLines).where(eq(s.quoteLines.quoteId, id)).orderBy(s.quoteLines.sort),
  ]);

  return {
    id: row.id,
    ref: row.ref,
    status: row.status,
    packageId: row.packageId,
    pricePerHead: row.pricePerHead,
    discount: row.discount,
    publicToken: row.publicToken,
    sentAt: row.sentAt,
    confirmedAt: row.confirmedAt,
    snapshot: (row.snapshot as QuoteSnapshot | null) ?? null,
    event: {
      clientId: event.clientId,
      clientName: event.clientName,
      contactEmail: event.contactEmail,
      eventDate: event.eventDate,
      guests: event.guests,
      style: event.style,
      durationHours: Number(event.durationHours),
      venue: event.venue,
      dietary: event.dietary,
      notes: event.notes,
    },
    addonIds: addonRows.map((a: { addonId: string }) => a.addonId),
    lines: lineRows.map((l: typeof s.quoteLines.$inferSelect) => ({
      sort: l.sort,
      label: l.label,
      qty: Number(l.qty),
      unitPrice: l.unitPrice,
      source: l.source,
      ...(l.addonId ? { addonId: l.addonId } : {}),
    })),
  };
}

/** Confirmed quotes inside a date window — what Phase 4 orders against. */
export async function loadConfirmedInWindow(
  db: Db,
  from: string,
  to: string,
): Promise<{ id: string; ref: string; guests: number; packageId: string; clientName: string; eventDate: string }[]> {
  const rows = await db
    .select({
      id: s.quotes.id,
      ref: s.quotes.ref,
      guests: s.events.guests,
      packageId: s.quotes.packageId,
      clientName: s.events.clientName,
      eventDate: s.events.eventDate,
    })
    .from(s.quotes)
    .innerJoin(s.events, eq(s.quotes.eventId, s.events.id))
    .where(eq(s.quotes.status, "confirmed"));

  return rows
    .filter((r: any) => r.packageId && r.eventDate >= from && r.eventDate <= to)
    .map((r: any) => ({
      id: r.id,
      ref: r.ref,
      guests: r.guests,
      packageId: r.packageId as string,
      clientName: r.clientName,
      eventDate: r.eventDate,
    }));
}

/** Totals for one quote. A sent quote reads from its snapshot; a draft is
 *  costed live, because it is still moving. */
export function totalsFor(quote: QuoteDetail, cat: Catalogue, settings: Settings) {
  if (quote.snapshot) {
    const t = quote.snapshot.totals;
    return {
      subtotal: t.subtotal,
      discount: t.discount,
      total: t.total,
      gst: t.gst,
      food: t.food,
      staff: t.staff,
      margin: t.margin,
      hasUncostedLines: quote.lines.some((l) => l.source === "custom"),
    };
  }

  return quoteTotals({
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
}

/** The client's own view, found by the token in their link. Only ever
 *  returns a quote that has actually been sent and carries a snapshot —
 *  there is nothing to show a client otherwise, and a draft is not theirs
 *  to see. */
export async function loadQuoteByToken(db: Db, token: string): Promise<QuoteDetail | null> {
  if (!token) return null;

  const [row] = await db
    .select({ id: s.quotes.id })
    .from(s.quotes)
    .where(eq(s.quotes.publicToken, token))
    .limit(1);

  if (!row) return null;

  const quote = await loadQuote(db, row.id);
  if (!quote || !quote.snapshot) return null;
  if (quote.status === "cancelled") return null;

  return quote;
}
