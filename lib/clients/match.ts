/* Finding the client someone means, when they type the name from memory.
 *
 * Pure. No database import — this runs on the server to rank query results and
 * in the browser to filter them as staff type.
 *
 * IMPORTANT: normalisation is for *searching only*. Uniqueness in the database
 * is `lower(name)` and nothing else, so two clients whose names normalise the
 * same — "Harper Pty Ltd" and "Harper" — are both legitimate rows and the
 * typeahead will offer both. Normalising on the way in would silently merge
 * two real businesses.
 */

/** Trailing company suffixes, stripped one token at a time so "pty ltd" goes.
 *  Only ever at the end: a client called "Limited Editions" keeps its name. */
const TRAILING_SUFFIX = /\s(?:pty|ltd|limited|inc|llc|incorporated)$/;

/** Case-folded, `&` read as "and", punctuation flattened to spaces, trailing
 *  company suffixes dropped. "Harper & Co." and "harper and co pty ltd" both
 *  land on "harper and co". */
export function normaliseClientName(name: string): string {
  let out = name.toLowerCase().replace(/&/g, " and ");
  // Punctuation to spaces rather than nothing, so "Smith/Jones" stays two words.
  out = out.replace(/[^a-z0-9]+/g, " ").trim();

  let previous = "";
  while (out !== previous) {
    previous = out;
    out = out.replace(TRAILING_SUFFIX, "").trim();
  }

  return out;
}

export type NameLike = { name: string };

/** How well a client answers the query. Higher is better; 0 means no match. */
export function matchScore(name: string, query: string): number {
  const n = normaliseClientName(name);
  const q = normaliseClientName(query);
  if (!q) return 0;
  if (n === q) return 4;
  if (n.startsWith(q)) return 3;
  // Any word starting with the query — "gallery" finds "Rossmoyne Gallery".
  if (n.split(" ").some((word) => word.startsWith(q))) return 2;
  if (n.includes(q)) return 1;
  return 0;
}

/** Matching clients, best first. Ties keep their incoming order, which the
 *  caller sorts by most recent activity, so the client someone is most likely
 *  to mean comes first among equals. */
export function matchClients<T extends NameLike>(clients: T[], query: string, limit = 8): T[] {
  const q = normaliseClientName(query);
  if (!q) return [];

  return clients
    .map((client, index) => ({ client, index, score: matchScore(client.name, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((row) => row.client);
}

/** Whether a typed name is the same client as an existing one, for deciding
 *  between linking and creating. Deliberately stricter than search: only an
 *  exact normalised match counts, so "Harper" never silently becomes
 *  "Harper & Co." */
export function sameClient(a: string, b: string): boolean {
  const na = normaliseClientName(a);
  return na.length > 0 && na === normaliseClientName(b);
}
