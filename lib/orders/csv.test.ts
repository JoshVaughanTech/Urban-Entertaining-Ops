import { describe, expect, it } from "vitest";

import type { RollupLine, SupplierGroup } from "@/lib/engine/ordering";
import { parseCsv } from "@/lib/import/csv";
import { csvField, lineToRow, supplierCsv, supplierCsvFilename } from "./csv";

const line = (over: Partial<RollupLine> = {}): RollupLine => ({
  ingredientId: "i1",
  ingredientName: "Beef eye fillet",
  unit: "kg",
  supplierId: "s1",
  supplierName: "Meatsmith",
  neededQty: 15.7125,
  packSize: 2.5,
  packs: 7,
  orderQty: 17.5,
  unitCost: 6_200,
  cost: 108_500,
  quoteIds: ["q1", "q2"],
  quoteRefs: ["UE-1042", "UE-1046"],
  ...over,
});

const group = (over: Partial<SupplierGroup> = {}): SupplierGroup => ({
  supplierId: "s1",
  supplierName: "Meatsmith",
  contactEmail: "orders@meatsmith.example",
  lines: [line()],
  cost: 108_500,
  ...over,
});

const meta = {
  windowFrom: "2026-09-07",
  windowTo: "2026-09-20",
  business: "Urban Entertaining",
};

describe("csvField", () => {
  it("leaves an ordinary value alone", () => {
    expect(csvField("Beef eye fillet")).toBe("Beef eye fillet");
  });

  it("quotes anything with a comma, quote or newline", () => {
    expect(csvField("Rare beef, horseradish")).toBe('"Rare beef, horseradish"');
    expect(csvField('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
  });
});

describe("supplierCsv", () => {
  it("leads with who it is for and which dates", () => {
    const csv = supplierCsv(group(), meta);
    const rows = csv.split("\r\n");

    expect(rows[0]).toBe("Urban Entertaining purchase order");
    expect(rows[1]).toBe("Meatsmith");
    expect(rows[2]).toBe("Delivery window 2026-09-07 to 2026-09-20");
    expect(rows[4]).toBe(
      "Ingredient,Order,Unit,Packs,Pack size,Needed,Unit cost,Line cost,For",
    );
  });

  it("puts the order quantity before the raw need, since that is what gets bought", () => {
    const row = lineToRow(line());
    expect(row[0]).toBe("Beef eye fillet");
    expect(row[1]).toBe("17.5");
    expect(row[3]).toBe("7");
    expect(row[5]).toBe("15.713");
    expect(row[6]).toBe("$62.00");
    expect(row[7]).toBe("$1085.00");
  });

  it("names the quotes each line is for", () => {
    expect(lineToRow(line())[8]).toBe("UE-1042 UE-1046");
  });

  it("ends with the supplier total", () => {
    const rows = supplierCsv(group(), meta).trimEnd().split("\r\n");
    expect(rows[rows.length - 1]).toBe("Total,,,,,,,$1085.00,");
  });

  it("uses CRLF, which is what spreadsheets expect", () => {
    expect(supplierCsv(group(), meta)).toContain("\r\n");
  });

  it("handles a group with no supplier", () => {
    const csv = supplierCsv(group({ supplierId: null, supplierName: null, contactEmail: null }), meta);
    expect(csv.split("\r\n")[1]).toBe("No supplier");
  });
});

describe("supplierCsvFilename", () => {
  it("names the file after the supplier and the window", () => {
    expect(supplierCsvFilename(group(), meta)).toBe("Meatsmith 2026-09-07 to 2026-09-20.csv");
  });

  it("strips characters a filesystem would object to", () => {
    expect(supplierCsvFilename(group({ supplierName: "Damian Pike & Co/Fish" }), meta)).toBe(
      "Damian Pike CoFish 2026-09-07 to 2026-09-20.csv",
    );
  });
});

/* A supplier will open this in Excel. Read it back with the importer's own
   parser — if the two CSV modules ever disagree, this fails. */
describe("round trip", () => {
  it("reads back the same values it wrote", () => {
    const csv = supplierCsv(
      group({ lines: [line({ ingredientName: 'Prawns, "tiger" 16/20' })] }),
      meta,
    );
    // parseCsv drops the blank spacer rows, so find the line by its name
    // rather than counting.
    const rows = parseCsv(csv);
    const dataRow = rows.find((r) => r[0] === 'Prawns, "tiger" 16/20');

    expect(dataRow, "the ingredient row survived the round trip").toBeDefined();
    expect(dataRow?.[1]).toBe("17.5");
    expect(dataRow?.[8]).toBe("UE-1042 UE-1046");
  });
});
