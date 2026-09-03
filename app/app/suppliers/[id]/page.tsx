import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { SetupNotice } from "@/components/SetupNotice";
import { DeleteButton } from "@/components/forms/DeleteButton";
import { SupplierForm } from "@/components/forms/SimpleForms";
import { Card, PageHeader } from "@/components/ui";
import { deleteSupplier } from "@/lib/actions/catalogue";
import { loadWorkspace } from "@/lib/data/load";
import { db } from "@/lib/db";
import * as sc from "@/lib/db/schema";

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";
  const state = await loadWorkspace();

  if (!state.ok) {
    return (
      <>
        <PageHeader title="Supplier" />
        <SetupNotice state={state} />
      </>
    );
  }

  const supplier = isNew ? null : state.cat.suppliers.get(id);
  if (!isNew && !supplier) notFound();

  const [row] = supplier
    ? await db.select().from(sc.suppliers).where(eq(sc.suppliers.id, supplier.id)).limit(1)
    : [];

  return (
    <>
      <PageHeader title={isNew ? "New supplier" : (supplier?.name ?? "Supplier")} />
      <Card>
        <SupplierForm
          values={{
            id: supplier?.id,
            name: supplier?.name ?? "",
            contactEmail: supplier?.contactEmail ?? null,
            notes: row?.notes ?? null,
          }}
        />
      </Card>

      {supplier ? (
        <Card title="Danger zone" className="dangerZone">
          <p style={{ color: "var(--muted)", marginTop: 0 }}>
            Deleting a supplier is refused while it still has ingredients.
          </p>
          <DeleteButton action={deleteSupplier} id={supplier.id} label="Delete supplier" />
        </Card>
      ) : null}
    </>
  );
}
