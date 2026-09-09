import { describe, expect, it } from "vitest";

import type { QuoteDocument } from "@/lib/quotes/document";
import { renderQuotePdf } from "./render";

/* The brand fonts and the logo are read off disk and handed to @react-pdf,
   which fails *silently* when it cannot use what it is given: a bad font src
   falls back to Helvetica, and a bad image src is dropped altogether. Both
   still produce a valid PDF, so "starts with %PDF- and is over 1KB" cannot
   tell the difference. These assertions look inside the file instead.

   This is not hypothetical. Passing the logo as a path — which is what the
   docs suggest — made react-pdf fetch() it, and the mark vanished from every
   quote while the suite stayed green. */

const doc: QuoteDocument = {
  brand: "Urban Entertaining",
  title: "Quotation",
  ref: "UE-1042",
  clientName: "Harper & Co.",
  eventDate: "2026-11-14",
  guests: 80,
  venue: "Fitzroy Town Hall",
  packageName: "Grazing table",
  lines: [{ label: "Grazing table", qty: 80, unitPrice: 3200, amount: 256000, showUnit: true }],
  discount: 0,
  total: 256000,
  gst: 23272,
  includes: ["Staff", "Delivery"],
  menu: ["Sourdough", "Cured meats"],
  dietary: ["Vegetarian"],
  validUntil: "2026-10-14",
  depositPct: 30,
  depositAmount: 76800,
  terms: "Balance due seven days before the event.",
  internal: {
    food: 90000,
    staff: 60000,
    margin: 0.41,
    listPricePerHead: 3200,
    pricePerHead: 3200,
    hasUncostedLines: false,
  },
};

describe("the PDF's brand assets", () => {
  it("embeds the real fonts and the logo, with no fallback faces", async () => {
    const pdf = (await renderQuotePdf(doc)).toString("latin1");

    // Embedded TrueType programs: Mulish 400/700 and Cormorant 500.
    expect((pdf.match(/FontFile2/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(pdf).toMatch(/Mulish/);
    expect(pdf).toMatch(/Cormorant/);

    // The stand-ins these replaced. Their presence means a register() failed.
    expect(pdf).not.toMatch(/Helvetica/);
    expect(pdf).not.toMatch(/Times-Roman/);

    // The mark, plus the soft mask carrying its alpha channel.
    expect((pdf.match(/\/Subtype\s*\/Image/g) ?? []).length).toBeGreaterThan(0);
  }, 60_000);
});
