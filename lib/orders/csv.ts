/* Purchase-order CSVs, one per supplier.
 *
 * Pure: hand it a supplier group and get back the text. The same string is
 * what downloads from the screen and what gets attached to the supplier's
 * email, so a supplier and the office are never looking at different sheets. */

import { moneyPrecise } from "@/lib/engine/format";
import type { RollupLine, SupplierGroup } from "@/lib/engine/ordering";

export type OrderCsvMeta = {
  windowFrom: string;
  windowTo: string;
  business: string;
};

const HEADERS = [
  "Ingredient",
  "Order",
  "Unit",
  "Packs",
  "Pack size",
  "Needed",
  "Unit cost",
  "Line cost",
  "For",
] as const;

/** Wraps a field only when it has to be — a sheet full of unnecessary quotes
 *  is harder for a supplier to read. */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function csvRow(values: string[]): string {
  return values.map(csvField).join(",");
}

const trim = (n: number): string => String(Math.round(n * 1000) / 1000);

export function lineToRow(line: RollupLine): string[] {
  return [
    line.ingredientName,
    trim(line.orderQty),
    line.unit,
    String(line.packs),
    trim(line.packSize),
    trim(line.neededQty),
    moneyPrecise(line.unitCost),
    moneyPrecise(line.cost),
    line.quoteRefs.join(" "),
  ];
}

export function supplierCsv(group: SupplierGroup, meta: OrderCsvMeta): string {
  const rows: string[] = [
    csvRow([`${meta.business} purchase order`]),
    csvRow([group.supplierName ?? "No supplier"]),
    csvRow([`Delivery window ${meta.windowFrom} to ${meta.windowTo}`]),
    "",
    csvRow([...HEADERS]),
    ...group.lines.map((line) => csvRow(lineToRow(line))),
    "",
    csvRow(["Total", "", "", "", "", "", "", moneyPrecise(group.cost), ""]),
  ];

  return `${rows.join("\r\n")}\r\n`;
}

/** "Damian Pike 2026-09-07 to 2026-09-20.csv" */
export function supplierCsvFilename(group: SupplierGroup, meta: OrderCsvMeta): string {
  const name = (group.supplierName ?? "No supplier").replace(/[^\w\s.-]+/g, "").trim();
  return `${name} ${meta.windowFrom} to ${meta.windowTo}.csv`.replace(/\s+/g, " ");
}
