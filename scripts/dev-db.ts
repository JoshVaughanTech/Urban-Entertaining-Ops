/* A throwaway Postgres for local development.
 *
 * Runs PGlite behind a real Postgres wire-protocol socket, migrates it and
 * seeds it, so the app can be run end to end before a Supabase project
 * exists. Development only — Supabase is the real database.
 *
 *   npm run db:dev
 *
 * It used to serve one connection at a time, which meant the pool had to be
 * pinned to a single connection, nothing else could touch the database while
 * the dev server ran, and any abrupt disconnect left the socket server wedged
 * until it was restarted.
 *
 * That was never a limit of PGlite. PGLiteSocketServer defaults maxConnections
 * to 1, and we never set it. It queues queries internally, so PGlite still
 * executes one at a time — the part that genuinely has to be serial — while
 * the connections above it come and go freely.
 */

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { seedDemo } from "@/lib/seed/demo";
import { seedDatabase } from "@/lib/seed/run";

const PORT = Number(process.env.UE_DEV_DB_PORT ?? 5433);
const DATA_DIR = ".pglite";
const MAX_CONNECTIONS = Number(process.env.UE_DEV_DB_MAX_CONNECTIONS ?? 20);

async function main() {
  const client = await PGlite.create(DATA_DIR);
  const db = drizzle(client, { casing: "snake_case" });

  console.log("Migrating…");
  await migrate(db, { migrationsFolder: "./drizzle" });

  /* --demo also loads a fuller book of work. Done in-process, before the
     socket opens, because the socket serves one connection at a time. */
  if (process.argv.includes("--demo")) {
    console.log("Seeding catalogue and demo quotes…");
    const demo = await seedDemo(db);
    console.log(demo.skipped ? "  demo book already present" : `  ${demo.created} demo quotes`);
  } else {
    console.log("Seeding…");
    const report = await seedDatabase(db);
    for (const [table, count] of Object.entries(report)) {
      console.log(`  ${String(count).padStart(4)}  ${table}`);
    }
  }

  const server = new PGLiteSocketServer({
    db: client,
    port: PORT,
    host: "127.0.0.1",
    /* Room for the app’s pool and a script or a migration beside it. */
    maxConnections: MAX_CONNECTIONS,
  });
  await server.start();

  console.log(
    `\nDev database listening on 127.0.0.1:${PORT}.\n` +
      `Up to ${MAX_CONNECTIONS} connections. Data persists in ${DATA_DIR}/. Ctrl+C to stop.\n`,
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
