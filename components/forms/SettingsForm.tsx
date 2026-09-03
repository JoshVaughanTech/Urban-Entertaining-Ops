"use client";

import { useActionState } from "react";
import { saveSettings } from "@/lib/actions/catalogue";
import { Actions } from "@/components/ui";
import {
  Field,
  FormError,
  FormOk,
  Input,
  Row,
  SubmitButton,
  form,
} from "@/components/ui/form";
import { idle } from "@/lib/validate";

export type SettingsValues = {
  staffHourlyCost: number;
  staffHourlyCharge: number;
  gstRate: number;
  quoteValidityDays: number;
  depositPct: number;
  quoteRefPrefix: string;
  quoteRefNext: number;
};

const dollars = (cents: number) => (cents / 100).toFixed(2);

export function SettingsForm({ values }: { values: SettingsValues }) {
  const [state, action] = useActionState(saveSettings, idle);
  const err = (name: string) => state.errors?.[name];

  return (
    <form action={action} className={form.narrow}>
      {state.message && !state.ok ? <FormError>{state.message}</FormError> : null}
      {state.ok && state.message ? <FormOk>{state.message}</FormOk> : null}

      <Row>
        <Field
          label="Staff hourly cost"
          htmlFor="staffHourlyCost"
          hint="What a staff hour costs us."
          error={err("staffHourlyCost")}
        >
          <Input
            id="staffHourlyCost"
            name="staffHourlyCost"
            inputMode="decimal"
            defaultValue={dollars(values.staffHourlyCost)}
            invalid={!!err("staffHourlyCost")}
          />
        </Field>
        <Field
          label="Staff hourly charge"
          htmlFor="staffHourlyCharge"
          hint="What we bill for extended service."
          error={err("staffHourlyCharge")}
        >
          <Input
            id="staffHourlyCharge"
            name="staffHourlyCharge"
            inputMode="decimal"
            defaultValue={dollars(values.staffHourlyCharge)}
            invalid={!!err("staffHourlyCharge")}
          />
        </Field>
      </Row>

      <Row>
        <Field
          label="GST rate (%)"
          htmlFor="gstPercent"
          hint="Prices are GST inclusive."
          error={err("gstPercent")}
        >
          <Input
            id="gstPercent"
            name="gstPercent"
            inputMode="decimal"
            defaultValue={(values.gstRate * 100).toFixed(2).replace(/\.00$/, "")}
            invalid={!!err("gstPercent")}
          />
        </Field>
        <Field
          label="Quote validity (days)"
          htmlFor="quoteValidityDays"
          error={err("quoteValidityDays")}
        >
          <Input
            id="quoteValidityDays"
            name="quoteValidityDays"
            type="number"
            min={1}
            defaultValue={values.quoteValidityDays}
            invalid={!!err("quoteValidityDays")}
          />
        </Field>
        <Field label="Deposit (%)" htmlFor="depositPct" error={err("depositPct")}>
          <Input
            id="depositPct"
            name="depositPct"
            type="number"
            min={0}
            max={100}
            defaultValue={values.depositPct}
            invalid={!!err("depositPct")}
          />
        </Field>
      </Row>

      <Field
        label="Quote reference prefix"
        htmlFor="quoteRefPrefix"
        hint={`Next quote will be ${values.quoteRefPrefix}-${values.quoteRefNext}.`}
        error={err("quoteRefPrefix")}
      >
        <Input
          id="quoteRefPrefix"
          name="quoteRefPrefix"
          defaultValue={values.quoteRefPrefix}
          invalid={!!err("quoteRefPrefix")}
        />
      </Field>

      <Actions>
        <SubmitButton>Save settings</SubmitButton>
      </Actions>
    </form>
  );
}
