import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = { id: string; email: string };

/** The auth check every server component and server action starts with.
 *  Middleware already redirects unauthenticated traffic; this is the
 *  second gate, because middleware alone is not an authorisation boundary. */
export async function requireUser(): Promise<SessionUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return { id: user.id, email: user.email ?? "" };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
