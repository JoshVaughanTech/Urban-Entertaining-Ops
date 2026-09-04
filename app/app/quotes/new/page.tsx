import { SetupNotice } from "@/components/SetupNotice";
import { QuoteBuilder } from "@/components/quotes/QuoteBuilder";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { loadWorkspace } from "@/lib/data/load";
import { toCatalogueInput } from "@/lib/engine/catalogue";
import { addDays, todayISO } from "@/lib/engine/format";

export const metadata = { title: "New quote" };

export default async function NewQuotePage() {
  const state = await loadWorkspace();

  return (
    <>
      <PageHeader
        title="New quote"
        sub="Enter the event, pick the package that fits, adjust the numbers."
      />

      {!state.ok ? (
        <SetupNotice state={state} />
      ) : state.cat.packages.size === 0 ? (
        <Card>
          <EmptyState title="No packages to quote from">
            Add a package first — that is what a quote is built on.
          </EmptyState>
        </Card>
      ) : (
        <QuoteBuilder
          catalogue={toCatalogueInput(state.cat)}
          settings={state.settings}
          initial={{
            event: {
              clientName: "",
              contactEmail: null,
              eventDate: addDays(todayISO(), 30),
              guests: 80,
              style: "cocktail",
              durationHours: 3,
              venue: null,
              dietary: [],
              notes: null,
            },
            packageId: null,
            pricePerHead: null,
            discount: 0,
            addonIds: [],
            customLines: [],
          }}
        />
      )}
    </>
  );
}
