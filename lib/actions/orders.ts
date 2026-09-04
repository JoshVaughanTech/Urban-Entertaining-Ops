"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import {
  OrderError,
  buildOrdering,
  markOrderPlaced,
  setLineOrdered,
  syncOrder,
} from "@/lib/data/orders";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { money } from "@/lib/engine/format";
import { supplierCsv, supplierCsvFilename } from "@/lib/orders/csv";
import { failed, succeeded, type ActionState } from "@/lib/validate";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function readWindow(data: FormData): { from: string; to: string } {
  const from = String(data.get("from") ?? "");
  const to = String(data.get("to") ?? "");

  if (!ISO.test(from) || !ISO.test(to)) throw new OrderError("Choose both dates.");
  if (from > to) throw new OrderError("The window starts after it ends.");

  return { from, to };
}

const message = (err: unknown) =>
  err instanceof OrderError ? err.message : err instanceof Error ? err.message : "Something failed.";

/** Ticking a line opens the order for that window if it does not exist yet,
 *  writes the current rollup into it, then records the tick. */
export async function toggleOrderLine(_prev: ActionState, data: FormData): Promise<ActionState> {
  const user = await requireUser();

  try {
    const { from, to } = readWindow(data);
    const ingredientId = String(data.get("ingredientId") ?? "");
    const ordered = data.get("ordered") === "true";

    if (!ingredientId) return failed("No line to tick.");

    const view = await buildOrdering(db, from, to);
    const orderId = await syncOrder(db, from, to, view.lines, user.id);
    await setLineOrdered(db, orderId, ingredientId, ordered);
  } catch (err) {
    return failed(message(err));
  }

  revalidatePath("/app/ordering", "layout");
  return { ok: true };
}

export type SendOrdersResult = ActionState & {
  sent?: string[];
  skipped?: string[];
};

/** Emails each supplier its own CSV.
 *
 *  Suppliers with no contact email are never silently dropped — they come
 *  back in `skipped` and the screen names them. */
export async function sendPurchaseOrders(
  _prev: SendOrdersResult,
  data: FormData,
): Promise<SendOrdersResult> {
  const user = await requireUser();

  let sent: string[] = [];
  let skipped: string[] = [];

  try {
    const { from, to } = readWindow(data);
    const view = await buildOrdering(db, from, to);

    if (view.groups.length === 0) {
      return failed("There is nothing to order in that window.");
    }

    const meta = { windowFrom: from, windowTo: to, business: "Urban Entertaining" };
    const failures: string[] = [];

    for (const group of view.groups) {
      const name = group.supplierName ?? "No supplier";

      if (!group.contactEmail) {
        skipped.push(name);
        continue;
      }

      const csv = supplierCsv(group, meta);
      const result = await sendEmail({
        to: group.contactEmail,
        subject: `Urban Entertaining — order for ${from} to ${to}`,
        html: orderEmailBody(name, group.lines.length, group.cost, from, to),
        attachments: [
          { filename: supplierCsvFilename(group, meta), content: Buffer.from(csv, "utf8") },
        ],
      });

      if (result.ok) {
        sent.push(name);
      } else {
        failures.push(`${name}: ${result.message}`);
      }
    }

    const orderId = await syncOrder(db, from, to, view.lines, user.id);
    if (sent.length > 0) await markOrderPlaced(db, orderId);

    if (failures.length > 0) {
      return {
        ...failed(
          `Sent to ${sent.length} supplier${sent.length === 1 ? "" : "s"}. ` +
            `Failed: ${failures.join("; ")}`,
        ),
        sent,
        skipped,
      };
    }
  } catch (err) {
    return failed(message(err));
  }

  revalidatePath("/app/ordering", "layout");

  const parts = [`Sent ${sent.length} purchase order${sent.length === 1 ? "" : "s"}.`];
  if (skipped.length > 0) {
    parts.push(
      `Skipped ${skipped.join(", ")} — no contact email, so ${
        skipped.length === 1 ? "that supplier" : "those suppliers"
      } still needs ordering by hand.`,
    );
  }

  return { ...succeeded(parts.join(" ")), sent, skipped };
}

function orderEmailBody(
  supplier: string,
  lineCount: number,
  cost: number,
  from: string,
  to: string,
): string {
  return `
<div style="font-family:system-ui,sans-serif;color:#1F1D19;font-size:14px">
  <p>Hello ${escapeHtml(supplier)},</p>
  <p>
    Please find our order attached as a CSV — ${lineCount} line${lineCount === 1 ? "" : "s"},
    ${money(cost)} at our current pricing.
  </p>
  <p>Delivery window: ${escapeHtml(from)} to ${escapeHtml(to)}.</p>
  <p>Thank you,<br />Urban Entertaining</p>
</div>`.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
