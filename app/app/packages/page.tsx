import Link from "next/link";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, EmptyState, PageHeader, Tag, buttonClass } from "@/components/ui";
import { Table, ui } from "@/components/ui/table";
import { loadWorkspace } from "@/lib/data/load";
import { menuItemCostPerHead, foodCostPerHead } from "@/lib/engine/pricing";
import { moneyPrecise, percent, qty as fmtQty } from "@/lib/engine/format";
import { sortTiers } from "@/lib/engine/pricing";

export const metadata = { title: "Packages" };

/** Food cost above this share of the lowest tier gets an amber flag, per the
 *  mockup. It is a prompt to look, not a failure. */
const FOOD_COST_WARN = 0.3;

export default async function PackagesPage() {
  const state = await loadWorkspace();

  return (
    <>
      <PageHeader
        title="Packages"
        sub="What Urban Entertaining sells, with live food cost against each price tier."
      />

      {!state.ok ? (
        <SetupNotice state={state} />
      ) : state.cat.packages.size === 0 ? (
        <Card>
          <EmptyState title="No packages yet">
            Packages are what staff quote from. Add the first one to start quoting.
          </EmptyState>
        </Card>
      ) : (
        <div className={ui.cardGrid}>
          {[...state.cat.packages.values()].map((pkg) => {
            const food = foodCostPerHead(pkg, state.cat);
            const tiers = sortTiers(pkg.tiers);
            const lowest = tiers[tiers.length - 1]?.pricePerHead ?? 0;
            const share = lowest > 0 ? food / lowest : 0;

            return (
              <Card key={pkg.id}>
                <h2 className={ui.cardTitle} style={{ marginBottom: 2 }}>
                  {pkg.name}
                </h2>
                <div className={ui.muted} style={{ marginBottom: 10 }}>
                  {pkg.blurb}{" "}
                  <Tag tone="ok">
                    {pkg.minGuests}–{pkg.maxGuests} guests
                  </Tag>
                </div>

                <div className={ui.tierRow}>
                  {tiers.map((tier, i) => {
                    const from = i === 0 ? null : (tiers[i - 1]?.upToGuests ?? 0) + 1;
                    return (
                      <div key={tier.upToGuests} className={ui.tier}>
                        <b className={ui.tierPrice}>{moneyPrecise(tier.pricePerHead)}</b>
                        <span className={ui.statLabel}>
                          {from === null
                            ? `up to ${tier.upToGuests}`
                            : `${from}–${tier.upToGuests}`}{" "}
                          guests
                        </span>
                      </div>
                    );
                  })}
                </div>

                <Table>
                  <tbody>
                    {pkg.menuItemIds.map((id) => {
                      const item = state.cat.menuItems.get(id);
                      if (!item) return null;
                      return (
                        <tr key={id}>
                          <td>
                            {item.name}
                            <div className={`${ui.muted} ${ui.small}`}>
                              {fmtQty(item.portionsPerHead)} per guest
                              {item.recipeId ? "" : " · no recipe"}
                            </div>
                          </td>
                          <td className={ui.num}>
                            {item.recipeId ? (
                              moneyPrecise(menuItemCostPerHead(id, state.cat))
                            ) : (
                              <Tag tone="warn">Uncosted</Tag>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className={ui.totalRow} style={{ fontSize: 13 }}>
                      <td>Food cost per guest</td>
                      <td className={ui.num}>
                        {moneyPrecise(food)}{" "}
                        <Tag tone={share > FOOD_COST_WARN ? "warn" : "ok"}>
                          {percent(share)} of lowest tier
                        </Tag>
                      </td>
                    </tr>
                  </tbody>
                </Table>

                {pkg.includes.length > 0 ? (
                  <div className={ui.muted} style={{ marginTop: 10, fontSize: 12 }}>
                    {pkg.includes.join(" · ")}
                  </div>
                ) : null}

                <div className={ui.actions}>
                  <Link href={`/app/packages/${pkg.id}`} className={buttonClass("ghost")}>
                    Edit
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
