import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { QuoteDocumentView } from "@/components/quotes/QuoteDocumentView";
import { loadCatalogue, loadSettings } from "@/lib/data/catalogue";
import { loadQuoteByToken } from "@/lib/data/quotes";
import { db } from "@/lib/db";
import { buildQuoteDocument } from "@/lib/quotes/document";
import styles from "./public.module.css";

/* The one public route in the app. It reads a sent quote by its token and
   shows the client their own copy — rendered from the snapshot, so it says
   exactly what it said the day it was sent. No accept button in v1. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let quote;
  try {
    quote = await loadQuoteByToken(db, token);
  } catch {
    notFound();
  }

  if (!quote) notFound();

  const [cat, settings] = await Promise.all([loadCatalogue(db), loadSettings(db)]);
  const doc = buildQuoteDocument({ quote, cat, settings });

  return (
    <main className={styles.wrap}>
      <div className={styles.inner}>
        <QuoteDocumentView doc={doc} />
        <p className={styles.footer}>
          Questions about this quote? Reply to the email it came with and we will pick it up.
        </p>
      </div>
    </main>
  );
}
