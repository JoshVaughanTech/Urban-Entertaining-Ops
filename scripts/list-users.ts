/* Who currently has access.
 *
 *   npm run user:list
 *
 * Against Supabase this just works. Against the local dev database it needs
 * the connection the app is holding, so stop `npm run dev` first — that
 * database serves one client at a time.
 */

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { bootstrapEmails, listMembers } from "@/lib/data/members";

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
    const members = await listMembers(db);

    if (members.length === 0) {
      console.log("Nobody has access yet. The first person to sign in becomes admin.");
    } else {
      console.log(`${members.length} with access:\n`);
      for (const m of members) {
        const seen = m.authUserId ? "signed in" : "not yet signed in";
        console.log(`  ${m.role.padEnd(6)}  ${m.email.padEnd(34)}  ${seen}`);
      }
    }

    const admins = members.filter((m) => m.role === "admin").length;
    console.log(
      admins === 0
        ? "\nNo admins — the next person to sign in becomes one."
        : `\n${admins} admin${admins === 1 ? "" : "s"}.`,
    );

    const bootstrap = bootstrapEmails();
    if (bootstrap.length > 0) {
      console.log(`Admitted by ALLOWED_EMAILS: ${bootstrap.join(", ")}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/ECONNRESET|terminated/i.test(message)) {
      console.error(
        "Could not connect. The local dev database serves one client at a time —\n" +
          "stop `npm run dev` and try again.",
      );
      process.exit(1);
    }
    console.error(message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
