"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Field, Input, form } from "@/components/ui/form";
import { getClientBrief, searchClients } from "@/lib/actions/clients";
import type { ClientBrief, ClientMatch } from "@/lib/clients/types";
import styles from "./client.module.css";

/* The client field, which used to be a plain text box.
 *
 * Typing still works exactly as it did — a name that matches nothing is simply
 * a new client, created on save — so quoting a phone enquiry costs no extra
 * clicks. Matching suggestions appear as you type, and picking one loads what
 * the office already knows.
 */

export function ClientPicker({
  clientId,
  clientName,
  onType,
  onPick,
}: {
  clientId: string | null;
  clientName: string;
  /** A keystroke. Detaches any picked client: the name no longer means them. */
  onType: (name: string) => void;
  /** A suggestion was chosen, and their record has loaded. */
  onPick: (brief: ClientBrief) => void;
}) {
  const [suggestions, setSuggestions] = useState<ClientMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  /* Debounced so a fast typist does not fire a request per keystroke. The
     query is captured per-effect, and `live` drops a response that arrives
     after the query moved on, so results cannot land out of order. */
  useEffect(() => {
    if (clientId || clientName.trim().length < 2) {
      setSuggestions([]);
      // Also clear this: backspacing from "Har" to "H" takes the early return,
      // and the previous run’s cleanup has already set its own live to false,
      // so nothing else would ever turn "Looking…" off again.
      setLoading(false);
      return;
    }

    let live = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchClients(clientName);
        if (live) setSuggestions(found);
      } catch {
        /* An expired session or a dropped connection. Show nothing rather than
           an unhandled rejection: staff can still type the name, and it becomes
           a new client on save. */
        if (live) setSuggestions([]);
      } finally {
        if (live) setLoading(false);
      }
    }, 180);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [clientName, clientId]);

  // A click outside closes the list without choosing anything.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  async function choose(summary: ClientMatch) {
    setOpen(false);
    try {
      const brief = await getClientBrief(summary.id);
      if (brief) onPick(brief);
      else setFailed(true);
    } catch {
      /* Without this the click silently does nothing, the client never
         attaches, and the quote is later filed under a second client created
         from the same name. Say so instead. */
      setFailed(true);
    }
  }

  const showing = open && !clientId && suggestions.length > 0;

  return (
    <div className={styles.wrap} ref={boxRef}>
      <Field
        label="Client"
        htmlFor="clientName"
        hint={
          clientId
            ? undefined
            : "Start typing. Pick a match to load their history, or keep typing for a new client."
        }
      >
        <Input
          id="clientName"
          value={clientName}
          autoComplete="off"
          role="combobox"
          aria-expanded={showing}
          aria-controls={listId}
          onChange={(e) => {
            setFailed(false);
            onType(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="e.g. Harper & Co."
        />
      </Field>

      {showing ? (
        <ul className={styles.list} id={listId} role="listbox">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                className={styles.option}
                onClick={() => void choose(s)}
              >
                <span className={styles.optionName}>{s.name}</span>
                <span className={styles.optionMeta}>
                  {s.eventCount === 0
                    ? "no events yet"
                    : `${s.eventCount} event${s.eventCount === 1 ? "" : "s"}`}
                  {s.discountPct > 0 ? ` · ${s.discountPct}% standing discount` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {loading && !clientId ? <p className={form.hint}>Looking…</p> : null}
      {failed ? (
        <p className={form.error}>
          Could not load that client. Check your connection, or keep the name typed and it will
          be treated as a new client.
        </p>
      ) : null}
    </div>
  );
}
