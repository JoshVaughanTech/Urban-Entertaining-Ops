"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { loadCatalogue, loadSettings } from "@/lib/data/catalogue";
import {
  QuoteError,
  createQuote,
  deleteDraft,
  setQuoteStatus,
  updateQuote,
} from "@/lib/data/quotes-write";
import { db } from "@/lib/db";
import { DIETARY_TAGS, STYLES, type DietaryTag, type Style } from "@/lib/engine/types";
import type { QuoteStatus, QuoteWriteInput } from "@/lib/quotes/types";
import { failed, type ActionState } from "@/lib/validate";

function revalidateQuotes(id?: string) {
  revalidatePath("/app/quotes", "layout");
  revalidatePath("/app/ordering", "layout");
  if (id) revalidatePath(`/app/quotes/${id}`, "layout");
}

/** The builder is a single interactive panel, so it posts its state as one
 *  JSON payload rather than fifty form fields. Everything in it is re-checked
 *  here — the client is never trusted with what gets written. */
function parsePayload(data: FormData): QuoteWriteInput {
  const raw = data.get("payload");
  if (typeof raw !== "string") throw new QuoteError("Nothing to save.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new QuoteError("Could not read the quote.");
  }

  const p = parsed as Record<string, unknown>;
  const event = (p["event"] ?? {}) as Record<string, unknown>;

  const clientName = String(event["clientName"] ?? "").trim();
  if (!clientName) throw new QuoteError("The quote needs a client name.");

  const eventDate = String(event["eventDate"] ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) throw new QuoteError("Choose an event date.");

  const guests = Number(event["guests"]);
  if (!Number.isInteger(guests) || guests < 1) {
    throw new QuoteError("Guest count must be a whole number above zero.");
  }

  const durationHours = Number(event["durationHours"]);
  if (!Number.isFinite(durationHours) || durationHours < 0) {
    throw new QuoteError("Duration must be a number of hours.");
  }

  const rawStyle = event["style"];
  const style = STYLES.includes(rawStyle as Style) ? (rawStyle as Style) : null;

  const dietary = Array.isArray(event["dietary"])
    ? (event["dietary"].filter((d) => DIETARY_TAGS.includes(d as DietaryTag)) as DietaryTag[])
    : [];

  const packageId = String(p["packageId"] ?? "");
  if (!packageId) throw new QuoteError("Choose a package before saving.");

  const pricePerHead = Math.round(Number(p["pricePerHead"]));
  if (!Number.isFinite(pricePerHead) || pricePerHead < 0) {
    throw new QuoteError("Price per head must be an amount.");
  }

  const discount = Math.round(Number(p["discount"] ?? 0));
  if (!Number.isFinite(discount) || discount < 0) {
    throw new QuoteError("Discount cannot be negative.");
  }

  const addonIds = Array.isArray(p["addonIds"]) ? p["addonIds"].map(String) : [];

  const customLines = Array.isArray(p["customLines"])
    ? p["customLines"].map((line) => {
        const l = line as Record<string, unknown>;
        const label = String(l["label"] ?? "").trim();
        const qty = Number(l["qty"]);
        const unitPrice = Math.round(Number(l["unitPrice"]));

        if (!label) throw new QuoteError("Every custom line needs a description.");
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new QuoteError(`"${label}" needs a quantity above zero.`);
        }
        if (!Number.isFinite(unitPrice)) {
          throw new QuoteError(`"${label}" needs a unit price.`);
        }
        return { label, qty, unitPrice };
      })
    : [];

  return {
    event: {
      clientName,
      contactEmail: String(event["contactEmail"] ?? "").trim() || null,
      eventDate,
      guests,
      style,
      durationHours,
      venue: String(event["venue"] ?? "").trim() || null,
      dietary,
      notes: String(event["notes"] ?? "").trim() || null,
    },
    packageId,
    pricePerHead,
    discount,
    addonIds,
    customLines,
  };
}

const message = (err: unknown) =>
  err instanceof QuoteError
    ? err.message
    : err instanceof Error
      ? err.message
      : "Could not save the quote.";

export async function saveQuoteDraft(_prev: ActionState, data: FormData): Promise<ActionState> {
  const user = await requireUser();

  let destination: string;

  try {
    const input = parsePayload(data);
    const cat = await loadCatalogue(db);
    const settings = await loadSettings(db);
    const existingId = String(data.get("quoteId") ?? "");

    if (existingId) {
      await updateQuote(db, existingId, input, cat, settings);
      destination = `/app/quotes/${existingId}`;
    } else {
      const { id } = await createQuote(db, input, cat, settings, user.id);
      destination = `/app/quotes/${id}`;
    }
  } catch (err) {
    return failed(message(err));
  }

  revalidateQuotes();
  redirect(destination as Route);
}

export async function markQuoteStatus(_prev: ActionState, data: FormData): Promise<ActionState> {
  await requireUser();

  const id = String(data.get("id") ?? "");
  const next = String(data.get("status") ?? "") as QuoteStatus;

  try {
    await setQuoteStatus(db, id, next);
  } catch (err) {
    return failed(message(err));
  }

  revalidateQuotes(id);
  return { ok: true, message: `Marked ${next}.` };
}

export async function deleteQuoteDraft(_prev: ActionState, data: FormData): Promise<ActionState> {
  await requireUser();
  const id = String(data.get("id") ?? "");

  try {
    await deleteDraft(db, id);
  } catch (err) {
    return failed(message(err));
  }

  revalidateQuotes();
  redirect("/app/quotes");
}

/** Saves the draft, then opens the client-facing preview — the mockup's
 *  "Preview client quote". Sending happens from there. */
export async function saveAndPreviewQuote(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  let destination: string;

  try {
    const input = parsePayload(data);
    const cat = await loadCatalogue(db);
    const settings = await loadSettings(db);
    const existingId = String(data.get("quoteId") ?? "");

    if (existingId) {
      await updateQuote(db, existingId, input, cat, settings);
      destination = `/app/quotes/${existingId}/preview`;
    } else {
      const { id } = await createQuote(db, input, cat, settings, user.id);
      destination = `/app/quotes/${id}/preview`;
    }
  } catch (err) {
    return failed(message(err));
  }

  revalidateQuotes();
  redirect(destination as Route);
}
