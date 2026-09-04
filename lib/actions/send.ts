"use server";

import { revalidatePath } from "next/cache";

import { denyReadOnly, requireUser } from "@/lib/auth";
import { loadCatalogue, loadSettings } from "@/lib/data/catalogue";
import { loadQuote } from "@/lib/data/quotes";
import { QuoteError, markSent, prepareSend, sendQuote } from "@/lib/data/quotes-write";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { longDate, money } from "@/lib/engine/format";
import { pdfFilename, renderQuotePdf } from "@/lib/pdf/render";
import { buildQuoteDocument, type QuoteDocument } from "@/lib/quotes/document";
import { failed, succeeded, type ActionState } from "@/lib/validate";

const message = (err: unknown) =>
  err instanceof QuoteError ? err.message : err instanceof Error ? err.message : "Could not send.";

function publicLink(token: string): string | null {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  // No invented domain: without a configured site URL the email simply
  // carries the PDF and no link.
  return base ? `${base.replace(/\/$/, "")}/q/${token}` : null;
}

function emailBody(doc: QuoteDocument, link: string | null): string {
  const rows = doc.lines
    .map(
      (line) =>
        `<tr><td style="padding:6px 0;color:#1F1D19">${escapeHtml(line.label)}</td>` +
        `<td style="padding:6px 0;text-align:right;color:#1F1D19">${money(line.amount)}</td></tr>`,
    )
    .join("");

  return `
<div style="font-family:Georgia,serif;color:#1F1D19;background:#F3F1EC;padding:28px">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #DDD8CE;border-radius:8px;padding:28px 30px">
    <div style="font-size:13px;color:#7A756B">${escapeHtml(doc.brand)}</div>
    <h1 style="font-size:26px;font-weight:500;margin:4px 0 2px">Your quotation</h1>
    <div style="font-size:12px;color:#7A756B">${escapeHtml(doc.ref)}</div>

    <p style="font-family:system-ui,sans-serif;font-size:14px;color:#1F1D19;margin:18px 0 0">
      Hello ${escapeHtml(doc.clientName)},
    </p>
    <p style="font-family:system-ui,sans-serif;font-size:14px;color:#1F1D19;margin:10px 0 0">
      Thank you for thinking of us. Your quote for
      ${escapeHtml(longDate(doc.eventDate))} — ${doc.guests} guests — is attached as a PDF.
    </p>

    <table style="width:100%;border-collapse:collapse;font-family:system-ui,sans-serif;font-size:13px;margin-top:18px">
      ${rows}
      <tr>
        <td style="padding:10px 0 0;border-top:2px solid #1F1D19;font-weight:700">Total (inc. GST)</td>
        <td style="padding:10px 0 0;border-top:2px solid #1F1D19;text-align:right;font-weight:700">${money(doc.total)}</td>
      </tr>
    </table>

    ${
      link
        ? `<p style="font-family:system-ui,sans-serif;font-size:14px;margin:20px 0 0">
             <a href="${link}" style="color:#2F4A3A">View your quote online</a>
           </p>`
        : ""
    }

    <p style="font-family:system-ui,sans-serif;font-size:12px;color:#7A756B;margin:22px 0 0">
      Valid until ${escapeHtml(longDate(doc.validUntil))}.
      A ${doc.depositPct}% deposit — ${money(doc.depositAmount)} — confirms your date.
    </p>
  </div>
</div>`.trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Renders the PDF from the snapshot that is about to be frozen, emails it,
 *  and only then marks the quote sent. If Resend refuses, the quote is still
 *  a draft and staff can fix the address and try again. */
export async function sendQuoteToClient(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  await requireUser();
  const denied = await denyReadOnly();
  if (denied) return denied;
  const id = String(data.get("id") ?? "");

  try {
    const quote = await loadQuote(db, id);
    if (!quote) return failed("That quote no longer exists.");
    if (quote.status !== "draft") return failed("This quote has already been sent.");

    const to = quote.event.contactEmail;
    if (!to) {
      return failed("Add the client's email address to the event before sending.");
    }

    const [cat, settings] = await Promise.all([loadCatalogue(db), loadSettings(db)]);
    const prepared = await prepareSend(db, id, cat, settings);

    /* Build the document from the snapshot that is about to be stored, so
       the PDF the client receives is byte-for-byte the quote we keep. */
    const doc = buildQuoteDocument({
      quote: { ...quote, snapshot: prepared.snapshot, sentAt: new Date() },
      cat,
      settings,
    });

    const pdf = await renderQuotePdf(doc);

    const result = await sendEmail({
      to,
      subject: `${doc.brand} — quotation ${doc.ref}`,
      html: emailBody(doc, publicLink(prepared.token)),
      attachments: [{ filename: pdfFilename(doc), content: pdf }],
    });

    if (!result.ok) return failed(result.message);

    await markSent(db, id, prepared);
  } catch (err) {
    return failed(message(err));
  }

  revalidatePath("/app/quotes", "layout");
  revalidatePath(`/app/quotes/${id}`, "layout");
  return succeeded("Sent. The client has the quote and the PDF.");
}

/** Freezes the quote and marks it sent without emailing — for when staff
 *  send it themselves, or before Resend is configured. */
export async function markSentWithoutEmail(
  _prev: ActionState,
  data: FormData,
): Promise<ActionState> {
  await requireUser();
  const denied = await denyReadOnly();
  if (denied) return denied;
  const id = String(data.get("id") ?? "");

  try {
    const [cat, settings] = await Promise.all([loadCatalogue(db), loadSettings(db)]);
    await sendQuote(db, id, cat, settings);
  } catch (err) {
    return failed(message(err));
  }

  revalidatePath("/app/quotes", "layout");
  revalidatePath(`/app/quotes/${id}`, "layout");
  return succeeded("Marked as sent. The quote is now frozen.");
}
