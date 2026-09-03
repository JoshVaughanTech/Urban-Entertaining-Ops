import { EmptyState, PageHeader, Card } from "@/components/ui";

export default function Page() {
  return (
    <>
      <PageHeader title="Recipes" sub="Every recipe costed from current ingredient prices." />
      <Card>
        <EmptyState title="No recipes loaded">Run the seed once the database is connected — Phase 1.</EmptyState>
      </Card>
    </>
  );
}
