import { requireUser } from "@/lib/auth";
import { loadCatalogue, loadSettings } from "@/lib/data/catalogue";
import { loadQuote } from "@/lib/data/quotes";
import { db } from "@/lib/db";
import { pdfFilename, renderQuotePdf } from "@/lib/pdf/render";
import { buildQuoteDocument } from "@/lib/quotes/document";

/** @react-pdf needs Node streams. */
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();

  const { id } = await params;
  const quote = await loadQuote(db, id);
  if (!quote) return new Response("Not found", { status: 404 });

  const [cat, settings] = await Promise.all([loadCatalogue(db), loadSettings(db)]);
  const doc = buildQuoteDocument({ quote, cat, settings });
  const pdf = await renderQuotePdf(doc);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFilename(doc)}"`,
      "Cache-Control": "no-store",
    },
  });
}
