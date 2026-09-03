import { describe, expect, it } from "vitest";
import {
  INGREDIENT_TEMPLATE,
  RECIPE_TEMPLATE,
  parseCsv,
  parseIngredientCsv,
  parseRecipeCsv,
} from "./csv";

describe("parseCsv", () => {
  it("reads quoted fields containing commas", () => {
    const rows = parseCsv('a,b\n"one, two",three');
    expect(rows[1]).toEqual(["one, two", "three"]);
  });

  it("unescapes doubled quotes", () => {
    const rows = parseCsv('a\n"He said ""hello"""');
    expect(rows[1]).toEqual(['He said "hello"']);
  });

  it("handles CRLF and a trailing newline", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a byte-order mark from Excel", () => {
    const rows = parseCsv("﻿name,unit\nBeef,kg");
    expect(rows[0]?.[0]).toBe("name");
  });

  it("drops blank lines", () => {
    expect(parseCsv("a\n\n\nb")).toHaveLength(2);
  });
});

describe("parseIngredientCsv", () => {
  it("accepts the template we hand out", () => {
    const { rows, issues } = parseIngredientCsv(INGREDIENT_TEMPLATE);
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      name: "Beef eye fillet",
      unit: "kg",
      packSize: 2.5,
      costPerUnit: 6_200,
      supplier: "Meatsmith",
    });
  });

  it("reports a missing column once, not per row", () => {
    const { rows, issues } = parseIngredientCsv("name,unit\nBeef,kg");
    expect(rows).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("pack_size");
  });

  it("points at the offending line and column", () => {
    const csv =
      "name,unit,pack_size,cost_per_unit,supplier\n" +
      "Good,kg,1,10,Acme\n" +
      "Bad unit,tonne,1,10,Acme\n" +
      "Bad pack,kg,0,10,Acme\n" +
      "Bad cost,kg,1,free,Acme\n";
    const { rows, issues } = parseIngredientCsv(csv);

    expect(rows).toHaveLength(1);
    expect(issues.map((i) => [i.line, i.column])).toEqual([
      [3, "unit"],
      [4, "pack_size"],
      [5, "cost_per_unit"],
    ]);
  });

  it("rejects a duplicate name and says where the first one was", () => {
    const csv =
      "name,unit,pack_size,cost_per_unit,supplier\nBeef,kg,1,10,A\nbeef,kg,2,12,A\n";
    const { rows, issues } = parseIngredientCsv(csv);
    expect(rows).toHaveLength(1);
    expect(issues[0]?.message).toContain("line 2");
  });

  it("tolerates a dollar sign and thousands separator", () => {
    const csv = 'name,unit,pack_size,cost_per_unit,supplier\nTruffle,kg,1,"$1,250.50",A\n';
    const { rows, issues } = parseIngredientCsv(csv);
    expect(issues).toEqual([]);
    expect(rows[0]?.costPerUnit).toBe(125_050);
  });

  it("treats a blank supplier as no supplier", () => {
    const { rows } = parseIngredientCsv("name,unit,pack_size,cost_per_unit,supplier\nSalt,kg,1,2,\n");
    expect(rows[0]?.supplier).toBeNull();
  });
});

describe("parseRecipeCsv", () => {
  it("groups lines into one recipe", () => {
    const { rows, issues } = parseRecipeCsv(RECIPE_TEMPLATE);
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Rare beef crostini, horseradish cream");
    expect(rows[0]?.yieldPortions).toBe(40);
    expect(rows[0]?.items.map((i) => i.ingredient)).toEqual([
      "Beef eye fillet",
      "Sourdough loaf",
      "Thickened cream",
    ]);
  });

  it("refuses a recipe whose lines disagree about the yield", () => {
    const csv = "recipe,yield_portions,ingredient,qty\nTart,24,Choc,0.5\nTart,30,Cream,0.5\n";
    const { rows, issues } = parseRecipeCsv(csv);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ line: 3, column: "yield_portions" });
    expect(rows[0]?.items).toHaveLength(1);
  });

  it("refuses the same ingredient twice in one recipe", () => {
    const csv = "recipe,yield_portions,ingredient,qty\nTart,24,Choc,0.5\nTart,24,choc,0.2\n";
    const { issues } = parseRecipeCsv(csv);
    expect(issues[0]?.message).toContain("listed twice");
  });

  it("rejects a zero or negative quantity", () => {
    const csv = "recipe,yield_portions,ingredient,qty\nTart,24,Choc,0\n";
    const { rows, issues } = parseRecipeCsv(csv);
    expect(rows).toEqual([]);
    expect(issues[0]?.column).toBe("qty");
  });

  it("keeps good recipes when another one is broken", () => {
    const csv =
      "recipe,yield_portions,ingredient,qty\n" +
      "Good,10,Flour,1\n" +
      "Broken,0,Sugar,1\n";
    const { rows, issues } = parseRecipeCsv(csv);
    expect(rows.map((r) => r.name)).toEqual(["Good"]);
    expect(issues).toHaveLength(1);
  });
});
