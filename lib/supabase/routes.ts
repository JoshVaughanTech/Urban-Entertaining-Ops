/* Which paths are reachable without signing in.
 *
 * Kept as its own pure module so the rule can be tested. It is the whole
 * authorisation boundary of the app: everything not listed here goes through
 * the session check in middleware, and then again through requireUser().
 *
 * The matching is prefix-plus-separator on purpose. A bare startsWith would
 * make "/quotes" public because "/q" is — the tests pin that down. */

export const PUBLIC_PREFIXES = ["/login", "/auth", "/q"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
