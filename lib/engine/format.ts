import type { Cents, Unit } from "./types";

/** Whole dollars, the way the mockup shows money in lists and totals. */
export const money = (cents: Cents): string =>
  `$${Math.round(cents / 100).toLocaleString("en-AU")}`;

/** Two decimals, for per-portion and per-guest costs where the cents matter. */
export const moneyPrecise = (cents: Cents): string => `$${(cents / 100).toFixed(2)}`;

/** Negative amounts read as a deduction on a quote, not a minus number. */
export const moneyDeduction = (cents: Cents): string => `−${money(cents)}`;

export const percent = (fraction: number): string => `${Math.round(fraction * 100)}%`;

/** Quantities are only ever as precise as the recipes are. */
export const qty = (n: number, unit?: Unit): string => {
  const rounded = Math.round(n * 1000) / 1000;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(rounded < 1 ? 3 : 1);
  return unit ? `${text} ${unit}` : text;
};

/** ISO date in, "12 Sep" out. Parsed as local midnight so the day never
 *  slips backwards through a timezone conversion. */
export const shortDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

export const longDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** Adds days to an ISO date without going near a Date object's timezone. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const todayISO = (): string => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};
