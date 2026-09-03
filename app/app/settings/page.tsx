import { eq } from "drizzle-orm";
import { SetupNotice } from "@/components/SetupNotice";
import { SettingsForm } from "@/components/forms/SettingsForm";
import { Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { loadWorkspace } from "@/lib/data/load";

export default async function SettingsPage() {
  const state = await loadWorkspace();

  if (!state.ok) {
    return (
      <>
        <PageHeader title="Settings" sub="Rates, tax and quote defaults." />
        <SetupNotice state={state} />
      </>
    );
  }

  const [row] = await db.select().from(s.settings).where(eq(s.settings.id, 1)).limit(1);

  return (
    <>
      <PageHeader
        title="Settings"
        sub="Rates, tax and quote defaults. These feed every quote the app produces."
      />
      <Card title="Rates and terms">
        <SettingsForm
          values={{
            staffHourlyCost: state.settings.staffHourlyCost,
            staffHourlyCharge: state.settings.staffHourlyCharge,
            gstRate: state.settings.gstRate,
            quoteValidityDays: state.settings.quoteValidityDays,
            depositPct: state.settings.depositPct,
            quoteRefPrefix: row?.quoteRefPrefix ?? "UE",
            quoteRefNext: row?.quoteRefNext ?? 1000,
          }}
        />
      </Card>
    </>
  );
}
