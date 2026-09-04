import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* Does the *server* accept the session the browser just wrote?
 *
 * A session established in the browser is only real once the cookie comes
 * back on a request. Before this existed, a cookie the server would not
 * accept sent someone straight back to the sign-in form with nothing said —
 * indistinguishable from never having clicked the link, and the reason a
 * broken sign-in took so long to pin down.
 *
 * Says only whether this caller's own session is valid. It reveals nothing
 * they do not already hold, and deliberately not whether they are on the
 * allowlist — that answer belongs to /no-access. */
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return NextResponse.json(
    { signedIn: Boolean(user), email: user?.email ?? null },
    { headers: { "cache-control": "no-store" } },
  );
}
