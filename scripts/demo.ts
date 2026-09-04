/* Loads the demo book of work into whatever DATABASE_URL points at.
 * Safe to re-run: it does nothing if the demo quotes are already there. */

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { seedDemo } from "@/lib/seed/demo";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. See .env.local.example.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, max: 1, idleTimeoutMillis: 0 });
  const db = drizzle(pool, { casing: "snake_case" });

  try {
    const report = await seedDemo(db);
    if (report.skipped) {
      console.log("The demo book is already loaded — nothing to do.");
    } else {
      console.log(`Loaded the catalogue and ${report.created} demo quotes.`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
