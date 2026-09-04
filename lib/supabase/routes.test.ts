/* The authorisation boundary.
 *
 * Anything isPublicPath returns true for is served to the open internet. The
 * cases below are the ones that would matter if someone "simplified" the
 * matching to a bare startsWith. */

import { describe, expect, it } from "vitest";
import { isPublicPath } from "./routes";

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
