import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SetupNotice } from "@/components/SetupNotice";
import { PreviewActions } from "@/components/quotes/PreviewActions";
import { QuoteDocumentView } from "@/components/quotes/QuoteDocumentView";
import { Card, PageHeader, Tag, buttonClass } from "@/components/ui";
import { ui } from "@/components/ui/table";
import { loadWorkspace } from "@/lib/data/load";
import { loadQuote } from "@/lib/data/quotes";
import { db } from "@/lib/db";
import { emailIsConfigured } from "@/lib/email/send";
import { money, percent } from "@/lib/engine/format";
import { isMarginHealthy } from "@/lib/engine/pricing";
import { buildQuoteDocument } from "@/lib/quotes/document";
import { isEditable } from "@/lib/quotes/types";

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await loadWorkspace();

  if (!state.ok) {
    return (
      <>
        <PageHeader title="Client quote" />
        <SetupNotice state={state} />
      </>
    );
  }

  const quote = await loadQuote(db, id);
  if (!quote) notFound();

  const doc = buildQuoteDocument({ quote, cat: state.cat, settings: state.settings });
  const draft = isEditable(quote.status);
  const link = quote.publicToken ? `/q/${quote.publicToken}` : null;

  return (
    <>
      <PageHeader
        title="Client quote"
        sub={
          draft
            ? "This is exactly what the client will see. Nothing has been sent yet."
            : "Sent to the client. These figures are frozen."
        }
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <Link href={`/app/quotes/${quote.id}`} className={buttonClass("ghost")}>
          {draft ? "Back to editing" : "Back to quote"}
        </Link>
        <a href={`/app/quotes/${quote.id}/pdf`} className={buttonClass("ghost")}>
          Download PDF
        </a>
      </div>

      <div className={ui.splitGrid} style={{ gridTemplateColumns: "1fr 300px" }}>
        <QuoteDocumentView doc={doc} />

        <div className={ui.stack}>
          {draft ? (
            <Card title="Send">
              <PreviewActions
                id={quote.id}
                contactEmail={quote.event.contactEmail}
                emailConfigured={emailIsConfigured()}
              />
            </Card>
          ) : (
            <Card title="Sent">
              <p className={ui.muted} style={{ marginTop: 0 }}>
                The client has this quote. It cannot be edited — only its status moves now.
              </p>
              {link ? (
                <p className={ui.small} style={{ overflowWrap: "anywhere" }}>
                  Their link: <Link href={link as Route}>{link}</Link>
                </p>
              ) : null}
            </Card>
          )}

          <Card title="Internal only">
            <p className={`${ui.muted} ${ui.small}`} style={{ marginTop: 0 }}>
              Never shown to the client.
            </p>
            <p style={{ margin: "8px 0 0" }}>
              Food + staff cost{" "}
              <strong>{money(doc.internal.food + doc.internal.staff)}</strong>
            </p>
            <p style={{ margin: "4px 0 0" }}>
              Gross margin{" "}
              <strong
                style={{
                  color: isMarginHealthy(doc.internal.margin) ? "var(--green)" : "var(--red)",
                }}
              >
                {percent(doc.internal.margin)}
              </strong>
            </p>
            {doc.internal.pricePerHead !== doc.internal.listPricePerHead ? (
              <p style={{ margin: "8px 0 0" }}>
                <Tag tone="warn">List {money(doc.internal.listPricePerHead)} per head</Tag>
              </p>
            ) : null}
            {doc.internal.hasUncostedLines ? (
              <p style={{ margin: "8px 0 0" }}>
                <Tag tone="warn">Has uncosted lines</Tag>
              </p>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
