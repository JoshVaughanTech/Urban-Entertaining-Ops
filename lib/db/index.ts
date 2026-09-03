import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type Database = ReturnType<typeof build>;

declare global {
  // eslint-disable-next-line no-var
  var __uePool: Pool | undefined;
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

  // Reuse the pool across hot reloads in dev so we don't exhaust connections.
  const pool = (globalThis.__uePool ??= new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  }));

  return drizzle(pool, { schema, casing: "snake_case" });
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
