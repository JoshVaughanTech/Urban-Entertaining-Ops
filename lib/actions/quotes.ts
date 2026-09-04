"use server";

import type { Route } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { denyReadOnly, requireUser } from "@/lib/auth";
import { loadCatalogue, loadSettings } from "@/lib/data/catalogue";
import {
  QuoteError,
  createQuote,
  deleteDraft,
  setQuoteStatus,
  updateQuote,
} from "@/lib/data/quotes-write";
import { db } from "@/lib/db";
import { parseQuotePayload } from "@/lib/quotes/payload";
import type { QuoteStatus } from "@/lib/quotes/types";
import { failed, type ActionState } from "@/lib/validate";

function revalidateQuotes(id?: string) {
  revalidatePath("/app/quotes", "layout");
  revalidatePath("/app/ordering", "layout");
  if (id) revalidatePath(`/app/quotes/${id}`, "layout");
}

const message = (err: unknown) =>
  err instanceof QuoteError
    ? err.message
    : err instanceof Error
      ? err.message
      : "Could not save the quote.";

export async function saveQuoteDraft(_prev: ActionState, data: FormData): Promise<ActionState> {
  const user = await requireUser();
  const denied = await denyReadOnly();
  if (denied) return denied;

  let destination: string;

  try {
    const input = parseQuotePayload(data);
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
  const denied = await denyReadOnly();
  if (denied) return denied;

  const id = String(data.get("id") ?? "");
  const next = String(data.get("status") ?? "") as QuoteStatus;

  try {
    const freeze =
      next === "confirmed"
        ? { cat: await loadCatalogue(db), settings: await loadSettings(db) }
        : undefined;
    await setQuoteStatus(db, id, next, freeze);
  } catch (err) {
    return failed(message(err));
  }

  revalidateQuotes(id);
  return { ok: true, message: `Marked ${next}.` };
}

export async function deleteQuoteDraft(_prev: ActionState, data: FormData): Promise<ActionState> {
  await requireUser();
  const denied = await denyReadOnly();
  if (denied) return denied;
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
  const denied = await denyReadOnly();
  if (denied) return denied;

  let destination: string;

  try {
    const input = parseQuotePayload(data);
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
