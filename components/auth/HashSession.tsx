"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeLanding, readLandingCookie } from "@/lib/supabase/routes";

/* Completes a sign-in whose tokens arrived in the URL fragment.
 *
 * Supabase's implicit flow returns "#access_token=…&refresh_token=…" rather
 * than "?code=…". A fragment is never sent to a server, so /auth/callback
 * cannot see it and the sign-in dies without a single line in the log — which
 * is exactly how this presented. The fragment does survive redirects though,
 * so "/#access_token=…" is still carried through / → /app/quotes/new → /login,
 * and this component, mounted on the login page, is where it lands.
 *
 * Handing the tokens to the browser client is not a lesser, client-only
 * session: @supabase/ssr's browser client stores in *cookies*, so the result
 * is the same cookie the server reads in middleware and in requireUser(). The
 * full reload afterwards is what makes the server see it.
 *
 * Keep this even once the project is issuing PKCE codes. It costs one render
 * on a page that is otherwise idle, and it is the difference between a
 * misconfigured email template being a nuisance and being a lockout. */
export function HashSession({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "working" | "idle" | "failed">("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    /* Say the same thing however it went wrong. Supabase's own wording is
       written for whoever wrote the integration — "Invalid JWT structure" is
       not something to put in front of someone who only wants to get in — so
       the detail goes to the console and the person gets a next step. */
    const fail = (detail: string) => {
      console.warn("[auth] sign-in link rejected:", detail);
      // Strip the fragment so a reload cannot replay a dead link.
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setMessage("That sign-in link could not be used. Request a new one below.");
      setState("failed");
    };

    const hash = window.location.hash.slice(1);
    if (!hash) {
      setState("idle");
      return;
    }

    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const error = params.get("error_description") ?? params.get("error");

    if (error) {
      fail(error);
      return;
    }

    if (!accessToken || !refreshToken) {
      setState("idle");
      return;
    }

    setState("working");

    void (async () => {
      try {
        const supabase = createClient();
        const { error: setErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (setErr) throw setErr;

        /* Confirm the server accepts it before sending anyone anywhere.
           setSession succeeding only means the browser stored a cookie; if
           the server will not read it back, redirecting bounces them to the
           sign-in form with no explanation, which is the single most
           confusing way this can fail. */
        const res = await fetch("/auth/whoami", { cache: "no-store" });
        const who = (await res.json()) as { signedIn?: boolean };
        if (!who.signedIn) {
          throw new Error("the browser stored the session but the server did not accept it");
        }

        /* A full navigation, not a router push: the cookie has only just been
           written, and nothing but a fresh request will carry it to the
           server. replace() rather than assign() so the tokens do not stay
           in history behind a back button. */
        /* The query string still wins because middleware sets it when it
           bounces someone here; the cookie is the fallback, written when the
           link was requested. */
        const next = safeLanding(
          new URLSearchParams(window.location.search).get("next") ??
            readLandingCookie(document.cookie),
        );
        window.location.replace(next);
      } catch (err) {
        fail(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  /* Render nothing until the fragment has been read. Showing the sign-in form
     first would flash "we don't know who you are" at someone who has in fact
     just signed in. */
  if (state === "checking") return null;

  if (state === "working") {
    return <p style={{ color: "var(--muted)", margin: 0 }}>Signing you in…</p>;
  }

  return (
    <>
      {state === "failed" ? (
        <p style={{ color: "var(--red)", margin: "0 0 12px" }}>{message}</p>
      ) : null}
      {children}
    </>
  );
}
