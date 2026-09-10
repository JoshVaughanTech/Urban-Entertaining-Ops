import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LANDING_COOKIE, clearedLandingCookie, safeLanding } from "@/lib/supabase/routes";

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
 * as though nothing had been clicked.
 *
 * The URL this route is reached at carries no query string of its own any
 * more. It used to be `/auth/callback?next=…`, and Supabase matches its
 * redirect allowlist against the whole URL — so an exact allowlist entry never
 * matched, Supabase fell back to the project's Site URL without saying so, and
 * staff were sent to a different application entirely. The landing path rides
 * in a cookie now, so the allowlist can hold this one exact URL. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const secure = origin.startsWith("https:");

  /* ?next= is still read so a link already sitting in an inbox keeps working;
     nothing sends it any more. safeLanding rejects an absolute or
     protocol-relative value from either source, so a tampered cookie is no
     more dangerous than a tampered query string was. */
  const jar = await cookies();
  const next = safeLanding(searchParams.get("next") ?? jar.get(LANDING_COOKIE)?.value ?? null);

  /** Every exit clears the cookie: it has done its job, or it never will. */
  const leave = (path: string) => {
    const res = NextResponse.redirect(`${origin}${path}`);
    res.headers.append("Set-Cookie", clearedLandingCookie(secure));
    return res;
  };

  // Supabase reports a refused link in the query string, e.g. an expired OTP.
  const err = searchParams.get("error_description") ?? searchParams.get("error");
  if (err) return leave("/login?reason=link-expired");

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (!code && !tokenHash) return leave("/login?reason=missing-code");

  const supabase = await createClient();

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({
        token_hash: tokenHash as string,
        type: (type as "magiclink" | "email" | "recovery" | "invite") ?? "magiclink",
      });

  if (error) return leave("/login?reason=link-expired");

  return leave(next);
}
