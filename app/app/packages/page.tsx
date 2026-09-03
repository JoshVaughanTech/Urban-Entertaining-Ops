import { EmptyState, PageHeader, Card } from "@/components/ui";

export default function Page() {
  return (
    <>
      <PageHeader title="Packages" sub="What Urban Entertaining sells, with live food cost against each price tier." />
      <Card>
        <EmptyState title="No packages loaded">Run the seed once the database is connected — Phase 1.</EmptyState>
      </Card>
    </>
  );
}
