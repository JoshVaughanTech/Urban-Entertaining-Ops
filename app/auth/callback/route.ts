import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeLanding } from "@/lib/supabase/routes";

/* Magic-link landing point.
 *
 * Supabase can send someone here in three different shapes, depending on how
 * the project's email template is written, and they are not interchangeable:
 *
 *   ?code=…                  PKCE. What @supabase/ssr asks for by default.
 *   ?token_hash=…&type=…     the newer template shape, verified not exchanged.
 *   #access_token=…          the implicit flow — a *fragment*, which browsers
 *                            never send to a server, so it cannot land here
 *                            at all. That one is caught in the browser by
 *                            components/auth/HashSession.tsx.
 *
 * Handling only the first is what made sign-in fail silently: the tokens
 * arrived in a fragment, this route never saw a request, and the log looked
 * as though nothing had been clicked. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeLanding(searchParams.get("next"));

  // Supabase reports a refused link in the query string, e.g. an expired OTP.
  const err = searchParams.get("error_description") ?? searchParams.get("error");
  if (err) {
    return NextResponse.redirect(`${origin}/login?reason=link-expired`);
  }

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (!code && !tokenHash) {
    return NextResponse.redirect(`${origin}/login?reason=missing-code`);
  }

  const supabase = await createClient();

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({
        token_hash: tokenHash as string,
        type: (type as "magiclink" | "email" | "recovery" | "invite") ?? "magiclink",
      });

  if (error) {
    return NextResponse.redirect(`${origin}/login?reason=link-expired`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
