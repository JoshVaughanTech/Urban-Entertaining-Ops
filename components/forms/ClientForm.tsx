"use client";

import { useActionState } from "react";

import { Actions } from "@/components/ui";
import {
  Field,
  FormError,
  FormOk,
  Input,
  Row,
  Select,
  SubmitButton,
  Textarea,
  Toggle,
} from "@/components/ui/form";
import form from "@/components/ui/form.module.css";
import { deleteContact, removeClient, saveClient, saveContact } from "@/lib/actions/clients";
import { CONTACT_ROLES, CONTACT_ROLE_LABELS } from "@/lib/clients/types";
import type { Client, ClientContact } from "@/lib/clients/types";
import { idle } from "@/lib/validate";

export function ClientForm({ client }: { client: Client | null }) {
  const [state, action] = useActionState(saveClient, idle);

  return (
    <form action={action}>
      {state.message && !state.ok ? <FormError>{state.message}</FormError> : null}
      {state.ok && state.message ? <FormOk>{state.message}</FormOk> : null}

      {client ? <input type="hidden" name="id" value={client.id} /> : null}

      <Row>
        <Field label="Client name" htmlFor="name">
          <Input id="name" name="name" required defaultValue={client?.name ?? ""} />
        </Field>
        <Field
          label="Standing discount"
          htmlFor="discountPct"
          hint="Pre-filled into new quotes. Never changes a quote already sent."
        >
          <Input
            id="discountPct"
            name="discountPct"
            type="number"
            min={0}
            max={100}
            step={1}
            defaultValue={client?.discountPct ?? 0}
          />
        </Field>
      </Row>

      <Field
        label="Preferences"
        htmlFor="preferences"
        hint="Food, room, anything worth remembering. Internal — the client never sees this."
      >
        <Textarea
          id="preferences"
          name="preferences"
          rows={3}
          defaultValue={client?.preferences ?? ""}
          placeholder="No shellfish. Likes the long table down the middle."
        />
      </Field>

      <Field
        label="Staff requests"
        htmlFor="staffNotes"
        hint="Who they ask for, how they like the floor run. Also internal."
      >
        <Textarea
          id="staffNotes"
          name="staffNotes"
          rows={3}
          defaultValue={client?.staffNotes ?? ""}
          placeholder="Always requests Maria on service. Prefers two behind the bar."
        />
      </Field>

      <Actions>
        <SubmitButton>{client ? "Save client" : "Add client"}</SubmitButton>
      </Actions>
    </form>
  );
}

export function ContactForm({
  clientId,
  contact,
  onDone,
}: {
  clientId: string;
  contact?: ClientContact;
  onDone?: () => void;
}) {
  const [state, action] = useActionState(saveContact, idle);

  return (
    <form
      action={async (data: FormData) => {
        await action(data);
        onDone?.();
      }}
    >
      {state.message && !state.ok ? <FormError>{state.message}</FormError> : null}

      <input type="hidden" name="clientId" value={clientId} />
      {contact ? <input type="hidden" name="contactId" value={contact.id} /> : null}

      <Row>
        <Field label="Name" htmlFor={`name-${contact?.id ?? "new"}`}>
          <Input
            id={`name-${contact?.id ?? "new"}`}
            name="name"
            required
            defaultValue={contact?.name ?? ""}
          />
        </Field>
        <Field label="Role" htmlFor={`role-${contact?.id ?? "new"}`}>
          <Select
            id={`role-${contact?.id ?? "new"}`}
            name="role"
            defaultValue={contact?.role ?? "booker"}
          >
            {CONTACT_ROLES.map((role) => (
              <option key={role} value={role}>
                {CONTACT_ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </Field>
      </Row>

      <Row>
        <Field label="Email" htmlFor={`email-${contact?.id ?? "new"}`}>
          <Input
            id={`email-${contact?.id ?? "new"}`}
            name="email"
            type="email"
            defaultValue={contact?.email ?? ""}
          />
        </Field>
        <Field label="Phone" htmlFor={`phone-${contact?.id ?? "new"}`}>
          <Input
            id={`phone-${contact?.id ?? "new"}`}
            name="phone"
            defaultValue={contact?.phone ?? ""}
          />
        </Field>
      </Row>

      <Toggle name="isPrimary" defaultChecked={contact?.isPrimary ?? false}>
        Quotes go to this contact
      </Toggle>

      <Actions>
        <SubmitButton>{contact ? "Save contact" : "Add contact"}</SubmitButton>
      </Actions>
    </form>
  );
}

export function DeleteContactButton({
  clientId,
  contactId,
}: {
  clientId: string;
  contactId: string;
}) {
  const [state, action] = useActionState(deleteContact, idle);

  return (
    <>
      {state.message && !state.ok ? <FormError>{state.message}</FormError> : null}
      <form action={action}>
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="contactId" value={contactId} />
        <SubmitButton variant="ghost">Remove</SubmitButton>
      </form>
    </>
  );
}

export function DeleteClientButton({ id, eventCount }: { id: string; eventCount: number }) {
  const [state, action] = useActionState(removeClient, idle);

  // The action refuses this too — hiding a button is presentation, never a
  // boundary — but saying why up front beats a refusal after the click.
  if (eventCount > 0) {
    return (
      <p className={form.hint}>
        This client has {eventCount} event{eventCount === 1 ? "" : "s"} against them, so they
        cannot be deleted.
      </p>
    );
  }

  return (
    <>
      {state.message && !state.ok ? <FormError>{state.message}</FormError> : null}
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <SubmitButton variant="ghost">Delete client</SubmitButton>
      </form>
    </>
  );
}
