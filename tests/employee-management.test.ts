// Unit tests for Owner employee management (src/lib/employees/). Run with `npm test`.
//
// An in-memory StaffDirectory stands in for Supabase (Auth users + user_roles with the
// FK cascade). It records every privileged call so the tests can assert that callers who
// are not the Owner never reach one. No network, no real accounts, no emails.

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  EMPLOYEE_MESSAGES,
  authorizeOwner,
  inviteEmployee,
  listEmployees,
  normalizeEmail,
  parseUserId,
  removeEmployee,
  type AuthAccount,
  type DirectoryResult,
  type ManagementAccess,
  type StaffDirectory,
} from "../src/lib/employees/management.ts";
import { createSupabaseStaffDirectory } from "../src/lib/employees/supabase-directory.ts";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000002";
const ORPHAN_ID = "00000000-0000-4000-8000-000000000003";

const owner: ManagementAccess = { status: "staff", user: { id: OWNER_ID, role: "owner" } };
const employee: ManagementAccess = { status: "staff", user: { id: EMPLOYEE_ID, role: "employee" } };
const nonOwners: [string, ManagementAccess][] = [
  ["anonymous", { status: "anonymous" }],
  ["authenticated without a role", { status: "unauthorized" }],
  ["role lookup failed", { status: "unavailable" }],
  ["employee", employee],
];

type Failure = { code?: string; status?: number };
type Method = keyof StaffDirectory;

class FakeDirectory implements StaffDirectory {
  accounts = new Map<string, AuthAccount>();
  roles = new Map<string, { role: "owner" | "employee"; createdAt: string }>();
  calls: Method[] = [];
  failures: Partial<Record<Method, Failure>> = {};
  nextId = 100;

  addAccount(id: string, email: string, role?: "owner" | "employee", confirmed = true) {
    this.accounts.set(id, {
      id,
      email,
      createdAt: "2026-09-01T00:00:00Z",
      invitedAt: null,
      emailConfirmedAt: confirmed ? "2026-09-01T00:00:00Z" : null,
      lastSignInAt: null,
    });
    if (role) {
      this.roles.set(id, { role, createdAt: "2026-09-01T00:00:00Z" });
    }
  }

  private run<T>(method: Method, body: () => T): Promise<DirectoryResult<T>> {
    this.calls.push(method);
    const failure = this.failures[method];
    return Promise.resolve(failure ? { ok: false, error: failure } : { ok: true, value: body() });
  }

  listRoles() {
    return this.run("listRoles", () =>
      [...this.roles].map(([userId, { role, createdAt }]) => ({ userId, role, createdAt })),
    );
  }
  getRole(userId: string) {
    return this.run("getRole", () => this.roles.get(userId)?.role ?? null);
  }
  getAccount(userId: string) {
    return this.run("getAccount", () => this.accounts.get(userId) ?? null);
  }
  findAccountByEmail(email: string) {
    return this.run(
      "findAccountByEmail",
      () => [...this.accounts.values()].find((a) => a.email === email) ?? null,
    );
  }
  inviteUser(email: string) {
    return this.run("inviteUser", () => {
      const id = `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, "0")}`;
      this.addAccount(id, email, undefined, false);
      return { id };
    });
  }
  grantEmployeeRole(userId: string) {
    return this.run("grantEmployeeRole", () => {
      this.roles.set(userId, { role: "employee", createdAt: "2026-09-28T00:00:00Z" });
    });
  }
  revokeEmployeeRole(userId: string) {
    return this.run("revokeEmployeeRole", () => {
      if (this.roles.get(userId)?.role !== "employee") return false;
      this.roles.delete(userId);
      return true;
    });
  }
  deleteAccount(userId: string) {
    return this.run("deleteAccount", () => {
      this.accounts.delete(userId);
      this.roles.delete(userId); // ON DELETE CASCADE
    });
  }
}

let directory: FakeDirectory;
let opened: number;
const open = () => (opened++, directory);

beforeEach(() => {
  directory = new FakeDirectory();
  directory.addAccount(OWNER_ID, "owner@example.com", "owner");
  directory.addAccount(EMPLOYEE_ID, "employee@example.com", "employee");
  opened = 0;
});

describe("authorizeOwner", () => {
  it("allows only the owner role", () => {
    assert.deepEqual(authorizeOwner(owner), { ok: true, ownerId: OWNER_ID });
    for (const [name, access] of nonOwners) {
      assert.equal(authorizeOwner(access).ok, false, name);
    }
    assert.deepEqual(authorizeOwner({ status: "anonymous" }), {
      ok: false,
      error: EMPLOYEE_MESSAGES.signedOut,
    });
    assert.deepEqual(authorizeOwner(employee), { ok: false, error: EMPLOYEE_MESSAGES.notOwner });
  });
});

describe("callers other than the owner", () => {
  for (const [name, access] of nonOwners) {
    it(`${name}: cannot list, invite or remove, and never reach the privileged directory`, async () => {
      assert.equal((await listEmployees(access, open)).ok, false);
      assert.equal((await inviteEmployee(access, open, "new@example.com")).ok, false);
      assert.equal((await removeEmployee(access, open, EMPLOYEE_ID)).ok, false);
      // Also no way to target the owner or create an owner.
      assert.equal((await removeEmployee(access, open, OWNER_ID)).ok, false);
      assert.equal((await inviteEmployee(access, open, "owner@example.com")).ok, false);

      assert.equal(opened, 0, "directory must not be opened");
      assert.deepEqual(directory.calls, []);
      assert.equal(directory.roles.size, 2);
      assert.equal(directory.accounts.size, 2);
    });
  }
});

describe("listEmployees (owner)", () => {
  it("lists employees only, never the owner", async () => {
    directory.addAccount(ORPHAN_ID, "pending@example.com", "employee", false);
    const result = await listEmployees(owner, open);
    assert.ok(result.ok);
    assert.deepEqual(
      result.employees.map(({ id, email, status }) => ({ id, email, status })),
      [
        { id: EMPLOYEE_ID, email: "employee@example.com", status: "active" },
        { id: ORPHAN_ID, email: "pending@example.com", status: "invited" },
      ],
    );
  });

  it("returns only safe summary fields", async () => {
    const result = await listEmployees(owner, open);
    assert.ok(result.ok);
    assert.deepEqual(Object.keys(result.employees[0]).sort(), ["addedAt", "email", "id", "status"]);
  });

  it("fails safely when roles or accounts cannot be read", async () => {
    directory.failures.listRoles = { code: "42501" };
    assert.deepEqual(await listEmployees(owner, open), { ok: false, error: EMPLOYEE_MESSAGES.loadFailed });
    directory.failures = { getAccount: { status: 500 } };
    assert.deepEqual(await listEmployees(owner, open), { ok: false, error: EMPLOYEE_MESSAGES.loadFailed });
  });

  it("reports a missing secret key without details", async () => {
    const result = await listEmployees(owner, () => {
      throw new Error("Missing SUPABASE_SECRET_KEY");
    });
    assert.deepEqual(result, { ok: false, error: EMPLOYEE_MESSAGES.notConfigured });
  });
});

describe("inviteEmployee (owner)", () => {
  it("invites the normalized email and grants exactly the employee role", async () => {
    const result = await inviteEmployee(owner, open, "  New.Person@Example.COM ");
    assert.deepEqual(result, { ok: true, message: "Invitation sent to new.person@example.com." });
    assert.deepEqual(directory.calls, ["findAccountByEmail", "inviteUser", "grantEmployeeRole"]);

    const created = [...directory.accounts.values()].find((a) => a.email === "new.person@example.com");
    assert.ok(created);
    assert.equal(directory.roles.get(created.id)?.role, "employee");
    assert.equal([...directory.roles.values()].filter((r) => r.role === "owner").length, 1);
  });

  it("rejects invalid emails without touching the directory", async () => {
    for (const value of ["", "   ", "not-an-email", "a@b", "a b@example.com", null, 42, ["x@example.com"], `${"a".repeat(250)}@example.com`]) {
      assert.deepEqual(
        await inviteEmployee(owner, open, value),
        { ok: false, error: EMPLOYEE_MESSAGES.invalidEmail },
        String(value),
      );
    }
    assert.deepEqual(directory.calls, []);
  });

  it("cannot target the owner account or create a second owner", async () => {
    assert.deepEqual(await inviteEmployee(owner, open, "OWNER@example.com"), {
      ok: false,
      error: EMPLOYEE_MESSAGES.ownerEmail,
    });
    assert.ok(!directory.calls.includes("inviteUser"));
    assert.equal(directory.roles.get(OWNER_ID)?.role, "owner");
  });

  it("refuses duplicate employees", async () => {
    assert.deepEqual(await inviteEmployee(owner, open, "employee@example.com"), {
      ok: false,
      error: EMPLOYEE_MESSAGES.alreadyEmployee,
    });
    assert.ok(!directory.calls.includes("inviteUser"));
  });

  it("refuses existing Auth accounts without a role instead of granting them access", async () => {
    directory.addAccount(ORPHAN_ID, "orphan@example.com");
    assert.deepEqual(await inviteEmployee(owner, open, "orphan@example.com"), {
      ok: false,
      error: EMPLOYEE_MESSAGES.accountExists,
    });
    assert.equal(directory.roles.has(ORPHAN_ID), false);
  });

  it("a repeated submission does not create a second account", async () => {
    assert.equal((await inviteEmployee(owner, open, "new@example.com")).ok, true);
    assert.deepEqual(await inviteEmployee(owner, open, "new@example.com"), {
      ok: false,
      error: EMPLOYEE_MESSAGES.alreadyEmployee,
    });
    assert.equal([...directory.accounts.values()].filter((a) => a.email === "new@example.com").length, 1);
  });

  it("maps Auth Admin API failures to safe messages and grants nothing", async () => {
    const cases: [Failure, string][] = [
      [{ code: "email_exists", status: 422 }, EMPLOYEE_MESSAGES.accountExists],
      [{ code: "over_email_send_rate_limit", status: 429 }, EMPLOYEE_MESSAGES.inviteRateLimited],
      [{ code: "unexpected_failure", status: 500 }, EMPLOYEE_MESSAGES.inviteFailed],
      [{}, EMPLOYEE_MESSAGES.inviteFailed],
    ];
    for (const [failure, message] of cases) {
      directory.failures = { inviteUser: failure };
      assert.deepEqual(await inviteEmployee(owner, open, "new@example.com"), { ok: false, error: message });
    }
    assert.ok(!directory.calls.includes("grantEmployeeRole"));
  });

  it("fails closed when the existing-account check fails", async () => {
    directory.failures.findAccountByEmail = { status: 500 };
    assert.deepEqual(await inviteEmployee(owner, open, "new@example.com"), {
      ok: false,
      error: EMPLOYEE_MESSAGES.inviteFailed,
    });
    assert.ok(!directory.calls.includes("inviteUser"));
  });

  it("deletes the new Auth user when the role cannot be granted", async () => {
    directory.failures.grantEmployeeRole = { code: "23505" };
    assert.deepEqual(await inviteEmployee(owner, open, "new@example.com"), {
      ok: false,
      error: EMPLOYEE_MESSAGES.grantFailedCleanedUp,
    });
    assert.deepEqual(directory.calls.slice(-2), ["grantEmployeeRole", "deleteAccount"]);
    assert.ok(![...directory.accounts.values()].some((a) => a.email === "new@example.com"));
  });

  it("leaves a role-less account (no access) if the cleanup also fails", async () => {
    directory.failures = { grantEmployeeRole: { status: 500 }, deleteAccount: { status: 500 } };
    assert.deepEqual(await inviteEmployee(owner, open, "new@example.com"), {
      ok: false,
      error: EMPLOYEE_MESSAGES.grantFailedOrphan,
    });
    const orphan = [...directory.accounts.values()].find((a) => a.email === "new@example.com");
    assert.ok(orphan);
    assert.equal(directory.roles.has(orphan.id), false, "no role means no admin access");
  });
});

describe("removeEmployee (owner)", () => {
  it("revokes the role first, then deletes the Auth account", async () => {
    assert.deepEqual(await removeEmployee(owner, open, EMPLOYEE_ID), {
      ok: true,
      message: "Employee access removed and their account deleted.",
    });
    assert.deepEqual(directory.calls, ["getRole", "revokeEmployeeRole", "deleteAccount"]);
    assert.equal(directory.roles.has(EMPLOYEE_ID), false);
    assert.equal(directory.accounts.has(EMPLOYEE_ID), false);
  });

  it("cannot remove the owner (self), in any spelling of the id", async () => {
    for (const id of [OWNER_ID, OWNER_ID.toUpperCase()]) {
      assert.deepEqual(await removeEmployee(owner, open, id), {
        ok: false,
        error: EMPLOYEE_MESSAGES.cannotRemoveSelf,
      });
    }
    assert.deepEqual(directory.calls, []);
    assert.equal(directory.roles.get(OWNER_ID)?.role, "owner");
  });

  it("refuses an owner row even when it is not the caller's", async () => {
    const otherOwner: ManagementAccess = { status: "staff", user: { id: ORPHAN_ID, role: "owner" } };
    assert.deepEqual(await removeEmployee(otherOwner, open, OWNER_ID), {
      ok: false,
      error: EMPLOYEE_MESSAGES.cannotRemoveOwner,
    });
    assert.ok(!directory.calls.includes("revokeEmployeeRole"));
    assert.ok(!directory.calls.includes("deleteAccount"));
  });

  it("rejects missing or malformed ids", async () => {
    for (const value of [null, "", "abc", "1; drop table user_roles", `${EMPLOYEE_ID} `, 7]) {
      assert.deepEqual(
        await removeEmployee(owner, open, value),
        { ok: false, error: EMPLOYEE_MESSAGES.invalidEmployee },
        String(value),
      );
    }
    assert.deepEqual(directory.calls, []);
  });

  it("does not delete accounts that are not employees", async () => {
    directory.addAccount(ORPHAN_ID, "orphan@example.com");
    assert.deepEqual(await removeEmployee(owner, open, ORPHAN_ID), {
      ok: false,
      error: EMPLOYEE_MESSAGES.notEmployee,
    });
    assert.ok(directory.accounts.has(ORPHAN_ID));
  });

  it("does not delete the account if no employee row was actually revoked", async () => {
    directory.revokeEmployeeRole = async () => ({ ok: true, value: false });
    assert.deepEqual(await removeEmployee(owner, open, EMPLOYEE_ID), {
      ok: false,
      error: EMPLOYEE_MESSAGES.notEmployee,
    });
    assert.ok(!directory.calls.includes("deleteAccount"));
  });

  it("keeps the account untouched when the role cannot be revoked", async () => {
    directory.failures.revokeEmployeeRole = { status: 500 };
    assert.deepEqual(await removeEmployee(owner, open, EMPLOYEE_ID), {
      ok: false,
      error: EMPLOYEE_MESSAGES.removeFailed,
    });
    assert.ok(!directory.calls.includes("deleteAccount"));
  });

  it("reports access removed even if the Auth account cannot be deleted", async () => {
    directory.failures.deleteAccount = { status: 500 };
    assert.deepEqual(await removeEmployee(owner, open, EMPLOYEE_ID), {
      ok: true,
      message: EMPLOYEE_MESSAGES.removedAccountKept,
    });
    assert.equal(directory.roles.has(EMPLOYEE_ID), false, "role is gone, so no admin access");
  });

  it("treats an already-deleted Auth account as removed", async () => {
    directory.failures.deleteAccount = { code: "user_not_found", status: 404 };
    assert.equal((await removeEmployee(owner, open, EMPLOYEE_ID)).ok, true);
  });
});

describe("input parsing", () => {
  it("normalizes emails", () => {
    assert.equal(normalizeEmail(" A@Example.com "), "a@example.com");
    assert.equal(normalizeEmail("x"), null);
  });

  it("accepts only UUIDs as user ids", () => {
    assert.equal(parseUserId(EMPLOYEE_ID.toUpperCase()), EMPLOYEE_ID);
    assert.equal(parseUserId("not-a-uuid"), null);
  });
});

// Stand-in for the Supabase admin client parts the adapter uses.
function fakeAdminClient(results: Record<string, { data: unknown; error: unknown }>) {
  const calls: unknown[][] = [];
  const builder = (table: string) => {
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    for (const name of ["select", "insert", "delete", "eq", "order"]) {
      chain[name] = (...args) => (calls.push([table, name, ...args]), chain);
    }
    chain.maybeSingle = async () => results.maybeSingle;
    chain.then = (resolve: unknown) =>
      Promise.resolve(results.query).then(resolve as (v: unknown) => unknown);
    return chain;
  };
  const admin = Object.fromEntries(
    ["getUserById", "listUsers", "inviteUserByEmail", "deleteUser"].map((name) => [
      name,
      async (...args: unknown[]) => (calls.push(["auth", name, ...args]), results[name]),
    ]),
  );
  const client = { from: builder, auth: { admin } };
  return {
    client: client as unknown as Parameters<typeof createSupabaseStaffDirectory>[0],
    calls,
  };
}

describe("createSupabaseStaffDirectory", () => {
  it("grants only the employee role", async () => {
    const { client, calls } = fakeAdminClient({ query: { data: null, error: null } });
    await createSupabaseStaffDirectory(client).grantEmployeeRole(EMPLOYEE_ID);
    assert.deepEqual(calls, [["user_roles", "insert", { user_id: EMPLOYEE_ID, role: "employee" }]]);
  });

  it("revokes only rows whose role is employee", async () => {
    const { client, calls } = fakeAdminClient({ query: { data: [{ user_id: EMPLOYEE_ID }], error: null } });
    const result = await createSupabaseStaffDirectory(client).revokeEmployeeRole(EMPLOYEE_ID);
    assert.deepEqual(result, { ok: true, value: true });
    assert.deepEqual(calls, [
      ["user_roles", "delete"],
      ["user_roles", "eq", "user_id", EMPLOYEE_ID],
      ["user_roles", "eq", "role", "employee"],
      ["user_roles", "select", "user_id"],
    ]);
  });

  it("keeps only the error code/status, never messages or details", async () => {
    const { client } = fakeAdminClient({
      query: { data: null, error: { code: "42501", message: "permission denied for table user_roles", details: "secret" } },
    });
    const result = await createSupabaseStaffDirectory(client).grantEmployeeRole(EMPLOYEE_ID);
    assert.deepEqual(result, { ok: false, error: { code: "42501", status: undefined } });
  });

  it("maps Auth users to summary fields only", async () => {
    const { client } = fakeAdminClient({
      getUserById: {
        data: {
          user: {
            id: EMPLOYEE_ID,
            email: "employee@example.com",
            created_at: "c",
            email_confirmed_at: "e",
            user_metadata: { secret: 1 },
            app_metadata: { provider: "email" },
            identities: [],
          },
        },
        error: null,
      },
    });
    const result = await createSupabaseStaffDirectory(client).getAccount(EMPLOYEE_ID);
    assert.deepEqual(result, {
      ok: true,
      value: {
        id: EMPLOYEE_ID,
        email: "employee@example.com",
        createdAt: "c",
        invitedAt: null,
        emailConfirmedAt: "e",
        lastSignInAt: null,
      },
    });
  });

  it("finds accounts by email case-insensitively", async () => {
    const { client } = fakeAdminClient({
      listUsers: { data: { users: [{ id: EMPLOYEE_ID, email: "Employee@Example.com", created_at: "c" }] }, error: null },
    });
    const result = await createSupabaseStaffDirectory(client).findAccountByEmail("employee@example.com");
    assert.ok(result.ok && result.value?.id === EMPLOYEE_ID);
  });

  it("sends invitations without a client-chosen redirect", async () => {
    const { client, calls } = fakeAdminClient({
      inviteUserByEmail: { data: { user: { id: EMPLOYEE_ID } }, error: null },
    });
    const result = await createSupabaseStaffDirectory(client).inviteUser("new@example.com");
    assert.deepEqual(result, { ok: true, value: { id: EMPLOYEE_ID } });
    assert.deepEqual(calls, [["auth", "inviteUserByEmail", "new@example.com"]]);
  });
});
