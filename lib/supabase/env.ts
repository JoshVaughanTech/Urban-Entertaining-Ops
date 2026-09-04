/** Supabase config comes from the environment. Nothing here has a fallback:
 *  an unconfigured app must say so, not pretend to work. */

export type SupabaseEnv = { url: string; anonKey: string };

/** The browser-safe key. Supabase renamed it: newer projects issue a
 *  "publishable" key (sb_publishable_…), older ones an "anon" key. They serve
 *  the same purpose — safe to ship to the browser, with row-level security
 *  doing the actual protecting — so either name is accepted.
 *
 *  Both are read as literal property accesses, because Next inlines
 *  NEXT_PUBLIC_* at build time and cannot follow a computed lookup. */
function readKey(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    undefined
  );
}

export function readSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = readKey();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function requireSupabaseEnv(): SupabaseEnv {
  const env = readSupabaseEnv();
  if (!env) {
    throw new Error(
      "Supabase is not configured. Copy .env.local.example to .env.local and set " +
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
        "(or NEXT_PUBLIC_SUPABASE_ANON_KEY on an older project).",
    );
  }
  return env;
}

export const isSupabaseConfigured = () => readSupabaseEnv() !== null;
