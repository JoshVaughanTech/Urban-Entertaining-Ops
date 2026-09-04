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
            <option value="staff">Staff — can quote and order</option>
            <option value="viewer">Read-only — can look, change nothing</option>
            <option value="admin">Admin — can also manage access</option>
          </Select>
        </Field>
      </Row>

      <Actions>
        <SubmitButton>Give access</SubmitButton>
      </Actions>
    </form>
  );
}

export function RoleSelect({
  id,
  role,
  lastAdmin,
}: {
  id: string;
  role: "admin" | "staff" | "viewer";
  lastAdmin: boolean;
}) {
  const [state, action] = useActionState(changeMemberRole, idle);

  return (
    <>
      {state.message && !state.ok ? <FormError>{state.message}</FormError> : null}
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <Select
          name="role"
          defaultValue={role}
          disabled={lastAdmin}
          aria-label="Access level"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          <option value="admin">Admin</option>
          <option value="staff">Staff</option>
          <option value="viewer">Read-only</option>
        </Select>
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
