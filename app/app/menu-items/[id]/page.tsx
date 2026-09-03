import { notFound } from "next/navigation";
import { SetupNotice } from "@/components/SetupNotice";
import { DeleteButton } from "@/components/forms/DeleteButton";
import { MenuItemForm } from "@/components/forms/SimpleForms";
import { Card, PageHeader } from "@/components/ui";
import { deleteMenuItem } from "@/lib/actions/catalogue";
import { loadWorkspace } from "@/lib/data/load";
import { packagesUsingMenuItem } from "@/lib/engine/catalogue";

export default async function MenuItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";
  const state = await loadWorkspace();

  if (!state.ok) {
    return (
      <>
        <PageHeader title="Menu item" />
        <SetupNotice state={state} />
      </>
    );
  }

  const item = isNew ? null : state.cat.menuItems.get(id);
  if (!isNew && !item) notFound();

  const recipes = [...state.cat.recipes.values()]
    .map((r) => ({ id: r.id, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const inPackages = item ? (packagesUsingMenuItem(state.cat).get(item.id) ?? []) : [];

  return (
    <>
      <PageHeader title={isNew ? "New menu item" : (item?.name ?? "Menu item")} />

      <Card>
        <MenuItemForm
          values={{
            id: item?.id,
            name: item?.name ?? "",
            recipeId: item?.recipeId ?? null,
            portionsPerHead: item?.portionsPerHead ?? 1,
            dietaryTags: item?.dietaryTags ?? [],
            active: true,
          }}
          recipes={recipes}
        />
      </Card>

      {item ? (
        <Card title="Danger zone">
          <p style={{ color: "var(--muted)", marginTop: 0 }}>
            {inPackages.length > 0
              ? `In ${inPackages.map((p) => p.name).join(", ")}. Deleting is refused while that is true.`
              : "Not in any package, so it can be deleted safely."}
          </p>
          <DeleteButton action={deleteMenuItem} id={item.id} label="Delete menu item" />
        </Card>
      ) : null}
    </>
  );
}
