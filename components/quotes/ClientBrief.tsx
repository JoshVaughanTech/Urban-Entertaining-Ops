"use client";

import type { Route } from "next";
import Link from "next/link";

import { Tag } from "@/components/ui";
import { ui } from "@/components/ui/table";
import { CONTACT_ROLE_LABELS, type ClientBrief } from "@/lib/clients/types";
import { money, shortDate } from "@/lib/engine/format";
import styles from "./client.module.css";

/* What the office already knows about this client.
 *
 * Everything here is internal. Preferences and staff requests are operational
 * memory and must never reach the client-facing document — see
 * lib/data/client-freeze.test.ts.
 */

export function ClientBriefPanel({
  brief,
  discountApplied,
  onClear,
}: {
  brief: ClientBrief;
  /** Cents currently coming off this quote because of their standing rate. */
  discountApplied: number | null;
  onClear: () => void;
}) {
  const { client, history } = brief;
  const past = history.filter((h) => h.status === "confirmed" || h.status === "sent");

  return (
    <div className={styles.brief}>
      <div className={styles.briefHead}>
        <div>
          <strong>{client.name}</strong>
          <span className={`${ui.muted} ${ui.small}`}>
            {" "}
            ·{" "}
            {history.length === 0
              ? "first time"
              : `${history.length} quote${history.length === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className={styles.briefActions}>
          <Link href={`/app/clients/${client.id}` as Route} className={styles.briefLink}>
            Open record
          </Link>
          <button type="button" className={styles.briefLink} onClick={onClear}>
            Not them
          </button>
        </div>
      </div>

      {client.discountPct > 0 ? (
        <p className={styles.briefRow}>
          <Tag tone="ok">{client.discountPct}% standing discount</Tag>{" "}
          {discountApplied === null ? (
            <span className={ui.muted}>Not applied — the discount below was set by hand.</span>
          ) : (
            <span className={ui.muted}>
              Applied: {money(discountApplied)} off. Change the discount below to override.
            </span>
          )}
        </p>
      ) : null}

      {client.preferences ? (
        <p className={styles.briefRow}>
          <span className={styles.briefLabel}>Preferences</span>
          {client.preferences}
        </p>
      ) : null}

      {client.staffNotes ? (
        <p className={styles.briefRow}>
          <span className={styles.briefLabel}>Staff requests</span>
          {client.staffNotes}
        </p>
      ) : null}

      {client.contacts.length > 0 ? (
        <p className={styles.briefRow}>
          <span className={styles.briefLabel}>Contacts</span>
          {client.contacts.map((c, i) => (
            <span key={c.id}>
              {i > 0 ? " · " : ""}
              {c.name} ({CONTACT_ROLE_LABELS[c.role]})
              {c.email ? ` ${c.email}` : ""}
            </span>
          ))}
        </p>
      ) : null}

      {past.length > 0 ? (
        <div className={styles.briefRow}>
          <span className={styles.briefLabel}>Previous events</span>
          <ul className={styles.historyList}>
            {past.slice(0, 5).map((entry) => (
              <li key={entry.quoteId}>
                <Link href={`/app/quotes/${entry.quoteId}` as Route}>
                  {shortDate(entry.eventDate)}
                </Link>{" "}
                <span className={ui.muted}>
                  {entry.packageName ?? "no package"} · {entry.guests} guests
                  {entry.total === null ? "" : ` · ${money(entry.total)}`} · {entry.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
