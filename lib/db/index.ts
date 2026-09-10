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
    /* 0 means never retire an idle connection. Supabase is happy with the
       default; the local dev database (npm run db:dev) needs a single
       connection held open, because it serves one at a time. */
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT ?? 10_000),
    allowExitOnIdle: false,
  }));

  /* A pooled connection can die while idle — the local dev database drops it,
     and a real network will too. Without a listener here that arrives as an
     unhandled 'error' event on the Pool, which can take the process down;
     with one, pg discards the dead client and the next request gets a fresh
     one. It does not rescue the request that was in flight when it happened:
     that still surfaces as ECONNRESET. */
  pool.on("error", (err) => {
    console.error("[db] idle connection died, discarding it:", err.message);
  });

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
