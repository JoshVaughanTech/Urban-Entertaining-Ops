import Link from "next/link";
import { SetupNotice } from "@/components/SetupNotice";
import { ConfirmButton } from "@/components/quotes/QuoteStatusActions";
import { Card, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { Table, ui } from "@/components/ui/table";
import { loadQuoteList } from "@/lib/data/quotes";
import { loadWorkspace } from "@/lib/data/load";
import { db } from "@/lib/db";
import { money, shortDate } from "@/lib/engine/format";
import type { QuoteStatus } from "@/lib/quotes/types";
import styles from "./quotes.module.css";

export const metadata = { title: "Quotes" };

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "sent", label: "Sent" },
  { value: "confirmed", label: "Confirmed" },
  { value: "declined", label: "Declined" },
  { value: "cancelled", label: "Cancelled" },
];

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = FILTERS.some((f) => f.value === status) ? status! : "all";
  const state = await loadWorkspace();

  if (!state.ok) {
    return (
      <>
        <PageHeader title="Quotes" sub="Every quote, from draft to confirmed." />
        <SetupNotice state={state} />
      </>
    );
  }

  const all = await loadQuoteList(db);
  const quotes = filter === "all" ? all : all.filter((q) => q.status === filter);

  return (
    <>
      <PageHeader title="Quotes" sub="Every quote, from draft to confirmed." />

      <div className={ui.chips} style={{ marginBottom: 16 }}>
        {FILTERS.map((f) => {
          const count = f.value === "all" ? all.length : all.filter((q) => q.status === f.value).length;
          return (
            <Link
              key={f.value}
              href={f.value === "all" ? "/app/quotes" : `/app/quotes?status=${f.value}`}
              className={`${ui.chip} ${filter === f.value ? ui.chipOn : ""}`}
              aria-current={filter === f.value ? "page" : undefined}
            >
              {f.label} ({count})
            </Link>
          );
        })}
        <span style={{ flex: 1 }} />
        <Link href="/app/quotes/new" className={buttonClass()}>
          New quote
        </Link>
      </div>

      {all.length === 0 ? (
        <Card>
          <EmptyState title="No quotes yet">
            Start one and it will show up here, from draft through to confirmed.
          </EmptyState>
        </Card>
      ) : quotes.length === 0 ? (
        <Card>
          <EmptyState title={`Nothing ${filter}`}>
            No quote is sitting at that status right now.
          </EmptyState>
        </Card>
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <th>Ref</th>
                <th>Client</th>
                <th>Date</th>
                <th className={ui.num}>Guests</th>
                <th>Package</th>
                <th className={ui.num}>Total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.id}>
                  <td>
                    <Link href={`/app/quotes/${quote.id}`}>{quote.ref}</Link>
                  </td>
                  <td>{quote.clientName}</td>
                  <td>{shortDate(quote.eventDate)}</td>
                  <td className={ui.num}>{quote.guests}</td>
                  <td>{quote.packageName ?? "—"}</td>
                  <td className={ui.num}>{money(quote.total)}</td>
                  <td>
                    <span className={`${styles.status} ${styles[quote.status as QuoteStatus]}`}>
                      {quote.status}
                    </span>
                  </td>
                  <td className={ui.num}>
                    {quote.status === "sent" ? <ConfirmButton id={quote.id} /> : null}
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
