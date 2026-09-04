/* The quote builder's payload is a JSON blob posted by the browser.
 *
 * Anyone can post anything to a server action, so this is a trust boundary,
 * not a convenience parser. These tests cover both halves: that a well-formed
 * payload comes through intact, and that a malformed or hostile one is
 * rejected rather than coerced into something the database will accept. */

import { describe, expect, it } from "vitest";
import { parseQuotePayload } from "./payload";
import { QuoteError } from "./types";

const valid = {
  event: {
    clientName: "Harper & Co. Wedding",
    contactEmail: "harper@example.com",
    eventDate: "2026-11-14",
    guests: 80,
    style: "cocktail",
    durationHours: 5,
    venue: "Collingwood",
    dietary: ["vegan", "gf"],
    notes: "Ceremony runs late.",
  },
  packageId: "pkg-1",
  pricePerHead: 8_200,
  discount: 25_000,
  addonIds: ["addon-1", "addon-2"],
  customLines: [{ label: "Cake cutting", qty: 1, unitPrice: 9_000 }],
};

/** Posts an object as the builder would. */
const post = (payload: unknown) => {
  const data = new FormData();
  data.append("payload", typeof payload === "string" ? payload : JSON.stringify(payload));
  return parseQuotePayload(data);
};

const withEvent = (over: Record<string, unknown>) =>
  post({ ...valid, event: { ...valid.event, ...over } });

describe("a well-formed payload", () => {
  it("comes through intact", () => {
    expect(post(valid)).toEqual({
      event: {
        clientName: "Harper & Co. Wedding",
        contactEmail: "harper@example.com",
        eventDate: "2026-11-14",
        guests: 80,
        style: "cocktail",
        durationHours: 5,
        venue: "Collingwood",
        dietary: ["vegan", "gf"],
        notes: "Ceremony runs late.",
      },
      packageId: "pkg-1",
      pricePerHead: 8_200,
      discount: 25_000,
      addonIds: ["addon-1", "addon-2"],
      customLines: [{ label: "Cake cutting", qty: 1, unitPrice: 9_000 }],
    });
  });

  it("trims text and treats blank optional fields as absent", () => {
    const out = withEvent({ clientName: "  Rothwell  ", venue: "   ", notes: "", contactEmail: "" });
    expect(out.event.clientName).toBe("Rothwell");
    expect(out.event.venue).toBeNull();
    expect(out.event.notes).toBeNull();
    expect(out.event.contactEmail).toBeNull();
  });

  it("defaults a missing discount to nothing rather than failing", () => {
    const { discount: _discount, ...rest } = valid;
    expect(post(rest).discount).toBe(0);
  });
});

describe("the payload itself", () => {
  it("refuses a missing field", () => {
    expect(() => parseQuotePayload(new FormData())).toThrow(QuoteError);
    expect(() => parseQuotePayload(new FormData())).toThrow(/Nothing to save/);
  });

  it("refuses text that is not JSON", () => {
    expect(() => post("not json at all")).toThrow(/Could not read the quote/);
  });

  it("refuses JSON that is not an object", () => {
    expect(() => post("null")).toThrow(QuoteError);
    expect(() => post("[]")).toThrow(QuoteError);
    expect(() => post("42")).toThrow(QuoteError);
  });
});

describe("the event", () => {
  it("needs a client name", () => {
    expect(() => withEvent({ clientName: "" })).toThrow(/needs a client name/);
    expect(() => withEvent({ clientName: "   " })).toThrow(/needs a client name/);
    expect(() => withEvent({ clientName: undefined })).toThrow(/needs a client name/);
  });

  it("needs a real ISO date, not anything date-shaped", () => {
    for (const bad of ["", "14/11/2026", "2026-11-14T00:00:00Z", "tomorrow", "2026-1-4"]) {
      expect(() => withEvent({ eventDate: bad }), bad).toThrow(/Choose an event date/);
    }
  });

  it("needs a whole number of guests above zero", () => {
    for (const bad of [0, -5, 2.5, "eighty", null, undefined, NaN]) {
      expect(() => withEvent({ guests: bad }), String(bad)).toThrow(/whole number above zero/);
    }
    expect(withEvent({ guests: 1 }).event.guests).toBe(1);
  });

  it("accepts a half-hour duration but not a negative one", () => {
    expect(withEvent({ durationHours: 3.5 }).event.durationHours).toBe(3.5);
    expect(withEvent({ durationHours: 0 }).event.durationHours).toBe(0);
    expect(() => withEvent({ durationHours: -1 })).toThrow(/number of hours/);
    expect(() => withEvent({ durationHours: "all night" })).toThrow(/number of hours/);
  });

  it("drops an unrecognised service style rather than storing it", () => {
    expect(withEvent({ style: "banquet" }).event.style).toBeNull();
    expect(withEvent({ style: null }).event.style).toBeNull();
    expect(withEvent({ style: "seated" }).event.style).toBe("seated");
  });

  it("keeps only dietary tags the app knows about", () => {
    expect(withEvent({ dietary: ["vegan", "unicorn", "gf"] }).event.dietary).toEqual([
      "vegan",
      "gf",
    ]);
    expect(withEvent({ dietary: "vegan" }).event.dietary).toEqual([]);
    expect(withEvent({ dietary: undefined }).event.dietary).toEqual([]);
  });
});

describe("the money", () => {
  it("needs a package", () => {
    expect(() => post({ ...valid, packageId: "" })).toThrow(/Choose a package/);
    expect(() => post({ ...valid, packageId: undefined })).toThrow(/Choose a package/);
  });

  it("refuses a negative or nonsensical price per head", () => {
    expect(() => post({ ...valid, pricePerHead: -1 })).toThrow(/must be an amount/);
    expect(() => post({ ...valid, pricePerHead: "free" })).toThrow(/must be an amount/);
    expect(() => post({ ...valid, pricePerHead: undefined })).toThrow(/must be an amount/);
  });

  it("refuses a negative discount", () => {
    expect(() => post({ ...valid, discount: -100 })).toThrow(/cannot be negative/);
  });

  /* Cents are integers in the database; a fractional cent from a hand-rolled
     request must not slip through. */
  it("rounds a fractional cent rather than storing it", () => {
    expect(post({ ...valid, pricePerHead: 8_200.6 }).pricePerHead).toBe(8_201);
    expect(Number.isInteger(post({ ...valid, discount: 99.4 }).discount)).toBe(true);
  });
});

describe("add-ons and custom lines", () => {
  it("ignores an addonIds that is not a list", () => {
    expect(post({ ...valid, addonIds: "addon-1" }).addonIds).toEqual([]);
    expect(post({ ...valid, addonIds: undefined }).addonIds).toEqual([]);
  });

  /* Unknown ids are harmless: the write layer resolves them against the
     catalogue and drops anything it cannot find. */
  it("passes add-on ids through as strings for the catalogue to resolve", () => {
    expect(post({ ...valid, addonIds: [1, "two"] }).addonIds).toEqual(["1", "two"]);
  });

  it("needs a description on every custom line", () => {
    expect(() =>
      post({ ...valid, customLines: [{ label: "  ", qty: 1, unitPrice: 100 }] }),
    ).toThrow(/needs a description/);
  });

  it("needs a quantity above zero", () => {
    for (const qty of [0, -1, "lots", null]) {
      expect(() =>
        post({ ...valid, customLines: [{ label: "Extra", qty, unitPrice: 100 }] }),
        String(qty),
      ).toThrow(/quantity above zero/);
    }
  });

  it("needs a unit price it can make sense of", () => {
    expect(() =>
      post({ ...valid, customLines: [{ label: "Extra", qty: 1, unitPrice: "lots" }] }),
    ).toThrow(/needs a unit price/);
  });

  it("names the offending line so staff can find it", () => {
    expect(() =>
      post({ ...valid, customLines: [{ label: "Late-night pizza", qty: 0, unitPrice: 100 }] }),
    ).toThrow(/Late-night pizza/);
  });

  it("ignores a customLines that is not a list", () => {
    expect(post({ ...valid, customLines: "nope" }).customLines).toEqual([]);
  });
});

describe("hostile input", () => {
  it("does not let a prototype key through", () => {
    const out = post({ ...valid, event: { ...valid.event, __proto__: { admin: true } } });
    expect(Object.keys(out.event).sort()).toEqual([
      "clientName",
      "contactEmail",
      "dietary",
      "durationHours",
      "eventDate",
      "guests",
      "notes",
      "style",
      "venue",
    ]);
    expect(({} as Record<string, unknown>)["admin"]).toBeUndefined();
  });

  it("drops fields the app does not know about", () => {
    const out = post({ ...valid, status: "confirmed", ref: "UE-9999", id: "someone-elses" });
    expect(out).not.toHaveProperty("status");
    expect(out).not.toHaveProperty("ref");
    expect(out).not.toHaveProperty("id");
  });

  it("cannot be used to set a status or a reference", () => {
    // The only way past draft is the send and confirm paths, which this
    // parser has no access to.
    const out = post(valid);
    expect(Object.keys(out).sort()).toEqual([
      "addonIds",
      "customLines",
      "discount",
      "event",
      "packageId",
      "pricePerHead",
    ]);
  });
});
