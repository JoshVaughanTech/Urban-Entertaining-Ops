"use client";

import { useActionState } from "react";
import { changeMemberRole, inviteMember, revokeMember } from "@/lib/actions/team";
import { Actions, buttonClass } from "@/components/ui";
import { Field, FormError, FormOk, Input, Row, Select, SubmitButton } from "@/components/ui/form";
import form from "@/components/ui/form.module.css";
import { idle } from "@/lib/validate";

export function InviteForm() {
  const [state, action] = useActionState(inviteMember, idle);

  return (
    <form action={action} className={form.narrow}>
      {state.message && !state.ok ? <FormError>{state.message}</FormError> : null}
      {state.ok && state.message ? <FormOk>{state.message}</FormOk> : null}

      <Row>
        <Field
          label="Email address"
          htmlFor="email"
          hint="They sign in with this. No invitation is sent — tell them yourself."
        >
          <Input id="email" name="email" type="email" required placeholder="name@example.com" />
        </Field>
        <Field label="Name" htmlFor="name" hint="Optional.">
          <Input id="name" name="name" />
        </Field>
        <Field label="Access" htmlFor="role">
          <Select id="role" name="role" defaultValue="staff">
            <option value="staff">Staff</option>
            <option value="admin">Admin — can manage access</option>
          </Select>
        </Field>
      </Row>

      <Actions>
        <SubmitButton>Give access</SubmitButton>
      </Actions>
    </form>
  );
}

export function RoleToggle({
  id,
  role,
  disabled,
}: {
  id: string;
  role: "admin" | "staff";
  disabled: boolean;
}) {
  const [state, action] = useActionState(changeMemberRole, idle);
  const next = role === "admin" ? "staff" : "admin";

  return (
    <>
      {state.message && !state.ok ? <FormError>{state.message}</FormError> : null}
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="role" value={next} />
        <button
          type="submit"
          className={buttonClass("ghost")}
          style={{ padding: "4px 10px" }}
          disabled={disabled}
        >
          Make {next}
        </button>
      </form>
    </>
  );
}

export function RevokeButton({ id, email }: { id: string; email: string }) {
  const [state, action] = useActionState(revokeMember, idle);

  return (
    <>
      {state.message && !state.ok ? <FormError>{state.message}</FormError> : null}
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          className={buttonClass("ghost")}
          style={{ padding: "4px 10px" }}
          aria-label={`Remove access for ${email}`}
        >
          Remove
        </button>
      </form>
    </>
  );
}
