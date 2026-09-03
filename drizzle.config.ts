import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

/** `drizzle-kit generate` only reads the schema, so it works before Josh has
 *  supplied a connection string. `migrate` / `push` / `studio` need a real
 *  DATABASE_URL and will fail loudly without one — which is the right
 *  outcome, since we never want to guess at a database. */
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
