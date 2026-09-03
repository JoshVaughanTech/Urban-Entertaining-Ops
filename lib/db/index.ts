import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Database = ReturnType<typeof build>;

declare global {
  // eslint-disable-next-line no-var
  var __ueSql: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __ueDb: Database | undefined;
}

function build() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.local.example to .env.local and set the " +
        "Supabase connection string.",
    );
  }
  // Reuse the connection across hot reloads in dev so we don't exhaust the pool.
  // `prepare: false` is required by Supabase's transaction pooler.
  const sql = (globalThis.__ueSql ??= postgres(url, { prepare: false }));
  return drizzle(sql, { schema, casing: "snake_case" });
}

export function getDb(): Database {
  return (globalThis.__ueDb ??= build());
}

/** Connects on first use, not on import, so the app still boots (and can
 *  explain itself) before Josh has supplied a DATABASE_URL. */
export const db = new Proxy({} as Database, {
  get: (_target, prop, receiver) => Reflect.get(getDb(), prop, receiver),
});

export { schema };
