/* The authorisation boundary.
 *
 * Anything isPublicPath returns true for is served to the open internet. The
 * cases below are the ones that would matter if someone "simplified" the
 * matching to a bare startsWith. */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_LANDING,
  LANDING_COOKIE,
  LANDING_COOKIE_MAX_AGE,
  clearedLandingCookie,
  isPublicPath,
  landingCookie,
  readLandingCookie,
  safeLanding,
} from "./routes";

describe("public paths", () => {
  it("lets the client reach a quote by its token", () => {
    expect(isPublicPath("/q/abc123")).toBe(true);
    expect(isPublicPath("/q")).toBe(true);
  });

  it("lets anyone reach sign-in and the auth callback", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/login?next=/app/quotes")).toBe(false); // query is not part of the path
    expect(isPublicPath("/auth")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/auth/sign-out")).toBe(true);
  });
});

describe("everything else is gated", () => {
  it("keeps the app behind sign-in", () => {
    for (const path of [
      "/app",
      "/app/quotes",
      "/app/quotes/new",
      "/app/quotes/abc/pdf",
      "/app/ordering",
      "/app/ordering/export",
      "/app/settings",
      "/app/recipes/import/template",
    ]) {
      expect(isPublicPath(path), `${path} must not be public`).toBe(false);
    }
  });

  /* The one that matters: "/q" is a public prefix, and a bare startsWith
     would hand the whole quotes list to the internet. */
  it("does not treat a path that merely starts with the same letters as public", () => {
    expect(isPublicPath("/quotes")).toBe(false);
    expect(isPublicPath("/queue")).toBe(false);
    expect(isPublicPath("/qa/secret")).toBe(false);
    expect(isPublicPath("/authorize")).toBe(false);
    expect(isPublicPath("/authenticated-admin")).toBe(false);
    expect(isPublicPath("/logins")).toBe(false);
    expect(isPublicPath("/login-as-admin")).toBe(false);
  });

  it("gates the root", () => {
    expect(isPublicPath("/")).toBe(false);
  });

  it("is not fooled by a path that only contains a public prefix", () => {
    expect(isPublicPath("/app/q/1")).toBe(false);
    expect(isPublicPath("/app/login")).toBe(false);
    expect(isPublicPath("/x/auth/callback")).toBe(false);
  });
});

/* Where someone is dropped after signing in. The value comes off the URL of a
   link that was emailed to them, so it is attacker-controlled: a genuine
   Urban Entertaining sign-in link that lands on somebody else's page is a
   very good phishing primitive. */
describe("landing after sign-in", () => {
  it("keeps a real destination", () => {
    expect(safeLanding("/app/ordering")).toBe("/app/ordering");
    expect(safeLanding("/app/quotes/abc?tab=cost")).toBe("/app/quotes/abc?tab=cost");
  });

  it("falls back when there is nothing to go on", () => {
    expect(safeLanding(null)).toBe(DEFAULT_LANDING);
    expect(safeLanding(undefined)).toBe(DEFAULT_LANDING);
    expect(safeLanding("")).toBe(DEFAULT_LANDING);
  });

  it("refuses to leave the app", () => {
    for (const hostile of [
      "https://evil.example/steal",
      "http://evil.example",
      "//evil.example",           // protocol-relative: a URL, not a path
      "//evil.example/app/quotes",
      "evil.example",
      "app/quotes",               // relative, resolves against whatever page
    ]) {
      expect(safeLanding(hostile), `${hostile} must not be honoured`).toBe(DEFAULT_LANDING);
    }
  });
});

/* The landing path used to ride in the redirect URL as ?next=. Supabase matches
   its allowlist against the whole URL, so an exact entry never matched, it fell
   back to the project Site URL without saying so, and staff were sent to a
   different application. It travels in a cookie now. */
describe("the landing cookie", () => {
  it("carries the path, and is scoped to the whole site", () => {
    const c = landingCookie("/app/clients", true);
    expect(c).toContain(`${LANDING_COOKIE}=${encodeURIComponent("/app/clients")}`);
    expect(c).toContain("Path=/");
  });

  it("survives the top-level navigation a mail client makes", () => {
    // Strict would drop it on the way in from an email; Lax allows a GET.
    expect(landingCookie("/app", true)).toContain("SameSite=Lax");
  });

  it("is short-lived", () => {
    expect(landingCookie("/app", true)).toContain(`Max-Age=${LANDING_COOKIE_MAX_AGE}`);
    expect(LANDING_COOKIE_MAX_AGE).toBeLessThanOrEqual(900);
  });

  it("is Secure over https and not over plain http, which is how dev runs", () => {
    expect(landingCookie("/app", true)).toContain("Secure");
    expect(landingCookie("/app", false)).not.toContain("Secure");
  });

  it("refuses to carry somewhere off this app", () => {
    // The same open-redirect guard as the query string had.
    expect(landingCookie("https://evil.example/x", true)).toContain(
      encodeURIComponent(DEFAULT_LANDING),
    );
    expect(landingCookie("//evil.example", true)).toContain(encodeURIComponent(DEFAULT_LANDING));
  });

  it("clears with Max-Age=0", () => {
    expect(clearedLandingCookie(true)).toContain("Max-Age=0");
    expect(clearedLandingCookie(true)).not.toContain(`Max-Age=${LANDING_COOKIE_MAX_AGE}`);
  });
});

describe("readLandingCookie", () => {
  it("finds it among others", () => {
    const jar = `sb-access-token=abc; ${LANDING_COOKIE}=${encodeURIComponent("/app/ordering")}; other=1`;
    expect(readLandingCookie(jar)).toBe("/app/ordering");
  });

  it("is null when absent or empty", () => {
    expect(readLandingCookie("")).toBeNull();
    expect(readLandingCookie("a=1; b=2")).toBeNull();
  });

  it("does not match a cookie whose name merely ends with it", () => {
    expect(readLandingCookie(`not_${LANDING_COOKIE}=/app/evil`)).toBeNull();
  });

  it("survives a malformed value rather than throwing", () => {
    expect(readLandingCookie(`${LANDING_COOKIE}=%E0%A4%A`)).toBeNull();
  });

  it("round-trips what landingCookie wrote", () => {
    const written = landingCookie("/app/quotes/new", true).split(";")[0]!;
    expect(readLandingCookie(written)).toBe("/app/quotes/new");
  });
});
