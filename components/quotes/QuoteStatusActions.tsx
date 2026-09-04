"use client";

import { useActionState } from "react";
import { markQuoteStatus } from "@/lib/actions/quotes";
import { buttonClass } from "@/components/ui";
import { FormError } from "@/components/ui/form";
import { idle } from "@/lib/validate";
import type { QuoteStatus } from "@/lib/quotes/types";

const NEXT_STEPS: Record<QuoteStatus, { status: QuoteStatus; label: string; primary?: boolean }[]> =
  {
    draft: [
      { status: "confirmed", label: "Mark confirmed", primary: true },
      { status: "cancelled", label: "Cancel quote" },
    ],
    sent: [
      { status: "confirmed", label: "Mark confirmed", primary: true },
      { status: "declined", label: "Mark declined" },
    ],
    confirmed: [
      { status: "declined", label: "Mark declined" },
      { status: "cancelled", label: "Cancel quote" },
    ],
    declined: [
      { status: "confirmed", label: "Mark confirmed" },
      { status: "cancelled", label: "Cancel quote" },
    ],
    cancelled: [{ status: "confirmed", label: "Mark confirmed" }],
  };

/** Status is the only thing that moves on a quote once it has been sent. */
export function QuoteStatusActions({ id, status }: { id: string; status: QuoteStatus }) {
  const [state, act] = useActionState(markQuoteStatus, idle);
  const steps = NEXT_STEPS[status];

  if (steps.length === 0) return null;

  return (
    <>
      {state.message && !state.ok ? <FormError>{state.message}</FormError> : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {steps.map((step) => (
          <form key={step.status} action={act}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="status" value={step.status} />
            <button type="submit" className={buttonClass(step.primary ? "solid" : "ghost")}>
              {step.label}
            </button>
          </form>
        ))}
      </div>
    </>
  );
}

/** The compact version for the quotes list. */
export function ConfirmButton({ id }: { id: string }) {
  const [, act] = useActionState(markQuoteStatus, idle);

  return (
    <form action={act}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value="confirmed" />
      <button type="submit" className={buttonClass("ghost")} style={{ padding: "4px 10px" }}>
        Mark confirmed
      </button>
    </form>
  );
}
