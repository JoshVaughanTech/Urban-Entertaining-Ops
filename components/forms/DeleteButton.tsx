"use client";

import { useActionState, useState } from "react";
import { buttonClass } from "@/components/ui";
import { FormError } from "@/components/ui/form";
import { idle, type ActionState } from "@/lib/validate";

type Action = (prev: ActionState, data: FormData) => Promise<ActionState>;

/** Two-step delete. The catalogue is referenced by quotes and orders, so a
 *  mis-click here is expensive; the second click is the confirmation. */
export function DeleteButton({
  action,
  id,
  label = "Delete",
  confirmLabel = "Really delete",
}: {
  action: Action;
  id: string;
  label?: string;
  confirmLabel?: string;
}) {
  const [state, submit] = useActionState(action, idle);
  const [armed, setArmed] = useState(false);

  return (
    <>
      {state.message && !state.ok ? <FormError>{state.message}</FormError> : null}
      <form action={submit}>
        <input type="hidden" name="id" value={id} />
        {armed ? (
          <span style={{ display: "flex", gap: 8 }}>
            <button type="submit" className={buttonClass()} style={{ background: "var(--red)", borderColor: "var(--red)" }}>
              {confirmLabel}
            </button>
            <button type="button" className={buttonClass("ghost")} onClick={() => setArmed(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className={buttonClass("ghost")} onClick={() => setArmed(true)}>
            {label}
          </button>
        )}
      </form>
    </>
  );
}
