import { EmptyState, PageHeader, Card } from "@/components/ui";

export default function Page() {
  return (
    <>
      <PageHeader title="Quotes" sub="Every quote, from draft to confirmed." />
      <Card>
        <EmptyState title="No quotes yet">Quotes appear here once the builder is live in Phase 2.</EmptyState>
      </Card>
    </>
  );
}
