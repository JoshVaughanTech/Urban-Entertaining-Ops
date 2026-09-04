import Link from "next/link";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, EmptyState, PageHeader, Tag, buttonClass } from "@/components/ui";
import { Table, ui } from "@/components/ui/table";
import { loadWorkspace } from "@/lib/data/load";
import { packagesUsingMenuItem } from "@/lib/engine/catalogue";
import { moneyPrecise, qty as fmtQty } from "@/lib/engine/format";
import { menuItemCostPerHead } from "@/lib/engine/pricing";
import { DIETARY_LABELS } from "@/lib/engine/types";

export const metadata = { title: "Menu items" };

export default async function MenuItemsPage() {
  const state = await loadWorkspace();

  return (
    <>
      <PageHeader
        title="Menu items"
        sub="What goes into a package. Each one points at a recipe and a serving size."
      />

      <div className={ui.chips} style={{ marginBottom: 16 }}>
        <Link href="/app/recipes" className={ui.chip}>
          Recipes
        </Link>
        <Link href="/app/recipes?tab=ingredients" className={ui.chip}>
          Ingredients
        </Link>
        <Link href="/app/menu-items" className={`${ui.chip} ${ui.chipOn}`} aria-current="page">
          Menu items
        </Link>
        <Link href="/app/suppliers" className={ui.chip}>
          Suppliers
        </Link>
        <span style={{ flex: 1 }} />
        <Link href="/app/menu-items/new" className={buttonClass()}>
          New menu item
        </Link>
      </div>

      {!state.ok ? (
        <SetupNotice state={state} />
      ) : state.cat.menuItems.size === 0 ? (
        <Card>
          <EmptyState title="No menu items yet">
            A package is built from menu items. Add one once you have a recipe to point it at.
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <th>Menu item</th>
                <th>Recipe</th>
                <th className={ui.num}>Per guest</th>
                <th className={ui.num}>Cost per guest</th>
                <th>Dietary</th>
                <th>In packages</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...state.cat.menuItems.values()]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((item) => {
                  const recipe = item.recipeId ? state.cat.recipes.get(item.recipeId) : undefined;
                  const inPackages = packagesUsingMenuItem(state.cat).get(item.id) ?? [];

                  return (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td className={ui.small}>
                        {recipe ? recipe.name : <Tag tone="warn">No recipe</Tag>}
                      </td>
                      <td className={ui.num}>{fmtQty(item.portionsPerHead)}</td>
                      <td className={ui.num}>
                        {recipe ? moneyPrecise(menuItemCostPerHead(item.id, state.cat)) : "—"}
                      </td>
                      <td className={ui.small}>
                        {item.dietaryTags.length === 0
                          ? "—"
                          : item.dietaryTags.map((t) => DIETARY_LABELS[t]).join(", ")}
                      </td>
                      <td className={`${ui.muted} ${ui.small}`}>
                        {inPackages.length === 0
                          ? "Not in any package"
                          : inPackages.map((p) => p.name).join(", ")}
                      </td>
                      <td className={ui.num}>
                        <Link
                          href={`/app/menu-items/${item.id}`}
                          className={buttonClass("ghost")}
                          style={{ padding: "4px 10px" }}
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
