/* Who gets in.
 *
 * A Supabase session only proves someone owns an email address — anyone can
 * get one by requesting a magic link at their own. These rules are what
 * stands between that and the client's pricing. */

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as s from "@/lib/db/schema";
import {
  MemberError,
  addMember,
  listMembers,
  removeMember,
  resolveMember,
  setMemberRole,
} from "./members";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;

const AUTH_A = "11111111-1111-1111-1111-111111111111";
const AUTH_B = "22222222-2222-2222-2222-222222222222";

beforeAll(async () => {
  const client = new PGlite();
  db = drizzle(client, { casing: "snake_case" });
  await migrate(db, { migrationsFolder: "./drizzle" });
}, 120_000);

beforeEach(async () => {
  await db.delete(s.appUsers);
  delete process.env.ALLOWED_EMAILS;
});

afterEach(() => {
  delete process.env.ALLOWED_EMAILS;
});

describe("the bootstrap", () => {
  it("lets the very first person in, so a new deployment is usable", async () => {
    const member = await resolveMember(db, AUTH_A, "josh@urbanentertaining.example");
    expect(member).not.toBeNull();
    expect(member!.role).toBe("admin");
  });

  it("closes behind them — the second stranger is refused", async () => {
    await resolveMember(db, AUTH_A, "josh@urbanentertaining.example");
    expect(await resolveMember(db, AUTH_B, "stranger@example.com")).toBeNull();
  });

  it("does not apply once ALLOWED_EMAILS is set", async () => {
    process.env.ALLOWED_EMAILS = "owner@urbanentertaining.example";
    expect(await resolveMember(db, AUTH_A, "stranger@example.com")).toBeNull();
    expect(await resolveMember(db, AUTH_B, "owner@urbanentertaining.example")).not.toBeNull();
  });

  it("reads a comma separated list, ignoring case and spacing", async () => {
    process.env.ALLOWED_EMAILS = " Owner@Example.com , chef@example.com ";
    expect(await resolveMember(db, AUTH_A, "CHEF@example.com")).not.toBeNull();
  });
});

describe("the allowlist", () => {
  beforeEach(async () => {
    await addMember(db, "owner@example.com", "admin", "Owner");
  });

  it("refuses an address nobody added", async () => {
    expect(await resolveMember(db, AUTH_B, "stranger@example.com")).toBeNull();
  });

  it("admits someone added by email, and binds their id on first sign-in", async () => {
    await addMember(db, "chef@example.com", "staff", "Chef");

    const first = await resolveMember(db, AUTH_B, "chef@example.com");
    expect(first).not.toBeNull();
    expect(first!.authUserId).toBe(AUTH_B);
    expect(first!.role).toBe("staff");

    // Same person again: matched on id now, not re-bound.
    const again = await resolveMember(db, AUTH_B, "chef@example.com");
    expect(again!.id).toBe(first!.id);
  });

  it("matches regardless of how the address is capitalised", async () => {
    await addMember(db, "Chef@Example.com", "staff", null);
    expect(await resolveMember(db, AUTH_B, "CHEF@EXAMPLE.COM")).not.toBeNull();
  });

  it("refuses an empty email outright", async () => {
    expect(await resolveMember(db, AUTH_B, "")).toBeNull();
    expect(await resolveMember(db, AUTH_B, "   ")).toBeNull();
  });

  it("stops admitting someone the moment their access is removed", async () => {
    const member = await addMember(db, "temp@example.com", "staff", null);
    expect(await resolveMember(db, AUTH_B, "temp@example.com")).not.toBeNull();

    await removeMember(db, member.id);
    expect(await resolveMember(db, AUTH_B, "temp@example.com")).toBeNull();
  });
});

describe("managing the list", () => {
  beforeEach(async () => {
    await addMember(db, "owner@example.com", "admin", "Owner");
  });

  it("refuses a duplicate address", async () => {
    await expect(addMember(db, "owner@example.com", "staff", null)).rejects.toThrow(
      /already on the list/,
    );
  });

  it("refuses something that is not an address", async () => {
    await expect(addMember(db, "not-an-email", "staff", null)).rejects.toThrow(MemberError);
  });

  it("lists everyone, in a stable order", async () => {
    await addMember(db, "chef@example.com", "staff", null);
    await addMember(db, "admin2@example.com", "admin", null);
    expect((await listMembers(db)).map((m) => m.email)).toEqual([
      "admin2@example.com",
      "chef@example.com",
      "owner@example.com",
    ]);
  });

  /* The lockout guard: without it, one careless click leaves nobody able to
     manage access and no way back except editing the database by hand. */
  it("will not remove the last admin", async () => {
    const [owner] = await listMembers(db);
    await expect(removeMember(db, owner!.id)).rejects.toThrow(/last admin/);
  });

  it("will not demote the last admin", async () => {
    const [owner] = await listMembers(db);
    await expect(setMemberRole(db, owner!.id, "staff")).rejects.toThrow(/last admin/);
  });

  it("allows it once there is a second admin", async () => {
    const second = await addMember(db, "admin2@example.com", "admin", null);
    const owner = (await listMembers(db)).find((m) => m.email === "owner@example.com")!;

    await setMemberRole(db, owner.id, "staff");
    expect((await listMembers(db)).find((m) => m.id === owner.id)!.role).toBe("staff");

    // …and now the second one is the last admin, so it is protected in turn.
    await expect(removeMember(db, second.id)).rejects.toThrow(/last admin/);
  });

  it("can promote staff to admin", async () => {
    const chef = await addMember(db, "chef@example.com", "staff", null);
    await setMemberRole(db, chef.id, "admin");
    const rows = await db.select().from(s.appUsers).where(eq(s.appUsers.id, chef.id));
    expect(rows[0].role).toBe("admin");
  });
});
