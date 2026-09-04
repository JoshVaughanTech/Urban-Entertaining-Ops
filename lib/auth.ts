import { redirect } from "next/navigation";
import { resolveMember, type Member, type Role } from "@/lib/data/members";
import { db } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = {
  /** The app's own id for this person — what created_by columns reference. */
  id: string;
  email: string;
  name: string | null;
  role: Role;
};

/** The gate every screen and every server action starts with.
 *
 *  Two questions, not one. Supabase answers the first — does this person own
 *  this email address. `app_users` answers the second — do they work here.
 *  A valid session on its own is worth nothing: anyone can get one, because
 *  anyone can receive a magic link at their own address. */
export async function requireUser(): Promise<SessionUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const member = await resolveMember(db, user.id, user.email ?? "");
  if (!member) redirect("/no-access");

  return { id: member.id, email: member.email, name: member.name, role: member.role };
}

/** For anything only an owner should do — managing who has access. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/app/quotes");
  return user;
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

export type { Member };
