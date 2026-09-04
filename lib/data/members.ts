/* Who is allowed to use the app.
 *
 * A valid Supabase session proves someone owns an email address. It does not
 * prove they work here. This module is the second question — is this person
 * on the list — and every screen and action goes through it.
 *
 * Takes the db as an argument, like the other data layers, so the rules can
 * be tested against a throwaway database. */

import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";

import * as s from "@/lib/db/schema";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = PgDatabase<any, any, any>;

export type Role = "admin" | "staff";

export type Member = {
  id: string;
  authUserId: string | null;
  email: string;
  name: string | null;
  role: Role;
};

export class MemberError extends Error {}

export const normaliseEmail = (email: string) => email.trim().toLowerCase();

/** Emails admitted without anyone having added them first — for a fresh
 *  deployment where the table is still empty. Comma separated. */
export function bootstrapEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map(normaliseEmail)
    .filter(Boolean);
}

const toMember = (row: typeof s.appUsers.$inferSelect): Member => ({
  id: row.id,
  authUserId: row.authUserId,
  email: row.email,
  name: row.name,
  role: row.role,
});

/** Resolves the signed-in Supabase user to a member of this business, or
 *  null if they are not on the list.
 *
 *  Three ways in, in order:
 *    1. already bound — matched on their Supabase id
 *    2. added by email but never signed in — the id binds now
 *    3. listed in ALLOWED_EMAILS, or the table is empty and they are first
 *
 *  The last is the bootstrap: a brand new deployment has no members, so
 *  somebody has to be able to get in and add the rest. */
export async function resolveMember(
  db: Db,
  authUserId: string,
  rawEmail: string,
): Promise<Member | null> {
  const email = normaliseEmail(rawEmail);
  if (!email) return null;

  const [existing] = await db
    .select()
    .from(s.appUsers)
    .where(or(eq(s.appUsers.authUserId, authUserId), eq(s.appUsers.email, email)))
    .limit(1);

  if (existing) {
    // Added by email and signing in for the first time: bind the id.
    if (!existing.authUserId) {
      const [bound] = await db
        .update(s.appUsers)
        .set({ authUserId, updatedAt: new Date() })
        .where(and(eq(s.appUsers.id, existing.id), isNull(s.appUsers.authUserId)))
        .returning();
      return toMember(bound ?? { ...existing, authUserId });
    }
    return toMember(existing);
  }

  const allowed = bootstrapEmails();

  const [anyMember] = await db.select({ id: s.appUsers.id }).from(s.appUsers).limit(1);
  const tableIsEmpty = anyMember === undefined;

  /* With no members and no ALLOWED_EMAILS there is no way into a fresh
     deployment, so the first person through the door becomes admin. */
  const firstEver = tableIsEmpty && allowed.length === 0;

  if (!allowed.includes(email) && !firstEver) return null;

  const [created] = await db
    .insert(s.appUsers)
    .values({ authUserId, email, role: "admin" })
    .onConflictDoNothing({ target: s.appUsers.email })
    .returning();

  if (created) return toMember(created);

  // Lost a race with a concurrent sign-in; read back what won.
  const [raced] = await db.select().from(s.appUsers).where(eq(s.appUsers.email, email)).limit(1);
  return raced ? toMember(raced) : null;
}

/* ── managing the list ─────────────────────────────────────────────────── */

export async function listMembers(db: Db): Promise<Member[]> {
  const rows = await db.select().from(s.appUsers).orderBy(asc(s.appUsers.email));
  return rows.map(toMember);
}

export async function addMember(
  db: Db,
  rawEmail: string,
  role: Role,
  name: string | null,
): Promise<Member> {
  const email = normaliseEmail(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new MemberError("That does not look like an email address.");
  }

  const [created] = await db
    .insert(s.appUsers)
    .values({ email, role, name })
    .onConflictDoNothing({ target: s.appUsers.email })
    .returning();

  if (!created) throw new MemberError(`${email} is already on the list.`);
  return toMember(created);
}

export async function setMemberRole(db: Db, id: string, role: Role): Promise<void> {
  if (role !== "admin") await refuseIfLastAdmin(db, id);
  await db
    .update(s.appUsers)
    .set({ role, updatedAt: new Date() })
    .where(eq(s.appUsers.id, id));
}

export async function removeMember(db: Db, id: string): Promise<void> {
  await refuseIfLastAdmin(db, id);
  await db.delete(s.appUsers).where(eq(s.appUsers.id, id));
}

/** Nobody may remove or demote the last admin — that would lock everyone
 *  out of the list, with no way back in short of editing the database. */
async function refuseIfLastAdmin(db: Db, id: string): Promise<void> {
  const admins = await db
    .select({ id: s.appUsers.id })
    .from(s.appUsers)
    .where(eq(s.appUsers.role, "admin"));

  if (admins.length <= 1 && admins.some((a: { id: string }) => a.id === id)) {
    throw new MemberError(
      "This is the last admin. Make someone else an admin first, or nobody can manage access.",
    );
  }
}
