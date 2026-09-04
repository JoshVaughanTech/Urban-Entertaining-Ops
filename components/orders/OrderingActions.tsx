"use client";

import { useActionState, useState } from "react";
import { sendPurchaseOrders, toggleOrderLine } from "@/lib/actions/orders";
import { useReadOnly } from "@/components/ReadOnly";
import { buttonClass } from "@/components/ui";
import { FormError, FormOk } from "@/components/ui/form";
import { idle } from "@/lib/validate";

/** One tick. Submits on change, so there is no separate save step — the
 *  order record is opened lazily the first time anything is ticked. */
export function OrderedCheckbox({
  from,
  to,
  ingredientId,
  ordered,
  label,
}: {
  from: string;
  to: string;
  ingredientId: string;
  ordered: boolean;
  label: string;
}) {
  const [, act, pending] = useActionState(toggleOrderLine, idle);
  const readOnly = useReadOnly();

  return (
    <form action={act}>
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="ingredientId" value={ingredientId} />
      <input type="hidden" name="ordered" value={ordered ? "false" : "true"} />
      <input
        type="checkbox"
        checked={ordered}
        disabled={pending || readOnly}
        aria-label={`Ordered: ${label}`}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        style={{ width: "auto", cursor: "pointer" }}
      />
    </form>
  );
}

/** "Send purchase orders", behind a confirm step — this emails real
 *  suppliers, and there is no unsending it. */
export function SendPurchaseOrders({
  from,
  to,
  supplierCount,
  missingEmail,
  emailConfigured,
}: {
  from: string;
  to: string;
  supplierCount: number;
  missingEmail: string[];
  emailConfigured: boolean;
}) {
  const [state, act] = useActionState(sendPurchaseOrders, idle);
  const [armed, setArmed] = useState(false);
  const readOnly = useReadOnly();

  if (readOnly) return null;

  const willSend = supplierCount - missingEmail.length;

  return (
    <>
      {state.message && !state.ok ? <FormError>{state.message}</FormError> : null}
      {state.ok && state.message ? <FormOk>{state.message}</FormOk> : null}

      {!emailConfigured ? (
        <p style={{ color: "var(--muted)", margin: "0 0 10px" }}>
          Email is not configured, so orders cannot be sent from here yet. Download each
          supplier&rsquo;s CSV and send it yourself.
        </p>
      ) : null}

      {armed ? (
        <div style={{ background: "var(--amber-soft)", border: "1px solid #E4D2AF", borderRadius: 6, padding: "12px 14px" }}>
          <p style={{ margin: "0 0 8px", color: "var(--amber)" }}>
            This emails {willSend} supplier{willSend === 1 ? "" : "s"} their order for {from} to{" "}
            {to}. It cannot be undone.
            {missingEmail.length > 0
              ? ` ${missingEmail.join(", ")} will be skipped — no contact email.`
              : ""}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <form action={act}>
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="to" value={to} />
              <button type="submit" className={buttonClass()}>
                Yes, send {willSend} order{willSend === 1 ? "" : "s"}
              </button>
            </form>
            <button type="button" className={buttonClass("ghost")} onClick={() => setArmed(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={buttonClass()}
          disabled={!emailConfigured || willSend === 0}
          onClick={() => setArmed(true)}
        >
          Send purchase orders
        </button>
      )}
    </>
  );
}
