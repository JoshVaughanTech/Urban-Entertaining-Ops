"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { MemberError, addMember, removeMember, setMemberRole } from "@/lib/data/members";
import { db } from "@/lib/db";
import { failed, succeeded, type ActionState } from "@/lib/validate";

const message = (err: unknown) =>
  err instanceof MemberError
    ? err.message
    : err instanceof Error
      ? err.message
      : "Could not change access.";

const role = (value: FormDataEntryValue | null): "admin" | "staff" | "viewer" =>
  value === "admin" ? "admin" : value === "viewer" ? "viewer" : "staff";

export async function inviteMember(_prev: ActionState, data: FormData): Promise<ActionState> {
  await requireAdmin();

  try {
    const email = String(data.get("email") ?? "");
    const name = String(data.get("name") ?? "").trim() || null;
    await addMember(db, email, role(data.get("role")), name);
  } catch (err) {
    return failed(message(err));
  }

  revalidatePath("/app/team");
  return succeeded("Added. They can sign in with that address now.");
}

export async function changeMemberRole(_prev: ActionState, data: FormData): Promise<ActionState> {
  await requireAdmin();

  try {
    await setMemberRole(db, String(data.get("id") ?? ""), role(data.get("role")));
  } catch (err) {
    return failed(message(err));
  }

  revalidatePath("/app/team");
  return succeeded("Role updated.");
}

export async function revokeMember(_prev: ActionState, data: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = String(data.get("id") ?? "");

  if (id === admin.id) {
    return failed("You cannot remove your own access. Ask another admin to do it.");
  }

  try {
    await removeMember(db, id);
  } catch (err) {
    return failed(message(err));
  }

  revalidatePath("/app/team");
  return succeeded("Access removed. They are signed out on their next request.");
}
