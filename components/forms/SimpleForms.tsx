"use client";

import { useActionState } from "react";
import Link from "next/link";
import { saveAddon, saveIngredient, saveMenuItem, saveSupplier } from "@/lib/actions/catalogue";
import { Actions, buttonClass } from "@/components/ui";
import {
  Field,
  FormError,
  Input,
  Row,
  Select,
  SubmitButton,
  Textarea,
  Toggle,
  form,
} from "@/components/ui/form";
import { DIETARY_LABELS, DIETARY_TAGS, type DietaryTag } from "@/lib/engine/types";
import { idle } from "@/lib/validate";

const dollars = (cents: number) => (cents / 100).toFixed(2);

/* ── supplier ──────────────────────────────────────────────────────────── */

export function SupplierForm({
  values,
}: {
  values: { id?: string; name: string; contactEmail: string | null; notes: string | null };
}) {
  const [state, action] = useActionState(saveSupplier, idle);
  const err = (n: string) => state.errors?.[n];

  return (
    <form action={action} className={form.narrow}>
      {state.message && !state.ok ? <FormError>{state.message}</FormError> : null}
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <Field label="Name" htmlFor="name" error={err("name")}>
        <Input id="name" name="name" defaultValue={values.name} invalid={!!err("name")} required />
      </Field>

      <Field
        label="Contact email"
        htmlFor="contactEmail"
        hint="Purchase orders go here. Suppliers without one are skipped and flagged."
        error={err("contactEmail")}
      >
        <Input
          id="contactEmail"
          name="contactEmail"
          type="email"
          defaultValue={values.contactEmail ?? ""}
          invalid={!!err("contactEmail")}
        />
      </Field>

      <Field label="Notes" htmlFor="notes">
        <Textarea id="notes" name="notes" defaultValue={values.notes ?? ""} />
      </Field>

      <Actions>
        <Link href="/app/suppliers" className={buttonClass("ghost")}>
          Cancel
        </Link>
        <SubmitButton />
      </Actions>
    </form>
  );
}

/* ── ingredient ────────────────────────────────────────────────────────── */

export function IngredientForm({
  values,
  suppliers,
}: {
  values: {
    id?: string;
    name: string;
    unit: string;
    packSize: number;
    costPerUnit: number;
    supplierId: string | null;
    active: boolean;
  };
  suppliers: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(saveIngredient, idle);
  const err = (n: string) => state.errors?.[n];

  return (
    <form action={action} className={form.narrow}>
      {state.message && !state.ok ? <FormError>{state.message}</FormError> : null}
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <Field label="Name" htmlFor="name" error={err("name")}>
        <Input id="name" name="name" defaultValue={values.name} invalid={!!err("name")} required />
      </Field>

      <Row>
        <Field label="Unit" htmlFor="unit" error={err("unit")}>
          <Select id="unit" name="unit" defaultValue={values.unit}>
            <option value="kg">kg</option>
            <option value="L">L</option>
            <option value="each">each</option>
            <option value="dozen">dozen</option>
          </Select>
        </Field>
        <Field
          label="Pack size"
          htmlFor="packSize"
          hint="How it is sold, in that unit."
          error={err("packSize")}
        >
          <Input
            id="packSize"
            name="packSize"
            inputMode="decimal"
            defaultValue={values.packSize}
            invalid={!!err("packSize")}
          />
        </Field>
        <Field
          label="Cost per unit"
          htmlFor="costPerUnit"
          hint="Per unit, not per pack."
          error={err("costPerUnit")}
        >
          <Input
            id="costPerUnit"
            name="costPerUnit"
            inputMode="decimal"
            defaultValue={dollars(values.costPerUnit)}
            invalid={!!err("costPerUnit")}
          />
        </Field>
      </Row>

      <Field label="Supplier" htmlFor="supplierId">
        <Select id="supplierId" name="supplierId" defaultValue={values.supplierId ?? ""}>
          <option value="">No supplier</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>

      <Toggle name="active" defaultChecked={values.active}>
        Active
      </Toggle>

      <Actions>
        <Link href="/app/recipes?tab=ingredients" className={buttonClass("ghost")}>
          Cancel
        </Link>
        <SubmitButton />
      </Actions>
    </form>
  );
}

/* ── add-on ────────────────────────────────────────────────────────────── */

export function AddonForm({
  values,
}: {
  values: { id?: string; name: string; price: number; pricingBasis: string; active: boolean };
}) {
  const [state, action] = useActionState(saveAddon, idle);
  const err = (n: string) => state.errors?.[n];

  return (
    <form action={action} className={form.narrow}>
      {state.message && !state.ok ? <FormError>{state.message}</FormError> : null}
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <Field label="Name" htmlFor="name" error={err("name")}>
        <Input id="name" name="name" defaultValue={values.name} invalid={!!err("name")} required />
      </Field>

      <Row>
        <Field label="Price" htmlFor="price" error={err("price")}>
          <Input
            id="price"
            name="price"
            inputMode="decimal"
            defaultValue={dollars(values.price)}
            invalid={!!err("price")}
          />
        </Field>
        <Field label="Charged" htmlFor="pricingBasis">
          <Select id="pricingBasis" name="pricingBasis" defaultValue={values.pricingBasis}>
            <option value="head">Per head</option>
            <option value="flat">Flat</option>
          </Select>
        </Field>
      </Row>

      <Toggle name="active" defaultChecked={values.active}>
        Active
      </Toggle>

      <Actions>
        <Link href="/app/addons" className={buttonClass("ghost")}>
          Cancel
        </Link>
        <SubmitButton />
      </Actions>
    </form>
  );
}

/* ── menu item ─────────────────────────────────────────────────────────── */

export function MenuItemForm({
  values,
  recipes,
}: {
  values: {
    id?: string;
    name: string;
    recipeId: string | null;
    portionsPerHead: number;
    dietaryTags: DietaryTag[];
    active: boolean;
  };
  recipes: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(saveMenuItem, idle);
  const err = (n: string) => state.errors?.[n];

  return (
    <form action={action} className={form.narrow}>
      {state.message && !state.ok ? <FormError>{state.message}</FormError> : null}
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <Field label="Name" htmlFor="name" error={err("name")}>
        <Input id="name" name="name" defaultValue={values.name} invalid={!!err("name")} required />
      </Field>

      <Row>
        <Field
          label="Recipe"
          htmlFor="recipeId"
          hint="Without a recipe this item cannot be costed or ordered against."
        >
          <Select id="recipeId" name="recipeId" defaultValue={values.recipeId ?? ""}>
            <option value="">No recipe</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Portions per guest"
          htmlFor="portionsPerHead"
          error={err("portionsPerHead")}
        >
          <Input
            id="portionsPerHead"
            name="portionsPerHead"
            inputMode="decimal"
            defaultValue={values.portionsPerHead}
            invalid={!!err("portionsPerHead")}
          />
        </Field>
      </Row>

      <Field label="Dietary tags" hint="What this dish itself satisfies.">
        <div>
          {DIETARY_TAGS.map((tag) => (
            <Toggle
              key={tag}
              name="dietaryTags"
              value={tag}
              defaultChecked={values.dietaryTags.includes(tag)}
            >
              {DIETARY_LABELS[tag]}
            </Toggle>
          ))}
        </div>
      </Field>

      <Toggle name="active" defaultChecked={values.active}>
        Active
      </Toggle>

      <Actions>
        <Link href="/app/menu-items" className={buttonClass("ghost")}>
          Cancel
        </Link>
        <SubmitButton />
      </Actions>
    </form>
  );
}
