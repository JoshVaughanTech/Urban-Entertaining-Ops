/* A throwaway Postgres for local development.
 *
 * Runs PGlite behind a real Postgres wire-protocol socket, migrates it and
 * seeds it, so the app can be run end to end before a Supabase project
 * exists. Development only — Supabase is the real database.
 *
 *   npm run db:dev
 *
 * It serves ONE connection at a time, so .env.local must pin the pool:
 *
 *   DATABASE_URL=postgres://postgres@127.0.0.1:5433/postgres
 *   DATABASE_POOL_MAX=1
 *   DATABASE_IDLE_TIMEOUT=0
 *
 * Without those the pool opens a second connection, or retires and reopens
 * an idle one, and the socket server resets it.
 */

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { seedDatabase } from "@/lib/seed/run";

const PORT = Number(process.env.UE_DEV_DB_PORT ?? 5433);
const DATA_DIR = ".pglite";

async function main() {
  const client = await PGlite.create(DATA_DIR);
  const db = drizzle(client, { casing: "snake_case" });

  console.log("Migrating…");
  await migrate(db, { migrationsFolder: "./drizzle" });

  console.log("Seeding…");
  const report = await seedDatabase(db);
  for (const [table, count] of Object.entries(report)) {
    console.log(`  ${String(count).padStart(4)}  ${table}`);
  }

  const server = new PGLiteSocketServer({ db: client, port: PORT, host: "127.0.0.1" });
  await server.start();

  console.log(
    `\nDev database listening on 127.0.0.1:${PORT}.\n` +
      `Data persists in ${DATA_DIR}/. Ctrl+C to stop.\n`,
  );

  const stop = async () => {
    await server.stop();
    await client.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
