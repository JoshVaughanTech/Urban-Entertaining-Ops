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
