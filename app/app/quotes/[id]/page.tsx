import Link from "next/link";
import { notFound } from "next/navigation";
import { SetupNotice } from "@/components/SetupNotice";
import { QuoteBuilder } from "@/components/quotes/QuoteBuilder";
import { QuoteStatusActions } from "@/components/quotes/QuoteStatusActions";
import { Card, PageHeader, Tag } from "@/components/ui";
import { Stat, Stats, Table, ui } from "@/components/ui/table";
import { loadWorkspace } from "@/lib/data/load";
import { loadQuote, totalsFor } from "@/lib/data/quotes";
import { db } from "@/lib/db";
import { toCatalogueInput } from "@/lib/engine/catalogue";
import { longDate, money, moneyDeduction, percent, shortDate } from "@/lib/engine/format";
import { isMarginHealthy } from "@/lib/engine/pricing";
import { DIETARY_LABELS } from "@/lib/engine/types";
import { isEditable } from "@/lib/quotes/types";
import styles from "../quotes.module.css";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await loadWorkspace();

  if (!state.ok) {
    return (
      <>
        <PageHeader title="Quote" />
        <SetupNotice state={state} />
      </>
    );
  }

  const quote = await loadQuote(db, id);
  if (!quote) notFound();

  const editable = isEditable(quote.status);

  /* A draft is still being written, so it opens in the builder. Anything
     else is a record of what the client was told and renders read-only. */
  if (editable) {
    return (
      <>
        <PageHeader
          title={`${quote.ref} — ${quote.event.clientName}`}
          sub="Draft. Nothing has gone to the client yet."
        />
        <QuoteBuilder
          catalogue={toCatalogueInput(state.cat)}
          settings={state.settings}
          initial={{
            quoteId: quote.id,
            event: quote.event,
            packageId: quote.packageId,
            pricePerHead: quote.pricePerHead,
            discount: quote.discount,
            addonIds: quote.addonIds,
            customLines: quote.lines
              .filter((l) => l.source === "custom")
              .map((l) => ({ label: l.label, qty: l.qty, unitPrice: l.unitPrice })),
          }}
        />
      </>
    );
  }

  const totals = totalsFor(quote, state.cat, state.settings);
  const pkg = quote.snapshot?.package ?? null;
  const menu = quote.snapshot?.menu ?? [];

  return (
    <>
      <PageHeader
        title={`${quote.ref} — ${quote.event.clientName}`}
        sub={`${longDate(quote.event.eventDate)} · ${quote.event.guests} guests${
          quote.event.venue ? ` · ${quote.event.venue}` : ""
        }`}
      />

      <div className={ui.stack}>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span className={`${styles.status} ${styles[quote.status]}`}>{quote.status}</span>
            <QuoteStatusActions id={quote.id} status={quote.status} />
          </div>

          <p className={`${ui.muted} ${ui.small}`} style={{ marginTop: 10, marginBottom: 0 }}>
            Sent {quote.sentAt ? shortDate(quote.sentAt.toISOString().slice(0, 10)) : "—"}
            {quote.confirmedAt
              ? ` · confirmed ${shortDate(quote.confirmedAt.toISOString().slice(0, 10))}`
              : ""}
            {" · "}
            Figures below are frozen from when the quote was sent, so a later price change cannot
            rewrite what the client was given.
          </p>
        </Card>

        <Card title="Quote">
          <Stats>
            <Stat label="Quote total" value={money(totals.total)} />
            <Stat label="Food + staff cost" value={money(totals.food + totals.staff)} />
            <Stat
              label="Gross margin"
              value={percent(totals.margin)}
              tone={isMarginHealthy(totals.margin) ? "green" : "red"}
            />
          </Stats>

          <Table>
            <thead>
              <tr>
                <th>Line</th>
                <th className={ui.num}>Qty</th>
                <th className={ui.num}>Unit</th>
                <th className={ui.num}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line) => (
                <tr key={line.sort}>
                  <td>
                    {line.label}
                    {line.source === "custom" ? <Tag tone="warn">Uncosted</Tag> : null}
                  </td>
                  <td className={ui.num}>{line.qty}</td>
                  <td className={ui.num}>{money(line.unitPrice)}</td>
                  <td className={ui.num}>{money(line.qty * line.unitPrice)}</td>
                </tr>
              ))}
              {quote.discount > 0 ? (
                <tr>
                  <td>Discount</td>
                  <td />
                  <td />
                  <td className={ui.num}>{moneyDeduction(quote.discount)}</td>
                </tr>
              ) : null}
              <tr className={ui.totalRow}>
                <td>Total inc. GST</td>
                <td />
                <td />
                <td className={ui.num}>{money(totals.total)}</td>
              </tr>
            </tbody>
          </Table>

          <p className={`${ui.muted} ${ui.small}`} style={{ marginTop: 6 }}>
            Includes {money(totals.gst)} GST.
          </p>
        </Card>

        {pkg ? (
          <Card title={pkg.name}>
            {pkg.includes.length > 0 ? (
              <>
                <p style={{ marginTop: 0, fontWeight: 700 }}>Included</p>
                <ul className={ui.muted} style={{ margin: "8px 0 0 18px", padding: 0 }}>
                  {pkg.includes.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            ) : null}

            {menu.length > 0 ? (
              <>
                <p style={{ marginTop: 16, fontWeight: 700 }}>Menu</p>
                <ul className={ui.muted} style={{ margin: "8px 0 0 18px", padding: 0 }}>
                  {menu.map((item) => (
                    <li key={item.id}>{item.name}</li>
                  ))}
                </ul>
              </>
            ) : null}

            {quote.event.dietary.length > 0 ? (
              <p className={ui.muted} style={{ marginTop: 16 }}>
                Dietary requirements catered for:{" "}
                {quote.event.dietary.map((d) => DIETARY_LABELS[d]).join(", ")}.
              </p>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <Link href="/app/quotes">← Back to quotes</Link>
        </Card>
      </div>
    </>
  );
}
