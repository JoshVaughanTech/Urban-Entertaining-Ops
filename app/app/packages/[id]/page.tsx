import { notFound } from "next/navigation";
import { SetupNotice } from "@/components/SetupNotice";
import { DeleteButton } from "@/components/forms/DeleteButton";
import { PackageForm } from "@/components/forms/PackageForm";
import { Card, PageHeader } from "@/components/ui";
import { deletePackage } from "@/lib/actions/catalogue";
import { loadWorkspace } from "@/lib/data/load";

export default async function PackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isNew = id === "new";
  const state = await loadWorkspace();

  if (!state.ok) {
    return (
      <>
        <PageHeader title="Package" />
        <SetupNotice state={state} />
      </>
    );
  }

  const pkg = isNew ? null : state.cat.packages.get(id);
  if (!isNew && !pkg) notFound();

  const menuItems = [...state.cat.menuItems.values()]
    .map((m) => ({ id: m.id, name: m.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        title={isNew ? "New package" : (pkg?.name ?? "Package")}
        sub="Tiers price by guest count: the first tier a party fits under wins."
      />

      <Card>
        <PackageForm
          values={{
            id: pkg?.id,
            name: pkg?.name ?? "",
            style: pkg?.style ?? "cocktail",
            blurb: pkg?.blurb ?? null,
            minGuests: pkg?.minGuests ?? 20,
            maxGuests: pkg?.maxGuests ?? 150,
            staffPerGuests: pkg?.staffPerGuests ?? null,
            serviceHours: pkg?.serviceHours ?? 3,
            includes: pkg?.includes ?? [],
            adaptableDietary: pkg?.adaptableDietary ?? [],
            active: true,
            tiers: pkg?.tiers ?? [],
            menuItemIds: pkg?.menuItemIds ?? [],
          }}
          menuItems={menuItems}
        />
      </Card>

      {pkg ? (
        <Card title="Danger zone">
          <p style={{ color: "var(--muted)", marginTop: 0 }}>
            Deleting is refused while a quote still uses this package. Mark it inactive instead so
            old quotes keep rendering.
          </p>
          <DeleteButton action={deletePackage} id={pkg.id} label="Delete package" />
        </Card>
      ) : null}
    </>
  );
}
