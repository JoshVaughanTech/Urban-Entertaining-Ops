import { notFound } from "next/navigation";
import { SetupNotice } from "@/components/SetupNotice";
import { DeleteButton } from "@/components/forms/DeleteButton";
import { AddonForm } from "@/components/forms/SimpleForms";
import { Card, PageHeader } from "@/components/ui";
import { deleteAddon } from "@/lib/actions/catalogue";
import { loadWorkspace } from "@/lib/data/load";

export default async function AddonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";
  const state = await loadWorkspace();

  if (!state.ok) {
    return (
      <>
        <PageHeader title="Add-on" />
        <SetupNotice state={state} />
      </>
    );
  }

  const addon = isNew ? null : state.cat.addons.get(id);
  if (!isNew && !addon) notFound();

  return (
    <>
      <PageHeader title={isNew ? "New add-on" : (addon?.name ?? "Add-on")} />

      <Card>
        <AddonForm
          values={{
            id: addon?.id,
            name: addon?.name ?? "",
            price: addon?.price ?? 0,
            pricingBasis: addon?.pricingBasis ?? "head",
            active: true,
          }}
        />
      </Card>

      {addon ? (
        <Card title="Danger zone">
          <p style={{ color: "var(--muted)", marginTop: 0 }}>
            Deleting is refused while a quote still includes this add-on. Mark it inactive instead.
          </p>
          <DeleteButton action={deleteAddon} id={addon.id} label="Delete add-on" />
        </Card>
      ) : null}
    </>
  );
}
