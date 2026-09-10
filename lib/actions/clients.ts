"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { matchClients } from "@/lib/clients/match";
import type { ClientBrief, ClientMatch, ContactRole } from "@/lib/clients/types";
import { requireUser, denyReadOnly } from "@/lib/auth";
import {
  ClientError,
  addContact,
  createClient,
  deleteClient,
  listClientsForSearch,
  loadClientBrief,
  removeContact,
  updateClient,
  updateContact,
} from "@/lib/data/clients";
import { db } from "@/lib/db";
import { failed, succeeded, type ActionState } from "@/lib/validate";

/* Thin wrappers: check who is asking, validate, delegate. The rules live in
   lib/data/clients.ts so they can be tested without credentials. */

const message = (err: unknown) =>
  err instanceof ClientError
    ? err.message
    : err instanceof Error
      ? err.message
      : "Could not save that client.";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

const nullable = (data: FormData, key: string) => text(data, key) || null;

const pct = (data: FormData, key: string) => {
  const raw = text(data, key);
  return raw === "" ? 0 : Number(raw);
};

const contactRole = (value: FormDataEntryValue | null): ContactRole =>
  value === "on_site" ? "on_site" : value === "billing" ? "billing" : "booker";

const contactInput = (data: FormData) => ({
  role: contactRole(data.get("role")),
  name: text(data, "name"),
  email: nullable(data, "email"),
  phone: nullable(data, "phone"),
  isPrimary: data.get("isPrimary") === "on" || data.get("isPrimary") === "true",
});

/* ── reading ───────────────────────────────────────────────────────────
   Reads, so no denyReadOnly: a viewer may see clients. requireUser still
   applies — middleware is not an authorisation boundary on its own. */

/** Backs the typeahead in the quote builder. Ranking is pure and shared with
 *  the client, so the list filters as someone types without a round trip. */
export async function searchClients(query: string): Promise<ClientMatch[]> {
  await requireUser();
  if (!query.trim()) return [];
  // Already ordered by most recent activity, which matchClients preserves
  // among equal scores.
  return matchClients(await listClientsForSearch(db), query);
}

/** Everything the builder shows once a returning client is picked. */
export async function getClientBrief(clientId: string): Promise<ClientBrief | null> {
  await requireUser();
  return loadClientBrief(db, clientId);
}

/* ── writing ───────────────────────────────────────────────────────────── */

export async function saveClient(_prev: ActionState, data: FormData): Promise<ActionState> {
  const denied = await denyReadOnly();
  if (denied) return denied;

  const id = text(data, "id");
  const input = {
    name: text(data, "name"),
    discountPct: pct(data, "discountPct"),
    preferences: nullable(data, "preferences"),
    staffNotes: nullable(data, "staffNotes"),
  };

  let createdId: string | null = null;
  try {
    if (id) await updateClient(db, id, input);
    else createdId = (await createClient(db, input)).id;
  } catch (err) {
    return failed(message(err));
  }

  revalidatePath("/app/clients");
  revalidatePath(`/app/clients/${id || createdId}`);

  /* A new client leaves the form holding no id, so pressing save again would
     try to create them a second time and be refused as a duplicate. Send them
     to the record instead, which is where contacts and history live anyway.
     redirect() throws, so it must sit outside the try. */
  if (createdId) redirect(`/app/clients/${createdId}`);

  return succeeded("Saved.");
}

export async function removeClient(_prev: ActionState, data: FormData): Promise<ActionState> {
  const denied = await denyReadOnly();
  if (denied) return denied;

  try {
    await deleteClient(db, text(data, "id"));
  } catch (err) {
    return failed(message(err));
  }

  revalidatePath("/app/clients");
  return succeeded("Client deleted.");
}

export async function saveContact(_prev: ActionState, data: FormData): Promise<ActionState> {
  const denied = await denyReadOnly();
  if (denied) return denied;

  const clientId = text(data, "clientId");
  const contactId = text(data, "contactId");

  try {
    if (contactId) await updateContact(db, contactId, contactInput(data));
    else await addContact(db, clientId, contactInput(data));
  } catch (err) {
    return failed(message(err));
  }

  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath("/app/clients");
  return succeeded(contactId ? "Contact saved." : "Contact added.");
}

export async function deleteContact(_prev: ActionState, data: FormData): Promise<ActionState> {
  const denied = await denyReadOnly();
  if (denied) return denied;

  const clientId = text(data, "clientId");

  try {
    await removeContact(db, text(data, "contactId"));
  } catch (err) {
    return failed(message(err));
  }

  revalidatePath(`/app/clients/${clientId}`);
  revalidatePath("/app/clients");
  return succeeded("Contact removed.");
}
