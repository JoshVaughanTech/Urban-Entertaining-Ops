import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Magic-link landing point. Supabase sends the user here with a one-time
 *  code; we swap it for a session cookie and drop them where they were
 *  headed. Role provisioning into app_users lands in Phase 1, with the DB. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app/quotes/new";

  // Only ever redirect to a path on this app, never to an arbitrary URL.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/app/quotes/new";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?reason=missing-code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?reason=link-expired`);
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
