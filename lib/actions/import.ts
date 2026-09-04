"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { denyReadOnly, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { parseIngredientCsv, parseRecipeCsv, type RowIssue } from "@/lib/import/csv";
import type { ImportKind, ImportPlanRow, ImportState } from "@/lib/import/types";


async function readCsv(data: FormData): Promise<{ csv: string; filename?: string }> {
  const file = data.get("file");
  if (file instanceof File && file.size > 0) {
    return { csv: await file.text(), filename: file.name };
  }
  const pasted = data.get("csv");
  return { csv: typeof pasted === "string" ? pasted : "" };
}

const kindOf = (data: FormData): ImportKind =>
  data.get("kind") === "recipes" ? "recipes" : "ingredients";

/** Dry run. Reads the file, validates every row, and works out what would be
 *  created and what would be updated — without writing anything. */
export async function previewImport(
  _prev: ImportState,
  data: FormData,
): Promise<ImportState> {
  await requireUser();

  const kind = kindOf(data);
  const { csv, filename } = await readCsv(data);

  if (!csv.trim()) {
    return { stage: "idle" as const, kind, csv: "", rows: [], issues: [{ line: 1, message: "Choose a file or paste some CSV." }] };
  }

  const plan = await buildPlan(kind, csv);
  return { stage: "preview", kind, csv, filename, ...plan };
}

/** Writes the import. Re-parses the same text rather than trusting the
 *  preview, so what gets written is exactly what was validated. One
 *  transaction: any failure leaves the catalogue untouched. */
export async function commitImport(_prev: ImportState, data: FormData): Promise<ImportState> {
  await requireUser();

  const kind = kindOf(data);
  const csv = String(data.get("csv") ?? "");

  /* Previewing is allowed for everyone — it validates a file and writes
     nothing. Committing is not. */
  const denied = await denyReadOnly();
  if (denied) {
    return { stage: "preview", kind, csv, rows: [], issues: [], message: denied.message };
  }

  const plan = await buildPlan(kind, csv);

  if (plan.issues.length > 0) {
    return {
      stage: "preview",
      kind,
      csv,
      ...plan,
      message: "Nothing was written — the file still has errors.",
    };
  }

  if (plan.rows.length === 0) {
    return { stage: "preview", kind, csv, ...plan, message: "There was nothing to import." };
  }

  try {
    if (kind === "ingredients") {
      await commitIngredients(csv);
    } else {
      await commitRecipes(csv);
    }
  } catch (err) {
    return {
      stage: "preview",
      kind,
      csv,
      ...plan,
      message: `Nothing was written — ${err instanceof Error ? err.message : "the import failed"}.`,
    };
  }

  for (const path of ["/app/recipes", "/app/packages", "/app/ordering"]) {
    revalidatePath(path, "layout");
  }

  const created = plan.rows.filter((r) => r.action === "create").length;
  const updated = plan.rows.length - created;

  return {
    stage: "done",
    kind,
    csv: "",
    rows: [],
    issues: [],
    message:
      `Imported ${plan.rows.length} ${kind === "ingredients" ? "ingredient" : "recipe"}${plan.rows.length === 1 ? "" : "s"} — ` +
      `${created} new, ${updated} updated.`,
  };
}

/* ── planning ──────────────────────────────────────────────────────────── */

async function buildPlan(
  kind: ImportKind,
  csv: string,
): Promise<{ rows: ImportPlanRow[]; issues: RowIssue[] }> {
  if (kind === "ingredients") {
    const { rows, issues } = parseIngredientCsv(csv);
    const existing = await db
      .select({ id: s.ingredients.id, name: s.ingredients.name })
      .from(s.ingredients);
    const byName = new Map(existing.map((r) => [r.name.toLowerCase(), r.id]));

    return {
      issues,
      rows: rows.map((row) => ({
        line: row.line,
        label: row.name,
        detail:
          `${row.packSize} ${row.unit} pack · $${(row.costPerUnit / 100).toFixed(2)} per ${row.unit}` +
          (row.supplier ? ` · ${row.supplier}` : " · no supplier"),
        action: byName.has(row.name.toLowerCase()) ? "update" : "create",
      })),
    };
  }

  const { rows, issues } = parseRecipeCsv(csv);
  const allIssues = [...issues];

  const ingredients = await db
    .select({ id: s.ingredients.id, name: s.ingredients.name })
    .from(s.ingredients);
  const ingredientByName = new Map(ingredients.map((r) => [r.name.toLowerCase(), r.id]));

  const existingRecipes = await db.select({ name: s.recipes.name }).from(s.recipes);
  const recipeNames = new Set(existingRecipes.map((r) => r.name.toLowerCase()));

  const plan: ImportPlanRow[] = [];

  for (const row of rows) {
    const unknown = row.items.filter((i) => !ingredientByName.has(i.ingredient.toLowerCase()));

    if (unknown.length > 0) {
      for (const item of unknown) {
        allIssues.push({
          line: item.line,
          column: "ingredient",
          message: `"${item.ingredient}" is not in the ingredient list. Import it first.`,
        });
      }
      continue;
    }

    plan.push({
      line: row.items[0]?.line ?? 2,
      label: row.name,
      detail: `${row.items.length} ingredients · yields ${row.yieldPortions} portions`,
      action: recipeNames.has(row.name.toLowerCase()) ? "update" : "create",
    });
  }

  return { rows: plan, issues: allIssues.sort((a, b) => a.line - b.line) };
}

/* ── writing ───────────────────────────────────────────────────────────── */

async function commitIngredients(csv: string) {
  const { rows } = parseIngredientCsv(csv);

  await db.transaction(async (tx) => {
    /* Suppliers named in the file are created if they don't exist yet — a
       supplier is only a name until someone adds a contact email. */
    const supplierNames = [...new Set(rows.flatMap((r) => (r.supplier ? [r.supplier] : [])))];
    const supplierIds = new Map<string, string>();

    if (supplierNames.length > 0) {
      const existing = await tx
        .select({ id: s.suppliers.id, name: s.suppliers.name })
        .from(s.suppliers);
      for (const row of existing) supplierIds.set(row.name.toLowerCase(), row.id);

      const missing = supplierNames.filter((n) => !supplierIds.has(n.toLowerCase()));
      if (missing.length > 0) {
        const created = await tx
          .insert(s.suppliers)
          .values(missing.map((name) => ({ name })))
          .returning({ id: s.suppliers.id, name: s.suppliers.name });
        for (const row of created) supplierIds.set(row.name.toLowerCase(), row.id);
      }
    }

    const existingIngredients = await tx
      .select({ id: s.ingredients.id, name: s.ingredients.name })
      .from(s.ingredients);
    const byName = new Map(existingIngredients.map((r) => [r.name.toLowerCase(), r.id]));

    for (const row of rows) {
      const values = {
        name: row.name,
        unit: row.unit,
        packSize: String(row.packSize),
        costPerUnit: row.costPerUnit,
        supplierId: row.supplier ? (supplierIds.get(row.supplier.toLowerCase()) ?? null) : null,
      };

      const id = byName.get(row.name.toLowerCase());
      if (id) {
        await tx
          .update(s.ingredients)
          .set({ ...values, updatedAt: new Date(), costUpdatedAt: new Date() })
          .where(eq(s.ingredients.id, id));
      } else {
        await tx.insert(s.ingredients).values(values);
      }
    }
  });
}

async function commitRecipes(csv: string) {
  const { rows } = parseRecipeCsv(csv);

  await db.transaction(async (tx) => {
    const ingredients = await tx
      .select({ id: s.ingredients.id, name: s.ingredients.name })
      .from(s.ingredients);
    const ingredientByName = new Map(ingredients.map((r) => [r.name.toLowerCase(), r.id]));

    const existing = await tx.select({ id: s.recipes.id, name: s.recipes.name }).from(s.recipes);
    const recipeByName = new Map(existing.map((r) => [r.name.toLowerCase(), r.id]));

    for (const row of rows) {
      let recipeId = recipeByName.get(row.name.toLowerCase());

      if (recipeId) {
        await tx
          .update(s.recipes)
          .set({ yieldPortions: String(row.yieldPortions), updatedAt: new Date() })
          .where(eq(s.recipes.id, recipeId));
        await tx.delete(s.recipeItems).where(eq(s.recipeItems.recipeId, recipeId));
      } else {
        const [created] = await tx
          .insert(s.recipes)
          .values({ name: row.name, yieldPortions: String(row.yieldPortions) })
          .returning({ id: s.recipes.id });
        recipeId = created!.id;
      }

      await tx.insert(s.recipeItems).values(
        row.items.map((item) => ({
          recipeId: recipeId!,
          ingredientId: ingredientByName.get(item.ingredient.toLowerCase())!,
          qty: String(item.qty),
        })),
      );
    }
  });
}
