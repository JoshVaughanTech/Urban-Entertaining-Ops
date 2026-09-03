import { EmptyState, PageHeader, Card } from "@/components/ui";

export default function Page() {
  return (
    <>
      <PageHeader title="Settings" sub="Rates, tax and quote defaults." />
      <Card>
        <EmptyState title="Not built yet">Settings become editable in Phase 1.</EmptyState>
      </Card>
    </>
  );
}
