"use client";

import { useActionState } from "react";
import { markSentWithoutEmail, sendQuoteToClient } from "@/lib/actions/send";
import { buttonClass } from "@/components/ui";
import { FormError, FormOk } from "@/components/ui/form";
import { idle } from "@/lib/validate";

export function PreviewActions({
  id,
  contactEmail,
  emailConfigured,
}: {
  id: string;
  contactEmail: string | null;
  emailConfigured: boolean;
}) {
  const [sendState, send] = useActionState(sendQuoteToClient, idle);
  const [markState, mark] = useActionState(markSentWithoutEmail, idle);

  const state = sendState.message ? sendState : markState;

  return (
    <>
      {state.message && !state.ok ? <FormError>{state.message}</FormError> : null}
      {state.ok && state.message ? <FormOk>{state.message}</FormOk> : null}

      {!contactEmail ? (
        <p style={{ color: "var(--muted)", margin: "0 0 10px" }}>
          This quote has no client email yet, so it cannot be sent. Add one on the event, or
          mark it sent and send it yourself.
        </p>
      ) : !emailConfigured ? (
        <p style={{ color: "var(--muted)", margin: "0 0 10px" }}>
          Email is not configured yet, so the app cannot send this for you. Download the PDF and
          send it yourself, then mark it sent.
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <form action={send}>
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className={buttonClass()}
            disabled={!contactEmail || !emailConfigured}
          >
            Send to client
          </button>
        </form>

        <form action={mark}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" className={buttonClass("ghost")}>
            Mark sent without emailing
          </button>
        </form>
      </div>
    </>
  );
}
