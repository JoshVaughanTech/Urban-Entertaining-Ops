/* Transactional email through Resend.
 *
 * Called over fetch rather than through their SDK: this is one POST to one
 * endpoint, and a dependency for that is not worth carrying.
 *
 * Nothing here has a fallback. With no API key or no verified sender the
 * result is an explicit "unconfigured" — never a silent success, and never
 * an invented from-address. */

export type EmailAttachment = {
  filename: string;
  content: Buffer;
};

export type EmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: "unconfigured" | "failed"; message: string };

export type EmailInput = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

const ENDPOINT = "https://api.resend.com/emails";

export function emailIsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.QUOTE_FROM_EMAIL);
}

export async function sendEmail(input: EmailInput): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.QUOTE_FROM_EMAIL;

  if (!apiKey || !from) {
    return {
      ok: false,
      reason: "unconfigured",
      message:
        "Email is not set up yet. Add RESEND_API_KEY and QUOTE_FROM_EMAIL " +
        "(a sender on a domain verified in Resend) to .env.local.",
    };
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        ...(input.attachments
          ? {
              attachments: input.attachments.map((a) => ({
                filename: a.filename,
                content: a.content.toString("base64"),
              })),
            }
          : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        reason: "failed",
        message: `Resend refused the message (${response.status}). ${body.slice(0, 300)}`,
      };
    }

    const body = (await response.json()) as { id?: string };
    return { ok: true, id: body.id ?? "" };
  } catch (err) {
    return {
      ok: false,
      reason: "failed",
      message: err instanceof Error ? err.message : "Could not reach Resend.",
    };
  }
}
