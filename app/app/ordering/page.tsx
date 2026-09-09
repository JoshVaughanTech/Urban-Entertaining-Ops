import { Fragment } from "react";
import Link from "next/link";
import { SetupNotice } from "@/components/SetupNotice";
import { OrderedCheckbox, SendPurchaseOrders } from "@/components/orders/OrderingActions";
import { Card, EmptyState, PageHeader, Tag, buttonClass } from "@/components/ui";
import { GroupRow, Stat, Stats, Table, ui } from "@/components/ui/table";
import { loadWorkspace } from "@/lib/data/load";
import { buildOrdering, loadOrderState } from "@/lib/data/orders";
import { db } from "@/lib/db";
import { emailIsConfigured } from "@/lib/email/send";
import {
  addDays,
  money,
  qty as fmtQty,
  qtyNeeded,
  shortDate,
  todayISO,
} from "@/lib/engine/format";
/* Straight from the stylesheet, not from components/ui/form. That module is
   "use client", and a plain object exported across the client boundary
   arrives here as undefined — the classes silently vanish and the form
   renders unstyled. A server component imports the CSS module directly. */
import form from "@/components/ui/form.module.css";

export const metadata = { title: "Ordering" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function OrderingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;

  /* Default to the fortnight ahead — the window staff actually shop for. */
  const from = params.from && ISO.test(params.from) ? params.from : todayISO();
  const to = params.to && ISO.test(params.to) ? params.to : addDays(todayISO(), 14);

  const state = await loadWorkspace();

  if (!state.ok) {
    return (
      <>
        <PageHeader
          title="Ordering"
          sub="Everything the confirmed events need, rolled up and rounded to supplier packs."
        />
        <SetupNotice state={state} />
      </>
    );
  }

  const backwards = from > to;
  const view = backwards
    ? { quotes: [], lines: [], groups: [], warnings: [], totalCost: 0 }
    : await buildOrdering(db, from, to);
  const order = backwards ? { id: null, status: "draft" as const, ordered: {} } : await loadOrderState(db, from, to);

  const missingEmail = view.groups
    .filter((g) => !g.contactEmail)
    .map((g) => g.supplierName ?? "No supplier");

  return (
    <>
      <PageHeader
        title="Ordering"
        sub="Everything the confirmed events need, rolled up and rounded to supplier packs."
      />

      <div className={ui.splitGrid}>
        <div className={ui.stack}>
          <Card title="Order window">
            {/* Two fields to a row, not three. This column is a fixed 340px
                track, which leaves ~94px per field once the card's padding is
                taken off — narrower than a date input can render, and narrower
                than "Update" can be. The row then overflowed, widening the card
                past its own grid track and closing the gutter against the
                supplier list. Dates side by side and the button beneath both
                fit, and it matches how the quote builder pairs its fields. */}
            <form method="get">
              <div className={form.row}>
                <div className={form.field}>
                  <label className={form.label} htmlFor="from">
                    From
                  </label>
                  <input id="from" name="from" type="date" defaultValue={from} className={form.control} />
                </div>
                <div className={form.field}>
                  <label className={form.label} htmlFor="to">
                    To
                  </label>
                  <input id="to" name="to" type="date" defaultValue={to} className={form.control} />
                </div>
              </div>
              <div className={form.field}>
                <button type="submit" className={buttonClass("ghost")}>
                  Update
                </button>
              </div>
            </form>

            {backwards ? (
              <p style={{ color: "var(--red)" }}>That window starts after it ends.</p>
            ) : null}

            <span className={form.label}>Confirmed events in window</span>
            {view.quotes.length === 0 ? (
              <div className={ui.muted}>
                No confirmed events. Confirm a quote to see what it needs.
              </div>
            ) : (
              view.quotes.map((quote) => (
                <div
                  key={quote.id}
                  style={{ padding: "8px 0", borderBottom: "1px solid var(--line-soft)" }}
                >
                  <div style={{ fontWeight: 600 }}>
                    <Link href={`/app/quotes/${quote.id}`}>{quote.clientName}</Link>
                  </div>
                  <div className={ui.muted}>
                    {shortDate(quote.eventDate)} · {quote.guests} guests · {quote.ref}
                  </div>
                </div>
              ))
            )}
          </Card>

          <Card>
            <Stats columns={2}>
              <Stat label="Lines to order" value={view.lines.length} />
              <Stat label="Estimated spend" value={money(view.totalCost)} />
            </Stats>
            {order.status === "placed" ? (
              <p style={{ margin: "10px 0 0" }}>
                <Tag tone="ok">Orders sent for this window</Tag>
              </p>
            ) : null}
          </Card>

          {view.warnings.length > 0 ? (
            <Card title="Cannot be ordered">
              <p className={`${ui.muted} ${ui.small}`} style={{ marginTop: 0 }}>
                These are on a confirmed event but have nothing to order against.
              </p>
              {view.warnings.map((warning) => (
                <p key={warning.message} style={{ margin: "6px 0 0" }}>
                  <Tag tone="warn">{warning.quoteRefs.join(", ")}</Tag> {warning.message}
                </p>
              ))}
            </Card>
          ) : null}
        </div>

        <Card title="Order list by supplier">
          {view.lines.length === 0 ? (
            <EmptyState title="Nothing to order yet">
              Widen the window or confirm a quote.
            </EmptyState>
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <th />
                    <th>Ingredient</th>
                    <th className={ui.num}>Needed</th>
                    <th className={ui.num}>Order</th>
                    <th className={ui.num}>Cost</th>
                    <th>For</th>
                  </tr>
                </thead>
                <tbody>
                  {view.groups.map((group) => (
                    <Fragment key={group.supplierId ?? "none"}>
                      <GroupRow
                        span={6}
                        label={group.supplierName ?? "No supplier"}
                        meta={
                          group.contactEmail
                            ? money(group.cost)
                            : `${money(group.cost)} — no contact email, order by hand`
                        }
                      />
                      {group.lines.map((line) => {
                        const ordered = order.ordered[line.ingredientId] ?? false;
                        return (
                          <tr key={line.ingredientId} style={{ opacity: ordered ? 0.45 : 1 }}>
                            <td>
                              <OrderedCheckbox
                                from={from}
                                to={to}
                                ingredientId={line.ingredientId}
                                ordered={ordered}
                                label={line.ingredientName}
                              />
                            </td>
                            <td>{line.ingredientName}</td>
                            <td className={ui.num}>
                              {qtyNeeded(line.neededQty, line.unit)}
                            </td>
                            <td className={ui.num}>
                              <b>
                                {line.packs} × {fmtQty(line.packSize)}
                                {line.unit}
                              </b>
                            </td>
                            <td className={ui.num}>{money(line.cost)}</td>
                            <td className={`${ui.muted} ${ui.small}`}>
                              {line.quoteRefs.join(", ")}
                            </td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td />
                        <td colSpan={5}>
                          <a
                            href={`/app/ordering/export?from=${from}&to=${to}&supplier=${
                              group.supplierId ?? "none"
                            }`}
                            className={buttonClass("ghost")}
                            style={{ padding: "4px 10px" }}
                          >
                            Download {group.supplierName ?? "unassigned"} CSV
                          </a>
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </Table>

              <div style={{ marginTop: 16 }}>
                <SendPurchaseOrders
                  from={from}
                  to={to}
                  supplierCount={view.groups.length}
                  missingEmail={missingEmail}
                  emailConfigured={emailIsConfigured()}
                />
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
