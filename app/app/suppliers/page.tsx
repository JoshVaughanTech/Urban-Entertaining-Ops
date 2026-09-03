import Link from "next/link";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, EmptyState, PageHeader, Tag, buttonClass } from "@/components/ui";
import { Table, ui } from "@/components/ui/table";
import { loadWorkspace } from "@/lib/data/load";

export default async function SuppliersPage() {
  const state = await loadWorkspace();

  return (
    <>
      <PageHeader
        title="Suppliers"
        sub="Who we buy from. Purchase orders go to the contact email on each."
      />

      <div className={ui.chips} style={{ marginBottom: 16 }}>
        <Link href="/app/recipes" className={ui.chip}>
          Recipes
        </Link>
        <Link href="/app/recipes?tab=ingredients" className={ui.chip}>
          Ingredients
        </Link>
        <Link href="/app/menu-items" className={ui.chip}>
          Menu items
        </Link>
        <Link href="/app/suppliers" className={`${ui.chip} ${ui.chipOn}`} aria-current="page">
          Suppliers
        </Link>
        <span style={{ flex: 1 }} />
        <Link href="/app/suppliers/new" className={buttonClass()}>
          New supplier
        </Link>
      </div>

      {!state.ok ? (
        <SetupNotice state={state} />
      ) : state.cat.suppliers.size === 0 ? (
        <Card>
          <EmptyState title="No suppliers yet">
            Add a supplier so ingredients can be grouped and ordered.
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Contact email</th>
                <th className={ui.num}>Ingredients</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...state.cat.suppliers.values()]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((supplier) => {
                  const count = [...state.cat.ingredients.values()].filter(
                    (i) => i.supplierId === supplier.id,
                  ).length;

                  return (
                    <tr key={supplier.id}>
                      <td>{supplier.name}</td>
                      <td>
                        {supplier.contactEmail ?? (
                          <Tag tone="warn">No email — cannot send orders</Tag>
                        )}
                      </td>
                      <td className={ui.num}>{count}</td>
                      <td className={ui.num}>
                        <Link
                          href={`/app/suppliers/${supplier.id}`}
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
