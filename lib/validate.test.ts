/* The form boundary.
 *
 * Everything staff type reaches the database through here: prices, pack
 * sizes, yields, guest counts. A silent mis-parse would put a wrong number
 * into the catalogue and quietly re-cost every quote and order built on it,
 * so this is worth pinning down precisely. */

import { describe, expect, it } from "vitest";
import { Validator } from "./validate";

const fd = (fields: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) value.forEach((v) => data.append(key, v));
    else data.append(key, value);
  }
  return data;
};

describe("money", () => {
  const money = (raw: string, opts = {}) => {
    const v = new Validator(fd({ price: raw }));
    const cents = v.money("price", "Price", opts);
    return { cents, errors: v.errors, ok: v.ok };
  };

  it("turns dollars into integer cents", () => {
    expect(money("62").cents).toBe(6_200);
    expect(money("62.5").cents).toBe(6_250);
    expect(money("62.50").cents).toBe(6_250);
    expect(money("0.05").cents).toBe(5);
  });

  it("accepts what people actually type", () => {
    expect(money("$62.50").cents).toBe(6_250);
    expect(money("1,250.50").cents).toBe(125_050);
    expect(money("$1,250.50").cents).toBe(125_050);
    expect(money("  62.50  ").cents).toBe(6_250);
  });

  it("never leaves a fraction of a cent in the database", () => {
    // Third decimals get rounded rather than silently truncated.
    expect(money("62.505").cents).toBe(6_251);
    expect(money("62.504").cents).toBe(6_250);
    expect(Number.isInteger(money("19.999").cents)).toBe(true);
  });

  it("rejects anything that is not an amount", () => {
    expect(money("free").ok).toBe(false);
    expect(money("abc").errors["price"]).toMatch(/must be an amount/);
    expect(money("").ok).toBe(true); // optional by default
  });

  it("requires a value when asked to", () => {
    expect(money("", { required: true }).ok).toBe(false);
    expect(money("", { required: true }).errors["price"]).toMatch(/required/);
  });

  it("enforces a floor", () => {
    expect(money("-5", { min: 0 }).ok).toBe(false);
    expect(money("0", { min: 0 }).ok).toBe(true);
  });
});

describe("number", () => {
  const number = (raw: string, opts = {}) => {
    const v = new Validator(fd({ n: raw }));
    const value = v.number("n", "Guests", opts);
    return { value, errors: v.errors, ok: v.ok };
  };

  it("reads plain numbers", () => {
    expect(number("80").value).toBe(80);
    expect(number("2.5").value).toBe(2.5);
    expect(number("0.001").value).toBe(0.001);
  });

  it("rejects text", () => {
    expect(number("eighty").ok).toBe(false);
  });

  it("holds a lower and upper bound", () => {
    expect(number("0", { min: 1 }).ok).toBe(false);
    expect(number("101", { max: 100 }).ok).toBe(false);
    expect(number("50", { min: 1, max: 100 }).ok).toBe(true);
  });

  it("insists on whole numbers where a fraction makes no sense", () => {
    expect(number("3.5", { integer: true }).ok).toBe(false);
    expect(number("3", { integer: true }).ok).toBe(true);
  });

  it("treats an empty optional field as absent, not as zero", () => {
    const v = new Validator(fd({ n: "" }));
    expect(v.optionalNumber("n", "Staff ratio")).toBeNull();
    expect(v.ok).toBe(true);
  });
});

describe("enum and multi", () => {
  it("accepts only known values", () => {
    const v = new Validator(fd({ unit: "kg" }));
    expect(v.enum("unit", "Unit", ["kg", "L"] as const)).toBe("kg");
    expect(v.ok).toBe(true);
  });

  it("rejects an unknown value rather than passing it through", () => {
    const v = new Validator(fd({ unit: "tonne" }));
    v.enum("unit", "Unit", ["kg", "L"] as const);
    expect(v.ok).toBe(false);
    expect(v.errors["unit"]).toMatch(/kg, L/);
  });

  it("keeps only the allowed values from a checkbox group", () => {
    const v = new Validator(fd({ tags: ["vegan", "nonsense", "gf"] }));
    expect(v.multi("tags", ["vegan", "gf", "df"] as const)).toEqual(["vegan", "gf"]);
  });

  it("returns an empty list when nothing was ticked", () => {
    expect(new Validator(fd({})).multi("tags", ["vegan"] as const)).toEqual([]);
  });
});

describe("lines", () => {
  it("splits a textarea into trimmed entries", () => {
    const v = new Validator(fd({ includes: "Wait staff\n  Platters  \nSetup" }));
    expect(v.lines("includes")).toEqual(["Wait staff", "Platters", "Setup"]);
  });

  it("drops blank lines and survives Windows line endings", () => {
    const v = new Validator(fd({ includes: "One\r\n\r\nTwo\r\n" }));
    expect(v.lines("includes")).toEqual(["One", "Two"]);
  });
});

describe("email", () => {
  const email = (raw: string) => {
    const v = new Validator(fd({ e: raw }));
    return { value: v.email("e", "Contact email"), ok: v.ok };
  };

  it("accepts an ordinary address", () => {
    expect(email("orders@meatsmith.com.au").value).toBe("orders@meatsmith.com.au");
  });

  it("treats blank as no address, which is allowed", () => {
    expect(email("").value).toBeNull();
    expect(email("").ok).toBe(true);
  });

  it("rejects something that is not an address", () => {
    expect(email("not-an-email").ok).toBe(false);
    expect(email("missing@domain").ok).toBe(false);
    expect(email("has space@domain.com").ok).toBe(false);
  });
});

describe("text", () => {
  it("trims and requires", () => {
    const v = new Validator(fd({ name: "   Beef eye fillet  " }));
    expect(v.text("name", "Name", { required: true })).toBe("Beef eye fillet");
    expect(v.ok).toBe(true);
  });

  it("treats whitespace-only as empty", () => {
    const v = new Validator(fd({ name: "   " }));
    v.text("name", "Name", { required: true });
    expect(v.ok).toBe(false);
  });

  it("holds a maximum length", () => {
    const v = new Validator(fd({ name: "x".repeat(200) }));
    v.text("name", "Name", { max: 120 });
    expect(v.ok).toBe(false);
  });

  it("returns null for an absent optional field", () => {
    expect(new Validator(fd({ notes: "" })).optionalText("notes")).toBeNull();
  });
});

describe("collecting errors", () => {
  it("reports every bad field at once, not just the first", () => {
    const v = new Validator(fd({ name: "", price: "free", unit: "tonne" }));
    v.text("name", "Name", { required: true });
    v.money("price", "Price", { required: true });
    v.enum("unit", "Unit", ["kg"] as const);

    expect(v.ok).toBe(false);
    expect(Object.keys(v.errors).sort()).toEqual(["name", "price", "unit"]);
  });

  it("is happy when everything is valid", () => {
    const v = new Validator(fd({ name: "Brie", price: "42.00", unit: "kg" }));
    v.text("name", "Name", { required: true });
    v.money("price", "Price", { required: true, min: 0 });
    v.enum("unit", "Unit", ["kg"] as const);

    expect(v.ok).toBe(true);
    expect(v.errors).toEqual({});
  });
});
