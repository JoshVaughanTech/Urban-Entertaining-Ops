/* Shared client types.
 *
 * Separate from the actions module because a "use server" file may only export
 * async functions — exporting a type is fine, but the moment anything else
 * lands beside it the build breaks confusingly. Same reason lib/quotes/payload.ts
 * and lib/import/types.ts exist.
 */

import type { Cents } from "@/lib/engine/types";

export type ContactRole = "booker" | "on_site" | "billing";

export const CONTACT_ROLES: ContactRole[] = ["booker", "on_site", "billing"];

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  booker: "Booker",
  on_site: "On the night",
  billing: "Billing",
};

export type ClientContact = {
  id: string;
  role: ContactRole;
  name: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
};

export type Client = {
  id: string;
  name: string;
  /** Standing discount. The only thing on a client that touches money. */
  discountPct: number;
  /** Internal. Never rendered in a client-facing document. */
  preferences: string | null;
  /** Internal. Never rendered in a client-facing document. */
  staffNotes: string | null;
  contacts: ClientContact[];
};

/** One past quote, for the history panel and the client's own screen. */
export type ClientHistoryEntry = {
  quoteId: string;
  ref: string;
  status: string;
  eventDate: string;
  guests: number;
  packageName: string | null;
  /** What the client was actually given, from the snapshot once sent. Null on
   *  a draft, which has never been priced to anyone. */
  total: Cents | null;
};

/** Everything the quote builder shows when a returning client is picked. */
export type ClientBrief = {
  client: Client;
  history: ClientHistoryEntry[];
};

/** A row in the clients list and in the typeahead. */
export type ClientSummary = {
  id: string;
  name: string;
  discountPct: number;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  eventCount: number;
  /** Most recent event date, past or future. Null if they have never booked. */
  lastEventDate: string | null;
  /** Sum of the totals of their confirmed quotes. */
  lifetimeValue: Cents;
};

/** A typeahead suggestion. Everything the picker shows and nothing else — the
 *  full ClientSummary costs a jsonb extraction and two more joins, and this
 *  runs on every keystroke. */
export type ClientMatch = {
  id: string;
  name: string;
  discountPct: number;
  eventCount: number;
};

export type ClientWriteInput = {
  name: string;
  discountPct: number;
  preferences: string | null;
  staffNotes: string | null;
};

export type ContactWriteInput = {
  role: ContactRole;
  name: string;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
};
