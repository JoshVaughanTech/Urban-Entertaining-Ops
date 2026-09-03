import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSupabaseEnv } from "./env";

const PUBLIC_PREFIXES = ["/login", "/auth", "/q"];

const isPublic = (pathname: string) =>
  PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** Refreshes the Supabase session cookie and gates everything that isn't
 *  explicitly public. With no Supabase config there is no way to
 *  authenticate anyone, so every gated route goes to /login, which
 *  explains what is missing. */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const env = readSupabaseEnv();

  if (!env) {
    if (isPublic(pathname)) return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("reason", "unconfigured");
    return NextResponse.redirect(url);
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

  if (!user && !isPublic(pathname)) {
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
