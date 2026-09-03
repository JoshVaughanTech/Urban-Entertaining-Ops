/* Loads the placeholder catalogue into whatever DATABASE_URL points at.
 * Safe to re-run: every catalogue row upserts on its slug. */

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { seedDatabase } from "@/lib/seed/run";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is not set.\n" +
        "Copy .env.local.example to .env.local and paste the Supabase connection string.",
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { casing: "snake_case" });

  try {
    const report = await seedDatabase(db);
    console.log("Seeded:");
    for (const [table, count] of Object.entries(report)) {
      console.log(`  ${String(count).padStart(4)}  ${table}`);
    }
    console.log("\nRe-running this is safe — catalogue rows upsert on their slug.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
