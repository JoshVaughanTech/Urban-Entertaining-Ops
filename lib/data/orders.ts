/* The order record behind the ordering screen.
 *
 * The rollup itself is always computed live from current ingredient costs and
 * pack sizes — that is deliberate, and the opposite of how a quote works. What
 * gets stored is which lines have actually been ordered, plus a record of the
 * numbers at the time they were ticked.
 *
 * Takes the db as an argument, like the other write layers, so the tests can
 * drive it against a throwaway database. */

import { and, eq, notInArray, sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

import * as s from "@/lib/db/schema";
import {
  groupBySupplier,
  ingredientRollup,
  rollupTotalCost,
  type Rollup,
  type RollupLine,
  type SupplierGroup,
} from "@/lib/engine/ordering";
import { loadCatalogue } from "./catalogue";
import { loadConfirmedInWindow } from "./quotes";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = PgDatabase<any, any, any>;

export class OrderError extends Error {}

export type OrderState = {
  id: string | null;
  status: "draft" | "placed";
  /** ingredientId → ticked. Missing means not ordered. */
  ordered: Record<string, boolean>;
};

const EMPTY: OrderState = { id: null, status: "draft", ordered: {} };

export async function loadOrderState(db: Db, from: string, to: string): Promise<OrderState> {
  const [order] = await db
    .select({ id: s.orders.id, status: s.orders.status })
    .from(s.orders)
    .where(and(eq(s.orders.windowFrom, from), eq(s.orders.windowTo, to)))
    .limit(1);

  if (!order) return EMPTY;

  const lines = await db
    .select({ ingredientId: s.orderLines.ingredientId, ordered: s.orderLines.ordered })
    .from(s.orderLines)
    .where(eq(s.orderLines.orderId, order.id));

  const ordered: Record<string, boolean> = {};
  for (const line of lines) ordered[line.ingredientId] = line.ordered;

  return { id: order.id, status: order.status, ordered };
}

async function ensureOrder(db: Db, from: string, to: string, createdBy: string | null) {
  const [existing] = await db
    .select({ id: s.orders.id })
    .from(s.orders)
    .where(and(eq(s.orders.windowFrom, from), eq(s.orders.windowTo, to)))
    .limit(1);

  if (existing) return existing.id as string;

  const [created] = await db
    .insert(s.orders)
    .values({ windowFrom: from, windowTo: to, createdBy })
    .onConflictDoNothing({ target: [s.orders.windowFrom, s.orders.windowTo] })
    .returning({ id: s.orders.id });

  if (created) return created.id as string;

  // Someone else created it between the select and the insert.
  const [raced] = await db
    .select({ id: s.orders.id })
    .from(s.orders)
    .where(and(eq(s.orders.windowFrom, from), eq(s.orders.windowTo, to)))
    .limit(1);

  if (!raced) throw new OrderError("Could not open an order for that window.");
  return raced.id as string;
}

const num = (n: number) => String(n);

/** Writes the current rollup into the order, keeping whatever has already
 *  been ticked. Lines that have dropped out of the window are removed — an
 *  order should never ask a supplier for food no confirmed event needs. */
export async function syncOrder(
  db: Db,
  from: string,
  to: string,
  lines: RollupLine[],
  createdBy: string | null = null,
): Promise<string> {
  const orderId = await ensureOrder(db, from, to, createdBy);

  await db.transaction(async (tx) => {
    if (lines.length === 0) {
      await tx.delete(s.orderLines).where(eq(s.orderLines.orderId, orderId));
      return;
    }

    await tx
      .insert(s.orderLines)
      .values(
        lines.map((line) => ({
          orderId,
          ingredientId: line.ingredientId,
          supplierId: line.supplierId,
          neededQty: num(line.neededQty),
          packs: line.packs,
          orderQty: num(line.orderQty),
          unitCost: line.unitCost,
          quoteIds: line.quoteIds,
        })),
      )
      .onConflictDoUpdate({
        target: [s.orderLines.orderId, s.orderLines.ingredientId],
        set: {
          supplierId: sql`excluded.supplier_id`,
          neededQty: sql`excluded.needed_qty`,
          packs: sql`excluded.packs`,
          orderQty: sql`excluded.order_qty`,
          unitCost: sql`excluded.unit_cost`,
          quoteIds: sql`excluded.quote_ids`,
          // `ordered` is deliberately not touched: a tick survives a re-sync.
        },
      });

    const keep = lines.map((l) => l.ingredientId);
    await tx
      .delete(s.orderLines)
      .where(
        and(eq(s.orderLines.orderId, orderId), notInArray(s.orderLines.ingredientId, keep)),
      );
  });

  return orderId;
}

export async function setLineOrdered(
  db: Db,
  orderId: string,
  ingredientId: string,
  ordered: boolean,
): Promise<void> {
  const updated = await db
    .update(s.orderLines)
    .set({ ordered })
    .where(
      and(eq(s.orderLines.orderId, orderId), eq(s.orderLines.ingredientId, ingredientId)),
    )
    .returning({ id: s.orderLines.id });

  if (updated.length === 0) {
    throw new OrderError("That line is no longer part of this order.");
  }
}

export async function markOrderPlaced(db: Db, orderId: string): Promise<void> {
  await db
    .update(s.orders)
    .set({ status: "placed", updatedAt: new Date() })
    .where(eq(s.orders.id, orderId));
}

/* ── the ordering view ─────────────────────────────────────────────────── */

export type OrderingView = {
  quotes: Awaited<ReturnType<typeof loadConfirmedInWindow>>;
  lines: RollupLine[];
  groups: SupplierGroup[];
  warnings: Rollup["warnings"];
  totalCost: number;
};

/** Everything the ordering screen and the purchase-order emails need, built
 *  the same way for both so an email can never disagree with the screen. */
export async function buildOrdering(db: Db, from: string, to: string): Promise<OrderingView> {
  const cat = await loadCatalogue(db);
  const quotes = await loadConfirmedInWindow(db, from, to);
  const { lines, warnings } = ingredientRollup(quotes, cat);

  return {
    quotes,
    lines,
    warnings,
    groups: groupBySupplier(lines, cat),
    totalCost: rollupTotalCost(lines),
  };
}
