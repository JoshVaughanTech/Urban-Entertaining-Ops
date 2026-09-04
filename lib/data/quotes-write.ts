/* Every write a quote can undergo.
 *
 * Takes the db as an argument so the tests can drive the whole lifecycle
 * against a throwaway database. The server actions in lib/actions/quotes.ts
 * are thin wrappers that check auth, validate, and call these. */

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

import * as s from "@/lib/db/schema";
import { buildQuoteLines } from "@/lib/engine/pricing";
import { buildSnapshot } from "@/lib/engine/snapshot";
import type { Addon, Catalogue, QuoteLine, Settings } from "@/lib/engine/types";
import type { QuoteStatus, QuoteWriteInput } from "@/lib/quotes/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = PgDatabase<any, any, any>;

const num = (n: number) => String(n);

export class QuoteError extends Error {}

/** Next sequential reference, taken under a row lock so two staff saving at
 *  the same moment cannot both get UE-1051. */
export async function allocateRef(tx: Db): Promise<string> {
  const [row] = await tx
    .select({
      prefix: s.settings.quoteRefPrefix,
      next: s.settings.quoteRefNext,
    })
    .from(s.settings)
    .where(eq(s.settings.id, 1))
    .for("update");

  if (!row) throw new QuoteError("Settings are missing — run the seed before quoting.");

  await tx
    .update(s.settings)
    .set({ quoteRefNext: row.next + 1 })
    .where(eq(s.settings.id, 1));

  return `${row.prefix}-${row.next}`;
}

/** Rebuilds the quote's lines from the catalogue. Lines are stored, but they
 *  are always derived here — never typed in — so the stored quote and the
 *  engine can never disagree. */
export function linesFor(
  input: QuoteWriteInput,
  cat: Catalogue,
  settings: Settings,
): { lines: QuoteLine[]; addons: Addon[] } {
  const pkg = cat.packages.get(input.packageId);
  if (!pkg) throw new QuoteError("That package no longer exists.");

  const addons = input.addonIds.flatMap((id) => {
    const addon = cat.addons.get(id);
    return addon ? [addon] : [];
  });

  const lines = buildQuoteLines({
    pkg,
    event: {
      guests: input.event.guests,
      style: input.event.style,
      durationHours: input.event.durationHours,
      dietary: input.event.dietary,
    },
    pricePerHead: input.pricePerHead,
    addons,
    settings,
    customLines: input.customLines.map((l) => ({
      label: l.label,
      qty: l.qty,
      unitPrice: l.unitPrice,
    })),
  });

  return { lines, addons };
}

async function writeLinesAndAddons(
  tx: Db,
  quoteId: string,
  lines: QuoteLine[],
  addons: Addon[],
) {
  await tx.delete(s.quoteLines).where(eq(s.quoteLines.quoteId, quoteId));
  await tx.delete(s.quoteAddons).where(eq(s.quoteAddons.quoteId, quoteId));

  if (lines.length > 0) {
    await tx.insert(s.quoteLines).values(
      lines.map((line) => ({
        quoteId,
        sort: line.sort,
        label: line.label,
        qty: num(line.qty),
        unitPrice: line.unitPrice,
        source: line.source,
        addonId: line.addonId ?? null,
      })),
    );
  }

  if (addons.length > 0) {
    await tx
      .insert(s.quoteAddons)
      .values(addons.map((addon) => ({ quoteId, addonId: addon.id })));
  }
}

export async function createQuote(
  db: Db,
  input: QuoteWriteInput,
  cat: Catalogue,
  settings: Settings,
  createdBy: string | null,
): Promise<{ id: string; ref: string }> {
  const { lines, addons } = linesFor(input, cat, settings);

  return db.transaction(async (tx) => {
    const ref = await allocateRef(tx);

    const [event] = await tx
      .insert(s.events)
      .values({
        clientName: input.event.clientName,
        contactEmail: input.event.contactEmail,
        eventDate: input.event.eventDate,
        guests: input.event.guests,
        style: input.event.style,
        durationHours: num(input.event.durationHours),
        venue: input.event.venue,
        dietary: input.event.dietary,
        notes: input.event.notes,
      })
      .returning({ id: s.events.id });

    if (!event) throw new QuoteError("Could not save the event.");

    const [quote] = await tx
      .insert(s.quotes)
      .values({
        ref,
        eventId: event.id,
        packageId: input.packageId,
        pricePerHead: input.pricePerHead,
        discount: input.discount,
        status: "draft",
        createdBy,
      })
      .returning({ id: s.quotes.id });

    if (!quote) throw new QuoteError("Could not save the quote.");

    await writeLinesAndAddons(tx, quote.id, lines, addons);
    return { id: quote.id, ref };
  });
}

/** Drafts only. A sent quote is a record of what the client was told. */
export async function updateQuote(
  db: Db,
  quoteId: string,
  input: QuoteWriteInput,
  cat: Catalogue,
  settings: Settings,
): Promise<void> {
  const { lines, addons } = linesFor(input, cat, settings);

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: s.quotes.id, status: s.quotes.status, eventId: s.quotes.eventId })
      .from(s.quotes)
      .where(eq(s.quotes.id, quoteId))
      .limit(1);

    if (!existing) throw new QuoteError("That quote no longer exists.");
    if (existing.status !== "draft") {
      throw new QuoteError("Only a draft can be edited. This quote has already been sent.");
    }

    await tx
      .update(s.events)
      .set({
        clientName: input.event.clientName,
        contactEmail: input.event.contactEmail,
        eventDate: input.event.eventDate,
        guests: input.event.guests,
        style: input.event.style,
        durationHours: num(input.event.durationHours),
        venue: input.event.venue,
        dietary: input.event.dietary,
        notes: input.event.notes,
        updatedAt: new Date(),
      })
      .where(eq(s.events.id, existing.eventId));

    await tx
      .update(s.quotes)
      .set({
        packageId: input.packageId,
        pricePerHead: input.pricePerHead,
        discount: input.discount,
        updatedAt: new Date(),
      })
      .where(eq(s.quotes.id, quoteId));

    await writeLinesAndAddons(tx, quoteId, lines, addons);
  });
}

/** Freezes the quote and marks it sent. After this the client's copy and the
 *  app's copy are the same document, whatever happens to prices later. */
export async function sendQuote(
  db: Db,
  quoteId: string,
  cat: Catalogue,
  settings: Settings,
): Promise<{ token: string }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(s.quotes)
      .where(eq(s.quotes.id, quoteId))
      .limit(1);

    if (!row) throw new QuoteError("That quote no longer exists.");
    if (row.status !== "draft") throw new QuoteError("This quote has already been sent.");
    if (!row.packageId) throw new QuoteError("A quote needs a package before it can be sent.");

    const [event] = await tx
      .select()
      .from(s.events)
      .where(eq(s.events.id, row.eventId))
      .limit(1);

    if (!event) throw new QuoteError("The event behind this quote is missing.");

    const pkg = cat.packages.get(row.packageId);
    if (!pkg) throw new QuoteError("That package no longer exists.");

    const addonRows = await tx
      .select({ addonId: s.quoteAddons.addonId })
      .from(s.quoteAddons)
      .where(eq(s.quoteAddons.quoteId, quoteId));

    const addons = addonRows.flatMap((a: { addonId: string }) => {
      const addon = cat.addons.get(a.addonId);
      return addon ? [addon] : [];
    });

    const lineRows = await tx
      .select()
      .from(s.quoteLines)
      .where(eq(s.quoteLines.quoteId, quoteId))
      .orderBy(s.quoteLines.sort);

    const lines: QuoteLine[] = lineRows.map((l: typeof s.quoteLines.$inferSelect) => ({
      sort: l.sort,
      label: l.label,
      qty: Number(l.qty),
      unitPrice: l.unitPrice,
      source: l.source,
      ...(l.addonId ? { addonId: l.addonId } : {}),
    }));

    const snapshot = buildSnapshot({
      pkg,
      event: {
        clientName: event.clientName,
        eventDate: event.eventDate,
        venue: event.venue,
        guests: event.guests,
        style: event.style,
        durationHours: Number(event.durationHours),
        dietary: event.dietary,
      },
      pricePerHead: row.pricePerHead,
      discount: row.discount,
      addons,
      lines,
      settings,
      cat,
    });

    // URL-safe, unguessable, and only ever handed out with the quote.
    const token = row.publicToken ?? randomBytes(24).toString("base64url");

    await tx
      .update(s.quotes)
      .set({
        status: "sent",
        sentAt: new Date(),
        snapshot,
        publicToken: token,
        updatedAt: new Date(),
      })
      .where(eq(s.quotes.id, quoteId));

    return { token };
  });
}

const ALLOWED_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ["cancelled"],
  sent: ["confirmed", "declined", "cancelled"],
  confirmed: ["cancelled"],
  declined: ["cancelled"],
  cancelled: [],
};

/** Status is the one thing that still moves after a quote is sent. */
export async function setQuoteStatus(
  db: Db,
  quoteId: string,
  next: QuoteStatus,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ status: s.quotes.status })
      .from(s.quotes)
      .where(eq(s.quotes.id, quoteId))
      .limit(1);

    if (!row) throw new QuoteError("That quote no longer exists.");

    const current = row.status as QuoteStatus;
    if (current === next) return;

    if (!ALLOWED_TRANSITIONS[current].includes(next)) {
      throw new QuoteError(`A ${current} quote cannot be marked ${next}.`);
    }

    await tx
      .update(s.quotes)
      .set({
        status: next,
        confirmedAt: next === "confirmed" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(s.quotes.id, quoteId));
  });
}

export async function deleteDraft(db: Db, quoteId: string): Promise<void> {
  const deleted = await db
    .delete(s.quotes)
    .where(and(eq(s.quotes.id, quoteId), eq(s.quotes.status, "draft")))
    .returning({ id: s.quotes.id, eventId: s.quotes.eventId });

  if (deleted.length === 0) {
    throw new QuoteError("Only a draft can be deleted.");
  }

  // The event exists for the quote; with the quote gone it has no purpose.
  for (const row of deleted) {
    await db.delete(s.events).where(eq(s.events.id, row.eventId));
  }
}

