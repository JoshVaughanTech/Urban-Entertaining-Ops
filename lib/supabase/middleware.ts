import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSupabaseEnv } from "./env";
import { DEFAULT_LANDING, isPublicPath, safeLanding } from "./routes";

/** Refreshes the Supabase session cookie and gates everything that isn't
 *  explicitly public. With no Supabase config there is no way to
 *  authenticate anyone, so every gated route goes to /login, which
 *  explains what is missing. */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const env = readSupabaseEnv();

  if (!env) {
    if (isPublicPath(pathname)) return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("reason", "unconfigured");
    return NextResponse.redirect(url);
  }

  /* A sign-in code that landed on the wrong path.
   *
   * Supabase only honours emailRedirectTo when that exact URL is in the
   * project's redirect allowlist; otherwise it silently falls back to the
   * Site URL, and the code arrives at "/" or "/login" where nothing looks at
   * it. Forwarding it to the callback keeps sign-in working against a
   * redirect allowlist nobody has got round to filling in.
   *
   * Deliberately limited to those two paths. Blanket-forwarding anything
   * carrying ?code= would let a stray query parameter hijack a real page —
   * /q/[token] most of all, which belongs to a client, not to us. */
  if (pathname === "/" || pathname === "/login") {
    const params = request.nextUrl.searchParams;

    if (params.has("code") || params.has("token_hash")) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/callback";
      url.searchParams.set(
        "next",
        pathname === "/" ? DEFAULT_LANDING : safeLanding(params.get("next")),
      );
      return NextResponse.redirect(url);
    }
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet: { name: string; value: string; options?: CookieOptions }[]) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Do not put logic between createServerClient and getUser: getUser is what
  // revalidates the token, and skipping it makes sessions expire unpredictably.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/app/quotes/new";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
