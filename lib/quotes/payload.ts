/* The trust boundary between the quote builder and the database.
 *
 * The builder posts its whole state as one JSON blob, so nothing in here may
 * be believed. Every field is re-checked, unknown values are dropped rather
 * than passed through, and anything that cannot be made sense of throws
 * instead of being silently coerced.
 *
 * Pure, so it can be tested directly — the server action is a thin wrapper. */

import { DIETARY_TAGS, STYLES, type DietaryTag, type Style } from "@/lib/engine/types";
import { QuoteError, type QuoteWriteInput } from "./types";

export function parseQuotePayload(data: FormData): QuoteWriteInput {
  const raw = data.get("payload");
  if (typeof raw !== "string") throw new QuoteError("Nothing to save.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new QuoteError("Could not read the quote.");
  }

  /* null and arrays are objects enough to reach property access and throw a
     TypeError, which would surface to staff as a developer error. */
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
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

  /* A uuid or nothing. Anything else is dropped rather than passed to the
     database, where it would fail the foreign key with a Postgres error. */
  const rawClientId = String(event["clientId"] ?? "").trim();
  const clientId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawClientId)
    ? rawClientId
    : null;

  return {
    event: {
      clientId,
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
