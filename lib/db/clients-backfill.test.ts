/* The 0004 backfill, run the way it will actually run: against events that
 * already exist.
 *
 * A plain `migrate()` applies every migration at once, so the backfill would
 * sweep an empty events table and prove nothing. Instead this migrates as far
 * as 0003, writes the events, and only then applies 0004 — which is the
 * situation on a real database.
 */

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
let scratch: string;

/** A copy of ./drizzle with 0004 removed, so the migrator stops at 0003. */
function migrationsUpTo0003(dir: string) {
  const folder = join(dir, "up-to-0003");
  cpSync("./drizzle", folder, { recursive: true });
  rmSync(join(folder, "0004_clients.sql"));
  const journalPath = join(folder, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  journal.entries = journal.entries.filter(
    (e: { tag: string }) => e.tag !== "0004_clients",
  );
  writeFileSync(journalPath, JSON.stringify(journal, null, 2));
  return folder;
}

/* Two spellings of one client, a third differing only by case and whitespace,
   a genuinely separate client, and a blank name that must not produce a row. */
const EVENTS = [
  { name: "Harper & Co.", date: "2026-03-01" },
  { name: "harper & co.", date: "2026-05-01" },
  { name: "  HARPER & CO.  ", date: "2026-07-01" },
  { name: "Rossmoyne Gallery", date: "2026-08-01" },
  { name: "   ", date: "2026-09-01" },
];

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), "ue-backfill-"));
  db = drizzle(new PGlite(), { casing: "snake_case" });

  await migrate(db, { migrationsFolder: migrationsUpTo0003(scratch) });

  // created_at decides which spelling wins, so make the order explicit.
  let created = 0;
  for (const e of EVENTS) {
    created += 1;
    await db.execute(sql`
      insert into events (client_name, event_date, guests, duration_hours, created_at)
      values (${e.name}, ${e.date}, 80, 3, ${`2026-01-0${created}T00:00:00Z`})
    `);
  }

  await migrate(db, { migrationsFolder: "./drizzle" });
}, 120_000);

afterAll(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

describe("the 0004 backfill", () => {
  it("creates one client per distinct name, ignoring case and whitespace", async () => {
    const { rows } = await db.execute(sql`select name from clients order by name`);
    expect(rows.map((r: { name: string }) => r.name)).toEqual([
      "Harper & Co.",
      "Rossmoyne Gallery",
    ]);
  });

  it("keeps the earliest spelling as the canonical one", async () => {
    const { rows } = await db.execute(
      sql`select name from clients where lower(name) = 'harper & co.'`,
    );
    // Not "harper & co." and not the padded upper-case one.
    expect(rows[0].name).toBe("Harper & Co.");
  });

  it("links every named event to its client", async () => {
    const { rows } = await db.execute(sql`
      select e.client_name, c.name as client
      from events e join clients c on c.id = e.client_id
      order by e.event_date
    `);
    expect(rows).toHaveLength(4);
    for (const row of rows as { client: string }[]) {
      expect(["Harper & Co.", "Rossmoyne Gallery"]).toContain(row.client);
    }
  });

  it("groups the three spellings onto one client", async () => {
    const { rows } = await db.execute(sql`
      select count(*)::int as n
      from events e join clients c on c.id = e.client_id
      where lower(c.name) = 'harper & co.'
    `);
    expect(rows[0].n).toBe(3);
  });

  it("leaves a blank-named event unlinked rather than inventing a client", async () => {
    const { rows } = await db.execute(
      sql`select client_name from events where client_id is null`,
    );
    expect(rows).toHaveLength(1);
    expect((rows[0] as { client_name: string }).client_name.trim()).toBe("");
  });

  it("preserves client_name on the event, so a rename cannot rewrite history", async () => {
    await db.execute(sql`update clients set name = 'Harper Group' where lower(name) = 'harper & co.'`);
    const { rows } = await db.execute(sql`
      select e.client_name, c.name as client
      from events e join clients c on c.id = e.client_id
      where c.name = 'Harper Group'
      order by e.event_date
    `);
    // The client is renamed; every event still says what it was sold under.
    expect(rows.map((r: { client_name: string }) => r.client_name.trim())).toEqual([
      "Harper & Co.",
      "harper & co.",
      "HARPER & CO.",
    ]);
  });
});

describe("the clients schema", () => {
  it("refuses a duplicate name differing only by case", async () => {
    await db.execute(sql`insert into clients (name) values ('Unique Co')`);
    await expect(
      db.execute(sql`insert into clients (name) values ('UNIQUE CO')`),
    ).rejects.toThrow();
  });

  it("refuses a discount outside 0..100", async () => {
    await expect(
      db.execute(sql`insert into clients (name, discount_pct) values ('Bad Pct', 101)`),
    ).rejects.toThrow();
    await expect(
      db.execute(sql`insert into clients (name, discount_pct) values ('Bad Pct 2', -1)`),
    ).rejects.toThrow();
  });

  it("allows only one primary contact per client", async () => {
    const { rows } = await db.execute(sql`insert into clients (name) values ('Contacts Co') returning id`);
    const id = (rows[0] as { id: string }).id;
    await db.execute(sql`
      insert into client_contacts (client_id, role, name, is_primary)
      values (${id}, 'booker', 'First', true)
    `);
    // A second non-primary is fine.
    await db.execute(sql`
      insert into client_contacts (client_id, role, name, is_primary)
      values (${id}, 'on_site', 'Second', false)
    `);
    await expect(
      db.execute(sql`
        insert into client_contacts (client_id, role, name, is_primary)
        values (${id}, 'billing', 'Third', true)
      `),
    ).rejects.toThrow();
  });

  it("refuses to delete a client that has events against it", async () => {
    await expect(
      db.execute(sql`delete from clients where name = 'Harper Group'`),
    ).rejects.toThrow();
  });
});
