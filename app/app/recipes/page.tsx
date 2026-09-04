import { Fragment } from "react";
import Link from "next/link";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, EmptyState, PageHeader, Tag, buttonClass } from "@/components/ui";
import { GroupRow, Table, ui } from "@/components/ui/table";
import { loadWorkspace } from "@/lib/data/load";
import { recipesUsingIngredient } from "@/lib/engine/catalogue";
import { moneyPrecise, qty as fmtQty } from "@/lib/engine/format";
import { recipeCostPerPortion } from "@/lib/engine/pricing";
import type { Catalogue } from "@/lib/engine/types";

export const metadata = { title: "Recipes" };

type Tab = "recipes" | "ingredients";

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const active: Tab = tab === "ingredients" ? "ingredients" : "recipes";
  const state = await loadWorkspace();

  return (
    <>
      <PageHeader title="Recipes" sub="Every recipe costed from current ingredient prices." />

      <div className={ui.chips} style={{ marginBottom: 16 }}>
        <Link
          href="/app/recipes"
          className={`${ui.chip} ${active === "recipes" ? ui.chipOn : ""}`}
          aria-current={active === "recipes" ? "page" : undefined}
        >
          Recipes
        </Link>
        <Link
          href="/app/recipes?tab=ingredients"
          className={`${ui.chip} ${active === "ingredients" ? ui.chipOn : ""}`}
          aria-current={active === "ingredients" ? "page" : undefined}
        >
          Ingredients by supplier
        </Link>
        <span style={{ flex: 1 }} />
        <Link href="/app/recipes/import" className={buttonClass("ghost")}>
          Import CSV
        </Link>
      </div>

      {!state.ok ? (
        <SetupNotice state={state} />
      ) : active === "recipes" ? (
        <RecipesTab cat={state.cat} />
      ) : (
        <IngredientsTab cat={state.cat} />
      )}
    </>
  );
}

function RecipesTab({ cat }: { cat: Catalogue }) {
  const recipes = [...cat.recipes.values()];

  if (recipes.length === 0) {
    return (
      <Card>
        <EmptyState title="No recipes yet">
          A menu item needs a recipe before it can be costed or ordered against. Import a CSV or
          add one by hand.
        </EmptyState>
      </Card>
    );
  }

  return (
    <div className={ui.cardGridNarrow}>
      {recipes.map((recipe) => {
        const batch = recipe.items.reduce((sum, item) => {
          const ing = cat.ingredients.get(item.ingredientId);
          return ing ? sum + item.qty * ing.costPerUnit : sum;
        }, 0);

        return (
          <Card key={recipe.id}>
            <h2 className={ui.cardTitle} style={{ fontSize: 18, marginBottom: 0 }}>
              {recipe.name}
            </h2>
            <div className={ui.muted} style={{ marginBottom: 8 }}>
              Batch yields {fmtQty(recipe.yieldPortions)} portions
            </div>

            <Table>
              <tbody>
                {recipe.items.map((item) => {
                  const ing = cat.ingredients.get(item.ingredientId);
                  return (
                    <tr key={item.ingredientId}>
                      <td>{ing?.name ?? "Unknown ingredient"}</td>
                      <td className={ui.num}>{fmtQty(item.qty, ing?.unit)}</td>
                      <td className={ui.num}>
                        {ing ? moneyPrecise(item.qty * ing.costPerUnit) : "—"}
                      </td>
                    </tr>
                  );
                })}
                <tr className={ui.totalRow} style={{ fontSize: 13 }}>
                  <td>Batch cost</td>
                  <td />
                  <td className={ui.num}>{moneyPrecise(batch)}</td>
                </tr>
                <tr style={{ fontWeight: 700 }}>
                  <td style={{ borderBottom: 0 }}>Per portion</td>
                  <td style={{ borderBottom: 0 }} />
                  <td className={ui.num} style={{ borderBottom: 0 }}>
                    {moneyPrecise(recipeCostPerPortion(recipe, cat))}
                  </td>
                </tr>
              </tbody>
            </Table>

            <div className={ui.actions}>
              <Link href={`/app/recipes/${recipe.id}`} className={buttonClass("ghost")}>
                Edit
              </Link>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function IngredientsTab({ cat }: { cat: Catalogue }) {
  const ingredients = [...cat.ingredients.values()];

  if (ingredients.length === 0) {
    return (
      <Card>
        <EmptyState title="No ingredients yet">
          Ingredients carry the costs everything else is calculated from. Import a CSV to start.
        </EmptyState>
      </Card>
    );
  }

  const usedIn = recipesUsingIngredient(cat);

  const groups = new Map<string, typeof ingredients>();
  for (const ing of ingredients) {
    const key = ing.supplierId ?? "";
    groups.set(key, [...(groups.get(key) ?? []), ing]);
  }

  const ordered = [...groups.entries()].sort(([a], [b]) => {
    if (!a) return 1;
    if (!b) return -1;
    return (cat.suppliers.get(a)?.name ?? "").localeCompare(cat.suppliers.get(b)?.name ?? "");
  });

  return (
    <Card>
      <Table>
        <thead>
          <tr>
            <th>Ingredient</th>
            <th className={ui.num}>Unit</th>
            <th className={ui.num}>Pack</th>
            <th className={ui.num}>Cost / unit</th>
            <th>Used in</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {ordered.map(([supplierId, rows]) => (
            <Fragment key={supplierId || "none"}>
              <GroupRow
                span={6}
                label={cat.suppliers.get(supplierId)?.name ?? "No supplier"}
                meta={supplierId ? undefined : "these still have to be bought from someone"}
              />
              {[...rows]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((ing) => {
                  const uses = usedIn.get(ing.id) ?? [];
                  return (
                    <tr key={ing.id}>
                      <td>{ing.name}</td>
                      <td className={ui.num}>{ing.unit}</td>
                      <td className={ui.num}>{fmtQty(ing.packSize, ing.unit)}</td>
                      <td className={ui.num}>{moneyPrecise(ing.costPerUnit)}</td>
                      <td className={`${ui.muted} ${ui.small}`}>
                        {uses.length === 0 ? (
                          <Tag tone="warn">Unused</Tag>
                        ) : (
                          uses.map((r) => r.name.split(",")[0]).join(", ")
                        )}
                      </td>
                      <td className={ui.num}>
                        <Link
                          href={`/app/ingredients/${ing.id}`}
                          className={buttonClass("ghost")}
                          style={{ padding: "4px 10px" }}
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}
            </Fragment>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

