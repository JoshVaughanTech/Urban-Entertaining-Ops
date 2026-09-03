import { EmptyState, PageHeader, Card } from "@/components/ui";

export default function Page() {
  return (
    <>
      <PageHeader title="Ordering" sub="Everything the confirmed events need, rolled up and rounded to supplier packs." />
      <Card>
        <EmptyState title="Nothing to order yet">The supplier rollup arrives in Phase 4.</EmptyState>
      </Card>
    </>
  );
}
