import { db } from "@/lib/db";
import type { Catalogue, Settings } from "@/lib/engine/types";
import { loadCatalogue, loadSettings } from "./catalogue";

export type Loaded =
  | { ok: true; cat: Catalogue; settings: Settings }
  | { ok: false; reason: "unconfigured" | "unmigrated" | "unseeded" | "error"; message: string };

/** Screens call this instead of touching the database directly, so a missing
 *  connection string or an unseeded database produces a page that says what
 *  to do rather than a stack trace. */
export async function loadWorkspace(): Promise<Loaded> {
  try {
    const cat = await loadCatalogue(db);
    const settings = await loadSettings(db);
    return { ok: true, cat, settings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("DATABASE_URL")) {
      return {
        ok: false,
        reason: "unconfigured",
        message: "No database connection string yet.",
      };
    }
    if (/relation .* does not exist/i.test(message)) {
      return {
        ok: false,
        reason: "unmigrated",
        message: "The database has no tables yet.",
      };
    }
    if (message.includes("Settings row is missing")) {
      return { ok: false, reason: "unseeded", message: "The database is empty." };
    }
    return { ok: false, reason: "error", message };
  }
}
