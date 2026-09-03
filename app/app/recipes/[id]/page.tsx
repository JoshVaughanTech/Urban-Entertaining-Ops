import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { SetupNotice } from "@/components/SetupNotice";
import { DeleteButton } from "@/components/forms/DeleteButton";
import { RecipeForm } from "@/components/forms/RecipeForm";
import { Card, PageHeader } from "@/components/ui";
import { deleteRecipe } from "@/lib/actions/catalogue";
import { loadWorkspace } from "@/lib/data/load";
import { db } from "@/lib/db";
import * as sc from "@/lib/db/schema";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";
  const state = await loadWorkspace();

  if (!state.ok) {
    return (
      <>
        <PageHeader title="Recipe" />
        <SetupNotice state={state} />
      </>
    );
  }

  const recipe = isNew ? null : state.cat.recipes.get(id);
  if (!isNew && !recipe) notFound();

  const [row] = recipe
    ? await db.select().from(sc.recipes).where(eq(sc.recipes.id, recipe.id)).limit(1)
    : [];

  const ingredients = [...state.cat.ingredients.values()]
    .map((i) => ({ id: i.id, name: i.name, unit: i.unit, costPerUnit: i.costPerUnit }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const usedByMenuItems = recipe
    ? [...state.cat.menuItems.values()].filter((m) => m.recipeId === recipe.id)
    : [];

  return (
    <>
      <PageHeader title={isNew ? "New recipe" : (recipe?.name ?? "Recipe")} />

      <Card>
        <RecipeForm
          values={{
            id: recipe?.id,
            name: recipe?.name ?? "",
            yieldPortions: recipe?.yieldPortions ?? 10,
            notes: row?.notes ?? null,
            active: row?.active ?? true,
            items: recipe?.items ?? [],
          }}
          ingredients={ingredients}
        />
      </Card>

      {recipe ? (
        <Card title="Danger zone">
          <p style={{ color: "var(--muted)", marginTop: 0 }}>
            {usedByMenuItems.length > 0
              ? `${usedByMenuItems.map((m) => m.name).join(", ")} point at this recipe. Deleting is refused while that is true.`
              : "No menu item points at this recipe, so it can be deleted safely."}
          </p>
          <DeleteButton action={deleteRecipe} id={recipe.id} label="Delete recipe" />
        </Card>
      ) : null}
    </>
  );
}
