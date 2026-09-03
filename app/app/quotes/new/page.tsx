import { EmptyState, PageHeader, Card } from "@/components/ui";

export default function Page() {
  return (
    <>
      <PageHeader title="New quote" sub="Enter the event, pick the package that fits, adjust the numbers." />
      <Card>
        <EmptyState title="Not built yet">The quote builder arrives in Phase 2.</EmptyState>
      </Card>
    </>
  );
}
