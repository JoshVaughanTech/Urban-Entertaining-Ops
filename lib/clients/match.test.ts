import { describe, expect, it } from "vitest";

import { matchClients, matchScore, normaliseClientName, sameClient } from "./match";

describe("normaliseClientName", () => {
  it("folds case", () => {
    expect(normaliseClientName("HARPER")).toBe("harper");
  });

  it("reads & as and, so either spelling finds the other", () => {
    expect(normaliseClientName("Harper & Co.")).toBe("harper and co");
    expect(normaliseClientName("Harper and Co")).toBe("harper and co");
  });

  it("flattens punctuation to spaces rather than deleting it", () => {
    // "Smith/Jones" must stay two words, not become "smithjones".
    expect(normaliseClientName("Smith/Jones")).toBe("smith jones");
    expect(normaliseClientName("O'Brien")).toBe("o brien");
  });

  it("collapses runs of whitespace and trims", () => {
    expect(normaliseClientName("  Harper   &   Co.  ")).toBe("harper and co");
  });

  it("drops trailing company suffixes, including stacked ones", () => {
    expect(normaliseClientName("Harper Pty Ltd")).toBe("harper");
    expect(normaliseClientName("Harper Pty. Ltd.")).toBe("harper");
    expect(normaliseClientName("Harper Limited")).toBe("harper");
    expect(normaliseClientName("Harper Inc")).toBe("harper");
  });

  it("keeps a suffix word that is not trailing", () => {
    expect(normaliseClientName("Limited Editions")).toBe("limited editions");
    expect(normaliseClientName("Inc Design Studio")).toBe("inc design studio");
  });

  it("survives a name that is nothing but punctuation", () => {
    expect(normaliseClientName("---")).toBe("");
    expect(normaliseClientName("")).toBe("");
  });

  it("does not strip a name down to nothing", () => {
    // "Ltd" alone has no leading space, so the suffix rule cannot fire.
    expect(normaliseClientName("Ltd")).toBe("ltd");
  });
});

describe("matchScore", () => {
  it("ranks exact above prefix above word above substring", () => {
    expect(matchScore("Harper", "harper")).toBe(4);
    expect(matchScore("Harper & Co", "harper")).toBe(3);
    expect(matchScore("Rossmoyne Gallery", "gallery")).toBe(2);
    expect(matchScore("The Grand Hall", "ran")).toBe(1);
  });

  it("is zero for no match and for an empty query", () => {
    expect(matchScore("Harper", "zzz")).toBe(0);
    expect(matchScore("Harper", "")).toBe(0);
    expect(matchScore("Harper", "   ")).toBe(0);
  });

  it("matches across the & spelling in either direction", () => {
    expect(matchScore("Harper & Co.", "harper and co")).toBe(4);
    expect(matchScore("Harper and Co", "harper & co.")).toBe(4);
  });
});

describe("matchClients", () => {
  const clients = [
    { name: "Rossmoyne Gallery" },
    { name: "Harper & Co." },
    { name: "Harper Group" },
    { name: "The Grand Hall" },
  ];

  it("returns best matches first", () => {
    expect(matchClients(clients, "harper").map((c) => c.name)).toEqual([
      "Harper & Co.",
      "Harper Group",
    ]);
  });

  it("finds a client by a word in the middle of its name", () => {
    expect(matchClients(clients, "gallery").map((c) => c.name)).toEqual(["Rossmoyne Gallery"]);
  });

  it("returns nothing for an empty query rather than everything", () => {
    expect(matchClients(clients, "")).toEqual([]);
    expect(matchClients(clients, "  ")).toEqual([]);
  });

  it("keeps incoming order among equal scores, so recency wins", () => {
    const byRecency = [{ name: "Harper Group" }, { name: "Harper & Co." }];
    expect(matchClients(byRecency, "harper").map((c) => c.name)).toEqual([
      "Harper Group",
      "Harper & Co.",
    ]);
  });

  it("honours the limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `Harper ${i}` }));
    expect(matchClients(many, "harper")).toHaveLength(8);
    expect(matchClients(many, "harper", 3)).toHaveLength(3);
  });
});

describe("sameClient", () => {
  it("is true across punctuation, case and company suffixes", () => {
    expect(sameClient("Harper & Co.", "harper and co")).toBe(true);
    expect(sameClient("Harper Pty Ltd", "HARPER")).toBe(true);
  });

  it("is stricter than search: a prefix is not the same client", () => {
    expect(sameClient("Harper", "Harper & Co.")).toBe(false);
  });

  it("is false for two empty names rather than true", () => {
    expect(sameClient("", "")).toBe(false);
    expect(sameClient("--", "")).toBe(false);
  });
});
