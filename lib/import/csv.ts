/* CSV parsing and validation for the catalogue import.
 *
 * Pure: no database, no framework. Returns every row it could read plus every
 * problem it found, so the screen can show a dry run before anything is
 * written. The commit step refuses to write at all if any error remains. */

export type CsvRow = Record<string, string>;

export type RowIssue = {
  /** 1-based line number in the file the user uploaded, header included. */
  line: number;
  column?: string;
  message: string;
};

/** Splits CSV text, honouring quoted fields, embedded commas, escaped quotes
 *  ("" inside a quoted field) and both line-ending conventions. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  // A byte-order mark from Excel would otherwise become part of the first header.
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  for (; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export function toObjects(rows: string[][]): { headers: string[]; records: CsvRow[] } {
  const [headerRow, ...rest] = rows;
  if (!headerRow) return { headers: [], records: [] };

  const headers = headerRow.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const records = rest.map((cells) => {
    const record: CsvRow = {};
    headers.forEach((h, i) => {
      record[h] = (cells[i] ?? "").trim();
    });
    return record;
  });

  return { headers, records };
}

const UNITS = ["kg", "L", "each", "dozen"] as const;
export type Unit = (typeof UNITS)[number];

export const INGREDIENT_HEADERS = ["name", "unit", "pack_size", "cost_per_unit", "supplier"];
export const RECIPE_HEADERS = ["recipe", "yield_portions", "ingredient", "qty"];

export const INGREDIENT_TEMPLATE = `name,unit,pack_size,cost_per_unit,supplier
Beef eye fillet,kg,2.5,62.00,Meatsmith
Sourdough loaf,each,1,6.50,Tivoli Road
Thickened cream,L,2,5.40,Bidfood
`;

export const RECIPE_TEMPLATE = `recipe,yield_portions,ingredient,qty
"Rare beef crostini, horseradish cream",40,Beef eye fillet,0.9
"Rare beef crostini, horseradish cream",40,Sourdough loaf,2
"Rare beef crostini, horseradish cream",40,Thickened cream,0.3
`;

export type IngredientImportRow = {
  line: number;
  name: string;
  unit: Unit;
  packSize: number;
  costPerUnit: number;
  supplier: string | null;
};

export type RecipeImportRow = {
  name: string;
  yieldPortions: number;
  items: { line: number; ingredient: string; qty: number }[];
};

export type ParseResult<T> = {
  rows: T[];
  issues: RowIssue[];
};

function missingHeaders(headers: string[], required: string[]): string[] {
  return required.filter((h) => !headers.includes(h));
}

export function parseIngredientCsv(text: string): ParseResult<IngredientImportRow> {
  const { headers, records } = toObjects(parseCsv(text));
  const issues: RowIssue[] = [];

  if (headers.length === 0) {
    return { rows: [], issues: [{ line: 1, message: "The file is empty." }] };
  }

  const missing = missingHeaders(headers, INGREDIENT_HEADERS);
  if (missing.length > 0) {
    return {
      rows: [],
      issues: [{ line: 1, message: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.` }],
    };
  }

  const rows: IngredientImportRow[] = [];
  const seen = new Map<string, number>();

  records.forEach((record, index) => {
    const line = index + 2; // header is line 1
    const name = record["name"] ?? "";

    if (!name) {
      issues.push({ line, column: "name", message: "Name is required." });
      return;
    }

    const key = name.toLowerCase();
    const firstSeen = seen.get(key);
    if (firstSeen) {
      issues.push({
        line,
        column: "name",
        message: `"${name}" is already on line ${firstSeen}.`,
      });
      return;
    }
    seen.set(key, line);

    const unit = record["unit"] as Unit;
    if (!UNITS.includes(unit)) {
      issues.push({
        line,
        column: "unit",
        message: `Unit must be one of ${UNITS.join(", ")} — got "${record["unit"]}".`,
      });
      return;
    }

    const packSize = Number(record["pack_size"]);
    if (!Number.isFinite(packSize) || packSize <= 0) {
      issues.push({
        line,
        column: "pack_size",
        message: `Pack size must be a number above zero — got "${record["pack_size"]}".`,
      });
      return;
    }

    const rawCost = (record["cost_per_unit"] ?? "").replace(/^\$/, "").replace(/,/g, "");
    const cost = Number(rawCost);
    if (!Number.isFinite(cost) || cost < 0) {
      issues.push({
        line,
        column: "cost_per_unit",
        message: `Cost must be an amount — got "${record["cost_per_unit"]}".`,
      });
      return;
    }

    rows.push({
      line,
      name,
      unit,
      packSize,
      costPerUnit: Math.round(cost * 100),
      supplier: record["supplier"] || null,
    });
  });

  return { rows, issues };
}

export function parseRecipeCsv(text: string): ParseResult<RecipeImportRow> {
  const { headers, records } = toObjects(parseCsv(text));
  const issues: RowIssue[] = [];

  if (headers.length === 0) {
    return { rows: [], issues: [{ line: 1, message: "The file is empty." }] };
  }

  const missing = missingHeaders(headers, RECIPE_HEADERS);
  if (missing.length > 0) {
    return {
      rows: [],
      issues: [{ line: 1, message: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.` }],
    };
  }

  const byRecipe = new Map<string, RecipeImportRow & { yieldLine: number }>();

  records.forEach((record, index) => {
    const line = index + 2;
    const name = record["recipe"] ?? "";
    const ingredient = record["ingredient"] ?? "";

    if (!name) {
      issues.push({ line, column: "recipe", message: "Recipe name is required." });
      return;
    }
    if (!ingredient) {
      issues.push({ line, column: "ingredient", message: "Ingredient is required." });
      return;
    }

    const yieldPortions = Number(record["yield_portions"]);
    if (!Number.isFinite(yieldPortions) || yieldPortions <= 0) {
      issues.push({
        line,
        column: "yield_portions",
        message: `Yield must be a number above zero — got "${record["yield_portions"]}".`,
      });
      return;
    }

    const qty = Number(record["qty"]);
    if (!Number.isFinite(qty) || qty <= 0) {
      issues.push({
        line,
        column: "qty",
        message: `Quantity must be a number above zero — got "${record["qty"]}".`,
      });
      return;
    }

    const key = name.toLowerCase();
    const existing = byRecipe.get(key);

    if (!existing) {
      byRecipe.set(key, {
        name,
        yieldPortions,
        yieldLine: line,
        items: [{ line, ingredient, qty }],
      });
      return;
    }

    // Every line for one recipe has to agree on the yield.
    if (existing.yieldPortions !== yieldPortions) {
      issues.push({
        line,
        column: "yield_portions",
        message: `"${name}" was given a yield of ${existing.yieldPortions} on line ${existing.yieldLine}. Every line for a recipe must agree.`,
      });
      return;
    }

    if (existing.items.some((i) => i.ingredient.toLowerCase() === ingredient.toLowerCase())) {
      issues.push({
        line,
        column: "ingredient",
        message: `"${ingredient}" is listed twice for "${name}". Combine the quantities into one line.`,
      });
      return;
    }

    existing.items.push({ line, ingredient, qty });
  });

  const rows = [...byRecipe.values()].map(({ yieldLine: _yieldLine, ...row }) => row);
  return { rows, issues };
}
