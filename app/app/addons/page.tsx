import Link from "next/link";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { Table, ui } from "@/components/ui/table";
import { loadWorkspace } from "@/lib/data/load";
import { moneyPrecise } from "@/lib/engine/format";

export default async function AddonsPage() {
  const state = await loadWorkspace();

  return (
    <>
      <PageHeader
        title="Add-ons"
        sub="Extras staff can put on a quote, charged per head or as a flat fee."
      />

      <div className={ui.chips} style={{ marginBottom: 16 }}>
        <Link href="/app/packages" className={ui.chip}>
          Packages
        </Link>
        <Link href="/app/addons" className={`${ui.chip} ${ui.chipOn}`} aria-current="page">
          Add-ons
        </Link>
        <span style={{ flex: 1 }} />
        <Link href="/app/addons/new" className={buttonClass()}>
          New add-on
        </Link>
      </div>

      {!state.ok ? (
        <SetupNotice state={state} />
      ) : state.cat.addons.size === 0 ? (
        <Card>
          <EmptyState title="No add-ons yet">
            Add-ons are the extras staff attach to a quote — bar service, styling, an extra hour.
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <th>Add-on</th>
                <th className={ui.num}>Price</th>
                <th>Charged</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...state.cat.addons.values()]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((addon) => (
                  <tr key={addon.id}>
                    <td>{addon.name}</td>
                    <td className={ui.num}>{moneyPrecise(addon.price)}</td>
                    <td>{addon.pricingBasis === "head" ? "Per head" : "Flat"}</td>
                    <td className={ui.num}>
                      <Link
                        href={`/app/addons/${addon.id}`}
                        className={buttonClass("ghost")}
                        style={{ padding: "4px 10px" }}
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
