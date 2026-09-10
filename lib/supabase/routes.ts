/* Which paths are reachable without signing in.
 *
 * Kept as its own pure module so the rule can be tested. It is the whole
 * authorisation boundary of the app: everything not listed here goes through
 * the session check in middleware, and then again through requireUser().
 *
 * The matching is prefix-plus-separator on purpose. A bare startsWith would
 * make "/quotes" public because "/q" is — the tests pin that down. */

/* "/no-access" is reachable without being on the allowlist by design: it is
   where a signed-in stranger lands, and it shows them nothing. */
export const PUBLIC_PREFIXES = ["/login", "/auth", "/q", "/no-access"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/* Where to send someone after they sign in.
 *
 * Only ever a path on this app. An open redirect here would be worth real
 * money to a phisher: the sign-in link is genuine, the address bar says
 * Urban Entertaining, and the landing page is theirs. "//evil.com" is a
 * protocol-relative URL, not a local path, which is why the second test
 * is not redundant. */
export const DEFAULT_LANDING = "/app/quotes/new";

export function safeLanding(next: string | null | undefined): string {
  if (!next) return DEFAULT_LANDING;
  if (!next.startsWith("/") || next.startsWith("//")) return DEFAULT_LANDING;
  return next;
}

/* Where the landing path travels while the sign-in link is in someone's inbox.
 *
 * It used to ride in the redirect URL itself — `/auth/callback?next=%2Fapp` —
 * which meant Supabase's redirect allowlist had to match a URL carrying a query
 * string. An exact entry does not, so the redirect was refused and Supabase
 * fell back to the project's Site URL without saying so. That sent staff to a
 * different application entirely, and the only fix was a `/**` wildcard in the
 * allowlist, which is looser than it needs to be.
 *
 * Carrying it in a cookie instead lets the allowlist hold one exact URL.
 *
 * Ten minutes is plenty: the cookie is written the moment the link is
 * requested, and read when it is opened. A longer life would only mean a stale
 * landing path from an abandoned attempt. SameSite=Lax survives the top-level
 * GET navigation from a mail client, which is exactly the trip it has to make. */
export const LANDING_COOKIE = "ue_next";
export const LANDING_COOKIE_MAX_AGE = 600;

/** The Set-Cookie value written in the browser before the link is requested. */
export function landingCookie(next: string, secure: boolean): string {
  const parts = [
    `${LANDING_COOKIE}=${encodeURIComponent(safeLanding(next))}`,
    "Path=/",
    `Max-Age=${LANDING_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
  ];
  // Secure is invalid on plain http, which is how local development runs.
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

/** Clears it once the callback has used it. */
export const clearedLandingCookie = (secure: boolean) =>
  landingCookie(DEFAULT_LANDING, secure).replace(
    `Max-Age=${LANDING_COOKIE_MAX_AGE}`,
    "Max-Age=0",
  );

/** Reads the landing path out of a document.cookie string. Pure, so the
 *  parsing is testable rather than inlined in a component. */
export function readLandingCookie(cookieString: string): string | null {
  for (const part of cookieString.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LANDING_COOKIE) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        // A malformed value is no value; safeLanding would reject it anyway.
        return null;
      }
    }
  }
  return null;
}
