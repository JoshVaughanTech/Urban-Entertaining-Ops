"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { saveRecipe } from "@/lib/actions/catalogue";
import { Actions, buttonClass } from "@/components/ui";
import { Table, ui } from "@/components/ui/table";
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
import { moneyPrecise } from "@/lib/engine/format";
import { idle } from "@/lib/validate";

export type IngredientOption = {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
};

type Line = { key: string; ingredientId: string; qty: string };

let nextKey = 0;
const newKey = () => `line-${nextKey++}`;

export function RecipeForm({
  values,
  ingredients,
}: {
  values: {
    id?: string;
    name: string;
    yieldPortions: number;
    notes: string | null;
    active: boolean;
    items: { ingredientId: string; qty: number }[];
  };
  ingredients: IngredientOption[];
}) {
  const [state, action] = useActionState(saveRecipe, idle);
  const err = (n: string) => state.errors?.[n];

  const [lines, setLines] = useState<Line[]>(() =>
    values.items.length > 0
      ? values.items.map((i) => ({ key: newKey(), ingredientId: i.ingredientId, qty: String(i.qty) }))
      : [{ key: newKey(), ingredientId: "", qty: "" }],
  );
  const [yieldPortions, setYieldPortions] = useState(String(values.yieldPortions));

  const byId = useMemo(() => new Map(ingredients.map((i) => [i.id, i])), [ingredients]);

  /* Live cost, so the effect of a quantity is visible while typing. The
     arithmetic is the same shape the engine uses server-side. */
  const batchCost = lines.reduce((sum, line) => {
    const ing = byId.get(line.ingredientId);
    const qty = Number(line.qty);
    return ing && Number.isFinite(qty) ? sum + qty * ing.costPerUnit : sum;
  }, 0);

  const portions = Number(yieldPortions);
  const perPortion = Number.isFinite(portions) && portions > 0 ? batchCost / portions : null;

  const update = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <form action={action}>
      {state.message && !state.ok ? <FormError>{state.message}</FormError> : null}
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <div className={form.narrow}>
        <Field label="Name" htmlFor="name" error={err("name")}>
          <Input id="name" name="name" defaultValue={values.name} invalid={!!err("name")} required />
        </Field>

        <Row>
          <Field
            label="Batch yields (portions)"
            htmlFor="yieldPortions"
            error={err("yieldPortions")}
          >
            <Input
              id="yieldPortions"
              name="yieldPortions"
              inputMode="decimal"
              value={yieldPortions}
              onChange={(e) => setYieldPortions(e.target.value)}
              invalid={!!err("yieldPortions")}
            />
          </Field>
          <Field label="Cost per portion">
            <Input readOnly value={perPortion === null ? "—" : moneyPrecise(perPortion)} />
          </Field>
        </Row>

        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" name="notes" defaultValue={values.notes ?? ""} />
        </Field>
      </div>

      <h3 className={ui.cardTitle} style={{ fontSize: 18, marginTop: 18 }}>
        Ingredients
      </h3>
      {err("items") ? <FormError>{err("items")}</FormError> : null}

      <Table>
        <thead>
          <tr>
            <th>Ingredient</th>
            <th className={ui.num}>Quantity</th>
            <th className={ui.num}>Cost</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => {
            const ing = byId.get(line.ingredientId);
            const qty = Number(line.qty);
            const cost = ing && Number.isFinite(qty) ? qty * ing.costPerUnit : null;

            return (
              <tr key={line.key}>
                <td>
                  <Select
                    name="ingredientId"
                    value={line.ingredientId}
                    onChange={(e) => update(line.key, { ingredientId: e.target.value })}
                    invalid={!!err(`ingredientId.${i}`)}
                    aria-label={`Ingredient ${i + 1}`}
                  >
                    <option value="">Choose an ingredient…</option>
                    {ingredients.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className={ui.num} style={{ width: 160 }}>
                  <Input
                    name="qty"
                    inputMode="decimal"
                    value={line.qty}
                    onChange={(e) => update(line.key, { qty: e.target.value })}
                    invalid={!!err(`qty.${i}`)}
                    aria-label={`Quantity ${i + 1}`}
                    placeholder={ing?.unit ?? ""}
                  />
                </td>
                <td className={ui.num}>{cost === null ? "—" : moneyPrecise(cost)}</td>
                <td className={ui.num}>
                  <button
                    type="button"
                    className={buttonClass("ghost")}
                    style={{ padding: "4px 10px" }}
                    onClick={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                    aria-label={`Remove ingredient ${i + 1}`}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            );
          })}
          <tr className={ui.totalRow} style={{ fontSize: 13 }}>
            <td>Batch cost</td>
            <td />
            <td className={ui.num}>{moneyPrecise(batchCost)}</td>
            <td />
          </tr>
        </tbody>
      </Table>

      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          className={buttonClass("ghost")}
          onClick={() =>
            setLines((ls) => [...ls, { key: newKey(), ingredientId: "", qty: "" }])
          }
        >
          Add ingredient
        </button>
      </div>

      <div style={{ marginTop: 14 }}>
        <Toggle name="active" defaultChecked={values.active}>
          Active
        </Toggle>
      </div>

      <Actions>
        <Link href="/app/recipes" className={buttonClass("ghost")}>
          Cancel
        </Link>
        <SubmitButton />
      </Actions>
    </form>
  );
}
