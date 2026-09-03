"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { savePackage } from "@/lib/actions/catalogue";
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
import {
  DIETARY_LABELS,
  DIETARY_TAGS,
  STYLES,
  STYLE_LABELS,
  type DietaryTag,
} from "@/lib/engine/types";
import { idle } from "@/lib/validate";

type Tier = { key: string; upToGuests: string; pricePerHead: string };
type Slot = { key: string; menuItemId: string };

let nextKey = 0;
const newKey = () => `k-${nextKey++}`;

const dollars = (cents: number) => (cents / 100).toFixed(2);

export function PackageForm({
  values,
  menuItems,
}: {
  values: {
    id?: string;
    name: string;
    style: string;
    blurb: string | null;
    minGuests: number;
    maxGuests: number;
    staffPerGuests: number | null;
    serviceHours: number;
    includes: string[];
    adaptableDietary: DietaryTag[];
    active: boolean;
    tiers: { upToGuests: number; pricePerHead: number }[];
    menuItemIds: string[];
  };
  menuItems: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(savePackage, idle);
  const err = (n: string) => state.errors?.[n];

  const [tiers, setTiers] = useState<Tier[]>(() =>
    values.tiers.length > 0
      ? values.tiers.map((t) => ({
          key: newKey(),
          upToGuests: String(t.upToGuests),
          pricePerHead: dollars(t.pricePerHead),
        }))
      : [{ key: newKey(), upToGuests: "", pricePerHead: "" }],
  );

  const [slots, setSlots] = useState<Slot[]>(() =>
    values.menuItemIds.length > 0
      ? values.menuItemIds.map((id) => ({ key: newKey(), menuItemId: id }))
      : [{ key: newKey(), menuItemId: "" }],
  );

  return (
    <form action={action}>
      {state.message && !state.ok ? <FormError>{state.message}</FormError> : null}
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <div className={form.narrow}>
        <Field label="Name" htmlFor="name" error={err("name")}>
          <Input id="name" name="name" defaultValue={values.name} invalid={!!err("name")} required />
        </Field>

        <Field label="Blurb" htmlFor="blurb" hint="One line, shown to the client.">
          <Textarea id="blurb" name="blurb" rows={2} defaultValue={values.blurb ?? ""} />
        </Field>

        <Row>
          <Field label="Service style" htmlFor="style">
            <Select id="style" name="style" defaultValue={values.style}>
              {STYLES.map((s) => (
                <option key={s} value={s}>
                  {STYLE_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Minimum guests" htmlFor="minGuests" error={err("minGuests")}>
            <Input
              id="minGuests"
              name="minGuests"
              type="number"
              min={1}
              defaultValue={values.minGuests}
              invalid={!!err("minGuests")}
            />
          </Field>
          <Field label="Maximum guests" htmlFor="maxGuests" error={err("maxGuests")}>
            <Input
              id="maxGuests"
              name="maxGuests"
              type="number"
              min={1}
              defaultValue={values.maxGuests}
              invalid={!!err("maxGuests")}
            />
          </Field>
        </Row>

        <Row>
          <Field
            label="Staff ratio (1 per N guests)"
            htmlFor="staffPerGuests"
            hint="Leave empty for packages with no staff on site."
            error={err("staffPerGuests")}
          >
            <Input
              id="staffPerGuests"
              name="staffPerGuests"
              type="number"
              min={1}
              defaultValue={values.staffPerGuests ?? ""}
              invalid={!!err("staffPerGuests")}
            />
          </Field>
          <Field label="Service hours" htmlFor="serviceHours" error={err("serviceHours")}>
            <Input
              id="serviceHours"
              name="serviceHours"
              inputMode="decimal"
              defaultValue={values.serviceHours}
              invalid={!!err("serviceHours")}
            />
          </Field>
        </Row>

        <Field
          label="Includes"
          htmlFor="includes"
          hint="One per line. These appear on the client quote."
        >
          <Textarea
            id="includes"
            name="includes"
            rows={4}
            defaultValue={values.includes.join("\n")}
          />
        </Field>

        <Field
          label="Kitchen can adapt for"
          hint="Diets this package can cover on request, even where no listed dish carries the tag."
        >
          <div>
            {DIETARY_TAGS.map((tag) => (
              <Toggle
                key={tag}
                name="adaptableDietary"
                value={tag}
                defaultChecked={values.adaptableDietary.includes(tag)}
              >
                {DIETARY_LABELS[tag]}
              </Toggle>
            ))}
          </div>
        </Field>
      </div>

      <h3 className={ui.cardTitle} style={{ fontSize: 18, marginTop: 18 }}>
        Price tiers
      </h3>
      {err("tiers") ? <FormError>{err("tiers")}</FormError> : null}

      <Table>
        <thead>
          <tr>
            <th className={ui.num}>Up to guests</th>
            <th className={ui.num}>Price per head</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier, i) => (
            <tr key={tier.key}>
              <td className={ui.num} style={{ width: 200 }}>
                <Input
                  name="upToGuests"
                  type="number"
                  min={1}
                  value={tier.upToGuests}
                  onChange={(e) =>
                    setTiers((ts) =>
                      ts.map((t) => (t.key === tier.key ? { ...t, upToGuests: e.target.value } : t)),
                    )
                  }
                  invalid={!!err(`upToGuests.${i}`)}
                  aria-label={`Tier ${i + 1} ceiling`}
                />
              </td>
              <td className={ui.num} style={{ width: 200 }}>
                <Input
                  name="pricePerHead"
                  inputMode="decimal"
                  value={tier.pricePerHead}
                  onChange={(e) =>
                    setTiers((ts) =>
                      ts.map((t) =>
                        t.key === tier.key ? { ...t, pricePerHead: e.target.value } : t,
                      ),
                    )
                  }
                  invalid={!!err(`pricePerHead.${i}`)}
                  aria-label={`Tier ${i + 1} price`}
                />
              </td>
              <td className={ui.num}>
                <button
                  type="button"
                  className={buttonClass("ghost")}
                  style={{ padding: "4px 10px" }}
                  onClick={() => setTiers((ts) => ts.filter((t) => t.key !== tier.key))}
                  aria-label={`Remove tier ${i + 1}`}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          className={buttonClass("ghost")}
          onClick={() =>
            setTiers((ts) => [...ts, { key: newKey(), upToGuests: "", pricePerHead: "" }])
          }
        >
          Add tier
        </button>
      </div>

      <h3 className={ui.cardTitle} style={{ fontSize: 18, marginTop: 18 }}>
        Menu
      </h3>
      {err("menuItems") ? <FormError>{err("menuItems")}</FormError> : null}

      <Table>
        <tbody>
          {slots.map((slot, i) => (
            <tr key={slot.key}>
              <td>
                <Select
                  name="menuItemId"
                  value={slot.menuItemId}
                  onChange={(e) =>
                    setSlots((ss) =>
                      ss.map((x) => (x.key === slot.key ? { ...x, menuItemId: e.target.value } : x)),
                    )
                  }
                  aria-label={`Menu item ${i + 1}`}
                >
                  <option value="">Choose a menu item…</option>
                  {menuItems.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </td>
              <td className={ui.num} style={{ width: 120 }}>
                <button
                  type="button"
                  className={buttonClass("ghost")}
                  style={{ padding: "4px 10px" }}
                  onClick={() => setSlots((ss) => ss.filter((x) => x.key !== slot.key))}
                  aria-label={`Remove menu item ${i + 1}`}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          className={buttonClass("ghost")}
          onClick={() => setSlots((ss) => [...ss, { key: newKey(), menuItemId: "" }])}
        >
          Add menu item
        </button>
      </div>

      <div style={{ marginTop: 14 }}>
        <Toggle name="active" defaultChecked={values.active}>
          Active
        </Toggle>
      </div>

      <Actions>
        <Link href="/app/packages" className={buttonClass("ghost")}>
          Cancel
        </Link>
        <SubmitButton />
      </Actions>
    </form>
  );
}
