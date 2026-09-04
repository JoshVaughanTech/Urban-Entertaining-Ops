/* Give someone access from the command line.
 *
 *   npm run user:add -- demo@example.com viewer
 *   npm run user:add -- chef@example.com staff "Priya"
 *
 * The Access screen is the normal way to do this. This exists for the cases
 * where nobody can reach that screen: a fresh deployment, or an office where
 * the last admin has left. Roles are admin, staff, viewer.
 */

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { addMember, listMembers, type Role } from "@/lib/data/members";

config({ path: ".env.local" });

const ROLES: Role[] = ["admin", "staff", "viewer"];

async function main() {
  const [email, roleArg, name] = process.argv.slice(2);

  if (!email) {
    console.error("Usage: npm run user:add -- <email> [admin|staff|viewer] [name]");
    process.exit(1);
  }

  const role = (roleArg ?? "staff") as Role;
  if (!ROLES.includes(role)) {
    console.error(`Unknown role "${roleArg}". Use one of: ${ROLES.join(", ")}.`);
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. See .env.local.example.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, max: 1, idleTimeoutMillis: 0 });
  const db = drizzle(pool, { casing: "snake_case" });

  try {
    const member = await addMember(db, email, role, name ?? null);
    console.log(`Added ${member.email} as ${member.role}.`);
    console.log("They can sign in with that address now — no invitation is sent.\n");

    console.log("Everyone with access:");
    for (const m of await listMembers(db)) {
      const seen = m.authUserId ? "" : "  (not yet signed in)";
      console.log(`  ${m.role.padEnd(6)}  ${m.email}${seen}`);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
