import type { DietaryTag, Style } from "@/lib/engine/types";

/** Anything the caller got wrong, phrased for a person to read. */
export class QuoteError extends Error {}

/** What the builder sends when it saves. Shared by the client form, the
 *  server action and the write layer, so all three agree on the shape. */
export type QuoteEventInput = {
  /** The client this event belongs to, when one was picked or created.
   *  Nullable: clientName is still the frozen label on the quote, and a legacy
   *  event may have no client at all. */
  clientId: string | null;
  clientName: string;
  contactEmail: string | null;
  eventDate: string;
  guests: number;
  style: Style | null;
  durationHours: number;
  venue: string | null;
  dietary: DietaryTag[];
  notes: string | null;
};

export type CustomLineInput = {
  label: string;
  qty: number;
  /** Cents. */
  unitPrice: number;
};

export type QuoteWriteInput = {
  event: QuoteEventInput;
  packageId: string;
  /** Cents. The staff override, or the tier price if untouched. */
  pricePerHead: number;
  /** Cents. */
  discount: number;
  addonIds: string[];
  customLines: CustomLineInput[];
};

export type QuoteStatus = "draft" | "sent" | "confirmed" | "declined" | "cancelled";

/** A draft can still be edited. Everything else is a record of what the
 *  client was told, so only its status may change. */
export const isEditable = (status: QuoteStatus) => status === "draft";

