"use client";

import { useActionState, useMemo, useState } from "react";
import { saveAndPreviewQuote, saveQuoteDraft } from "@/lib/actions/quotes";
import { CanWrite } from "@/components/ReadOnly";
import { Card, EmptyState, Tag, buttonClass } from "@/components/ui";
import { Stat, Stats, Table, ui } from "@/components/ui/table";
import { Field, FormError, Input, Row, Select, Textarea, form } from "@/components/ui/form";
import { buildCatalogue, type CatalogueInput } from "@/lib/engine/catalogue";
import { money, moneyDeduction, percent } from "@/lib/engine/format";
import { rankPackages } from "@/lib/engine/fit";
import {
  buildQuoteLines,
  isMarginHealthy,
  quoteTotals,
  tierPrice,
} from "@/lib/engine/pricing";
import {
  DIETARY_LABELS,
  DIETARY_TAGS,
  STYLES,
  STYLE_LABELS,
  type DietaryTag,
  type Settings,
  type Style,
} from "@/lib/engine/types";
import type { CustomLineInput, QuoteEventInput } from "@/lib/quotes/types";
import { idle } from "@/lib/validate";

type Draft = {
  quoteId?: string;
  event: QuoteEventInput;
  packageId: string | null;
  /** null means "follow the tier price"; a number is a staff override. */
  pricePerHead: number | null;
  discount: number;
  addonIds: string[];
  customLines: CustomLineInput[];
};

const dollarsToCents = (v: string) => Math.round((Number(v) || 0) * 100);
const centsToDollars = (c: number) => String(c / 100);

export function QuoteBuilder({
  catalogue,
  settings,
  initial,
}: {
  catalogue: CatalogueInput;
  settings: Settings;
  initial: Draft;
}) {
  const cat = useMemo(() => buildCatalogue(catalogue), [catalogue]);

  const [draft, setDraft] = useState<Draft>(initial);
  const [saveState, save] = useActionState(saveQuoteDraft, idle);
  const [previewState, preview] = useActionState(saveAndPreviewQuote, idle);

  const setEvent = <K extends keyof QuoteEventInput>(key: K, value: QuoteEventInput[K]) =>
    setDraft((d) => ({ ...d, event: { ...d.event, [key]: value } }));

  const toggleDiet = (tag: DietaryTag) =>
    setEvent(
      "dietary",
      draft.event.dietary.includes(tag)
        ? draft.event.dietary.filter((t) => t !== tag)
        : [...draft.event.dietary, tag],
    );

  const engineEvent = {
    guests: draft.event.guests,
    style: draft.event.style,
    durationHours: draft.event.durationHours,
    dietary: draft.event.dietary,
  };

  const ranked = useMemo(
    () => rankPackages([...cat.packages.values()], engineEvent, cat),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cat, draft.event.guests, draft.event.style, draft.event.dietary, draft.event.durationHours],
  );

  const pkg = draft.packageId ? (cat.packages.get(draft.packageId) ?? null) : null;
  const listPrice = pkg ? tierPrice(pkg, draft.event.guests) : 0;
  const price = draft.pricePerHead ?? listPrice;

  const addons = draft.addonIds.flatMap((id) => {
    const addon = cat.addons.get(id);
    return addon ? [addon] : [];
  });

  const lines = pkg
    ? buildQuoteLines({
        pkg,
        event: engineEvent,
        pricePerHead: price,
        addons,
        settings,
        customLines: draft.customLines,
      })
    : [];

  const totals = quoteTotals({
    lines,
    discount: draft.discount,
    pkg,
    event: engineEvent,
    settings,
    cat,
  });

  const payload = JSON.stringify({
    event: draft.event,
    packageId: draft.packageId,
    pricePerHead: price,
    discount: draft.discount,
    addonIds: draft.addonIds,
    customLines: draft.customLines,
  });

  const error = saveState.message ?? previewState.message;

  return (
    <div className={ui.splitGrid}>
      <Card title="Event details">
        <Field label="Client" htmlFor="clientName">
          <Input
            id="clientName"
            value={draft.event.clientName}
            onChange={(e) => setEvent("clientName", e.target.value)}
            placeholder="e.g. Harper & Co. wedding"
          />
        </Field>

        <Row>
          <Field label="Date" htmlFor="eventDate">
            <Input
              id="eventDate"
              type="date"
              value={draft.event.eventDate}
              onChange={(e) => setEvent("eventDate", e.target.value)}
            />
          </Field>
          <Field label="Guests" htmlFor="guests">
            <Input
              id="guests"
              type="number"
              min={1}
              value={draft.event.guests}
              onChange={(e) => setEvent("guests", Number(e.target.value) || 0)}
            />
          </Field>
        </Row>

        <Row>
          <Field label="Service style" htmlFor="style">
            <Select
              id="style"
              value={draft.event.style ?? ""}
              onChange={(e) => setEvent("style", (e.target.value || null) as Style | null)}
            >
              <option value="">Any style</option>
              {STYLES.map((style) => (
                <option key={style} value={style}>
                  {STYLE_LABELS[style]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Duration (hours)" htmlFor="durationHours">
            <Input
              id="durationHours"
              type="number"
              min={0}
              step="0.5"
              value={draft.event.durationHours}
              onChange={(e) => setEvent("durationHours", Number(e.target.value) || 0)}
            />
          </Field>
        </Row>

        <Field label="Venue" htmlFor="venue">
          <Input
            id="venue"
            value={draft.event.venue ?? ""}
            onChange={(e) => setEvent("venue", e.target.value || null)}
            placeholder="Suburb or venue name"
          />
        </Field>

        <Field label="Contact email" htmlFor="contactEmail">
          <Input
            id="contactEmail"
            type="email"
            value={draft.event.contactEmail ?? ""}
            onChange={(e) => setEvent("contactEmail", e.target.value || null)}
            placeholder="Where the quote gets sent"
          />
        </Field>

        <Field label="Dietary requirements">
          <div className={ui.chips}>
            {DIETARY_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`${ui.chip} ${draft.event.dietary.includes(tag) ? ui.chipOn : ""}`}
                aria-pressed={draft.event.dietary.includes(tag)}
                onClick={() => toggleDiet(tag)}
              >
                {DIETARY_LABELS[tag]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Notes" htmlFor="notes">
          <Textarea
            id="notes"
            rows={3}
            value={draft.event.notes ?? ""}
            onChange={(e) => setEvent("notes", e.target.value || null)}
          />
        </Field>
      </Card>

      <div className={ui.stack}>
        <Card title="Packages that fit">
          {ranked.map(({ pkg: candidate, issues, blocked }) => (
            <button
              key={candidate.id}
              type="button"
              disabled={blocked}
              aria-pressed={draft.packageId === candidate.id}
              className={`${ui.pk} ${draft.packageId === candidate.id ? ui.pkSelected : ""} ${
                blocked ? ui.pkBlocked : ""
              }`}
              onClick={() =>
                setDraft((d) => ({ ...d, packageId: candidate.id, pricePerHead: null }))
              }
            >
              <span>
                <span className={ui.pkName}>{candidate.name}</span>
                <span className={ui.pkBlurb} style={{ display: "block" }}>
                  {candidate.blurb}
                </span>
                <span style={{ display: "block", marginTop: 6 }}>
                  {issues.length === 0 ? <Tag tone="ok">Fits this event</Tag> : null}
                  {issues.map((issue) => (
                    <Tag key={issue.message} tone={issue.severity === "hard" ? "bad" : "warn"}>
                      {issue.message}
                    </Tag>
                  ))}
                </span>
              </span>
              <span className={ui.pkPrice}>
                <b>{money(tierPrice(candidate, draft.event.guests))}</b>
                <span
                  className={ui.muted}
                  style={{ display: "block", fontSize: 11.5 }}
                >
                  per head
                </span>
              </span>
            </button>
          ))}
        </Card>

        {pkg ? (
          <Card title="Quote">
            {error ? <FormError>{error}</FormError> : null}

            <Stats>
              <Stat label="Quote total" value={money(totals.total)} />
              <Stat label="Food + staff cost" value={money(totals.food + totals.staff)} />
              <Stat
                label="Gross margin"
                value={percent(totals.margin)}
                tone={isMarginHealthy(totals.margin) ? "green" : "red"}
              />
            </Stats>

            {totals.hasUncostedLines ? (
              <p className={`${ui.muted} ${ui.small}`} style={{ marginTop: -6 }}>
                Custom lines carry no recipe, so the real cost is higher than this margin shows.
              </p>
            ) : null}

            <Table>
              <thead>
                <tr>
                  <th>Line</th>
                  <th className={ui.num}>Qty</th>
                  <th className={ui.num}>Unit</th>
                  <th className={ui.num}>Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => {
                  const isPackageLine = line.source === "package";
                  const customIndex =
                    line.source === "custom"
                      ? lines.slice(0, i).filter((l) => l.source === "custom").length
                      : -1;

                  return (
                    <tr key={`${line.source}-${line.sort}`}>
                      <td>
                        {customIndex >= 0 ? (
                          <input
                            className={ui.wideInput}
                            value={line.label}
                            aria-label="Custom line description"
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                customLines: d.customLines.map((c, ci) =>
                                  ci === customIndex ? { ...c, label: e.target.value } : c,
                                ),
                              }))
                            }
                          />
                        ) : (
                          line.label
                        )}
                        {isPackageLine && price !== listPrice ? (
                          <Tag tone="warn">List {money(listPrice)}</Tag>
                        ) : null}
                        {customIndex >= 0 ? <Tag tone="warn">Uncosted</Tag> : null}
                      </td>
                      <td className={ui.num}>
                        {customIndex >= 0 ? (
                          <input
                            className={ui.lineInput}
                            type="number"
                            min={0}
                            step="any"
                            value={line.qty}
                            aria-label="Custom line quantity"
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                customLines: d.customLines.map((c, ci) =>
                                  ci === customIndex
                                    ? { ...c, qty: Number(e.target.value) || 0 }
                                    : c,
                                ),
                              }))
                            }
                          />
                        ) : (
                          line.qty
                        )}
                      </td>
                      <td className={ui.num}>
                        {isPackageLine ? (
                          <input
                            className={ui.lineInput}
                            type="number"
                            min={0}
                            step="0.01"
                            value={centsToDollars(price)}
                            aria-label="Price per head"
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                pricePerHead: dollarsToCents(e.target.value),
                              }))
                            }
                          />
                        ) : customIndex >= 0 ? (
                          <input
                            className={ui.lineInput}
                            type="number"
                            min={0}
                            step="0.01"
                            value={centsToDollars(line.unitPrice)}
                            aria-label="Custom line unit price"
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d,
                                customLines: d.customLines.map((c, ci) =>
                                  ci === customIndex
                                    ? { ...c, unitPrice: dollarsToCents(e.target.value) }
                                    : c,
                                ),
                              }))
                            }
                          />
                        ) : (
                          money(line.unitPrice)
                        )}
                      </td>
                      <td className={ui.num}>{money(line.qty * line.unitPrice)}</td>
                      <td className={ui.num}>
                        {customIndex >= 0 ? (
                          <button
                            type="button"
                            className={buttonClass("ghost")}
                            style={{ padding: "2px 8px" }}
                            aria-label="Remove custom line"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                customLines: d.customLines.filter((_, ci) => ci !== customIndex),
                              }))
                            }
                          >
                            ✕
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}

                <tr>
                  <td>Discount</td>
                  <td />
                  <td className={ui.num}>
                    <input
                      className={ui.lineInput}
                      type="number"
                      min={0}
                      step="0.01"
                      value={centsToDollars(draft.discount)}
                      aria-label="Discount"
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, discount: dollarsToCents(e.target.value) }))
                      }
                    />
                  </td>
                  <td className={ui.num}>
                    {draft.discount ? moneyDeduction(draft.discount) : "—"}
                  </td>
                  <td />
                </tr>

                <tr className={ui.totalRow}>
                  <td>Total inc. GST</td>
                  <td />
                  <td />
                  <td className={ui.num}>{money(totals.total)}</td>
                  <td />
                </tr>
              </tbody>
            </Table>

            <p className={`${ui.muted} ${ui.small}`} style={{ marginTop: 6 }}>
              Includes {money(totals.gst)} GST.
            </p>

            <div style={{ marginTop: 14 }}>
              <span className={form.label}>Add-ons</span>
              {[...cat.addons.values()].map((addon) => (
                <label key={addon.id} className={form.toggle}>
                  <input
                    type="checkbox"
                    checked={draft.addonIds.includes(addon.id)}
                    onChange={() =>
                      setDraft((d) => ({
                        ...d,
                        addonIds: d.addonIds.includes(addon.id)
                          ? d.addonIds.filter((a) => a !== addon.id)
                          : [...d.addonIds, addon.id],
                      }))
                    }
                  />
                  {addon.name}{" "}
                  <span className={ui.muted}>
                    — {money(addon.price)} {addon.pricingBasis === "head" ? "per head" : "flat"}
                  </span>
                </label>
              ))}
            </div>

            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                className={buttonClass("ghost")}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    customLines: [...d.customLines, { label: "", qty: 1, unitPrice: 0 }],
                  }))
                }
              >
                Add a one-off line
              </button>
            </div>

            {/* The builder itself stays live for a read-only account — the
                packages, the margin, the add-ons all still respond. Only
                saving goes, because only saving writes. */}
            <CanWrite>
              <div className={ui.actions}>
                <form action={save}>
                  <input type="hidden" name="payload" value={payload} />
                  {draft.quoteId ? (
                    <input type="hidden" name="quoteId" value={draft.quoteId} />
                  ) : null}
                  <button type="submit" className={buttonClass("ghost")}>
                    Save draft
                  </button>
                </form>
                <form action={preview}>
                  <input type="hidden" name="payload" value={payload} />
                  {draft.quoteId ? (
                    <input type="hidden" name="quoteId" value={draft.quoteId} />
                  ) : null}
                  <button type="submit" className={buttonClass()}>
                    Preview client quote
                  </button>
                </form>
              </div>
            </CanWrite>
          </Card>
        ) : (
          <Card>
            <EmptyState title="Choose a package">
              Select a package above to build the quote.
            </EmptyState>
          </Card>
        )}
      </div>
    </div>
  );
}
