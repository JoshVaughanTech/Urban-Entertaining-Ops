import { notFound } from "next/navigation";
import { SetupNotice } from "@/components/SetupNotice";
import { DeleteButton } from "@/components/forms/DeleteButton";
import { IngredientForm } from "@/components/forms/SimpleForms";
import { Card, PageHeader } from "@/components/ui";
import { deleteIngredient } from "@/lib/actions/catalogue";
import { loadWorkspace } from "@/lib/data/load";
import { recipesUsingIngredient } from "@/lib/engine/catalogue";

export default async function IngredientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";
  const state = await loadWorkspace();

  if (!state.ok) {
    return (
      <>
        <PageHeader title="Ingredient" />
        <SetupNotice state={state} />
      </>
    );
  }

  const ingredient = isNew ? null : state.cat.ingredients.get(id);
  if (!isNew && !ingredient) notFound();

  const suppliers = [...state.cat.suppliers.values()]
    .map((s) => ({ id: s.id, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const usedBy = ingredient ? (recipesUsingIngredient(state.cat).get(ingredient.id) ?? []) : [];

  return (
    <>
      <PageHeader
        title={isNew ? "New ingredient" : (ingredient?.name ?? "Ingredient")}
        sub={
          isNew
            ? undefined
            : "Changing this cost re-costs every recipe, package and order that uses it."
        }
      />

      <Card>
        <IngredientForm
          values={{
            id: ingredient?.id,
            name: ingredient?.name ?? "",
            unit: ingredient?.unit ?? "kg",
            packSize: ingredient?.packSize ?? 1,
            costPerUnit: ingredient?.costPerUnit ?? 0,
            supplierId: ingredient?.supplierId ?? null,
            active: true,
          }}
          suppliers={suppliers}
        />
      </Card>

      {ingredient ? (
        <Card title="Danger zone">
          <p style={{ color: "var(--muted)", marginTop: 0 }}>
            {usedBy.length > 0
              ? `Used by ${usedBy.length} recipe${usedBy.length === 1 ? "" : "s"}: ${usedBy
                  .map((r) => r.name)
                  .join(", ")}. Deleting is refused while that is true — mark it inactive instead.`
              : "Not used by any recipe, so it can be deleted safely."}
          </p>
          <DeleteButton action={deleteIngredient} id={ingredient.id} label="Delete ingredient" />
        </Card>
      ) : null}
    </>
  );
}
