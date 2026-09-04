import type { DocumentProps } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import type { QuoteDocument } from "@/lib/quotes/document";
import { QuotePdf } from "./QuotePdf";

/** Renders the client's copy to a PDF buffer. Node runtime only —
 *  @react-pdf needs streams, so any route using this must not be edge.
 *
 *  The cast is react-pdf's usual friction: renderToBuffer is typed to take a
 *  <Document> element, but a component that *returns* one has its own props
 *  type. QuotePdf does render a Document, so this is safe. */
export async function renderQuotePdf(doc: QuoteDocument): Promise<Buffer> {
  const element = (<QuotePdf doc={doc} />) as unknown as ReactElement<DocumentProps>;
  return renderToBuffer(element);
}

/** "UE-1042 Harper & Co. Wedding.pdf", minus anything a filesystem hates. */
export function pdfFilename(doc: QuoteDocument): string {
  const client = doc.clientName.replace(/[^\w\s.-]+/g, "").trim();
  return `${doc.ref}${client ? ` ${client}` : ""}.pdf`.replace(/\s+/g, " ");
}
