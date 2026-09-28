// Unit tests for the admin authorization rules. Run with `npm test` (Node's built-in test
// runner; needs Node 22.18+ for TypeScript type stripping).

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  adminLoginNotice,
  adminLoginUrlPath,
  isProtectedAdminPath,
  lookupStaffRole,
  parseStaffRole,
  signInErrorMessage,
} from "../src/lib/auth/roles.ts";

describe("parseStaffRole", () => {
  it("accepts only owner and employee", () => {
    assert.equal(parseStaffRole("owner"), "owner");
    assert.equal(parseStaffRole("employee"), "employee");
    for (const value of ["Owner", "admin", "authenticated", "service_role", "", null, undefined, 1, {}]) {
      assert.equal(parseStaffRole(value), null, `rejects ${String(value)}`);
    }
  });
});

describe("isProtectedAdminPath", () => {
  it("protects /admin and every child route", () => {
    for (const path of [
      "/admin",
      "/admin/",
      "/admin/products",
      "/admin/products/new",
      "/admin/products/123/edit",
      "/admin/events",
      "/admin/events/new",
      "/admin/events/123/edit",
      "/admin/employees",
      "/admin/login/extra",
      "/admin/loginx",
      "/admin/accept-invite/extra",
      "/admin/accept-invitex",
    ]) {
      assert.equal(isProtectedAdminPath(path), true, path);
    }
  });

  it("leaves the login page and non-admin routes public", () => {
    for (const path of [
      "/admin/login",
      "/admin/login/",
      "/admin/accept-invite",
      "/admin/accept-invite/",
      "/",
      "/products",
      "/administrator",
      "/adminx",
    ]) {
      assert.equal(isProtectedAdminPath(path), false, path);
    }
  });
});

// Minimal stand-in for the part of the Supabase query builder lookupStaffRole uses.
function fakeSupabase(result: { data: unknown; error: unknown }) {
  const calls: unknown[][] = [];
  const builder = {
    select: (...args: unknown[]) => (calls.push(["select", ...args]), builder),
    eq: (...args: unknown[]) => (calls.push(["eq", ...args]), builder),
    maybeSingle: async () => result,
  };
  const client = {
    from: (table: string) => (calls.push(["from", table]), builder),
  };
  return { client: client as unknown as Parameters<typeof lookupStaffRole>[0], calls };
}

describe("lookupStaffRole", () => {
  it("queries only the given user's user_roles row", async () => {
    const { client, calls } = fakeSupabase({ data: { role: "owner" }, error: null });
    await lookupStaffRole(client, "user-1");
    assert.deepEqual(calls, [
      ["from", "user_roles"],
      ["select", "role"],
      ["eq", "user_id", "user-1"],
    ]);
  });

  it("returns the role for owners and employees", async () => {
    for (const role of ["owner", "employee"]) {
      const { client } = fakeSupabase({ data: { role }, error: null });
      assert.deepEqual(await lookupStaffRole(client, "u"), { status: "staff", role });
    }
  });

  it("denies authenticated users without a staff role", async () => {
    for (const data of [null, { role: null }, { role: "admin" }, {}]) {
      const { client } = fakeSupabase({ data, error: null });
      assert.deepEqual(await lookupStaffRole(client, "u"), { status: "none" }, JSON.stringify(data));
    }
  });

  it("fails closed when the role cannot be read", async () => {
    const { client } = fakeSupabase({ data: { role: "owner" }, error: { message: "boom" } });
    assert.deepEqual(await lookupStaffRole(client, "u"), { status: "error" });
  });
});

describe("login notices", () => {
  it("renders only known codes", () => {
    assert.match(adminLoginNotice("unauthorized") ?? "", /does not have access/);
    assert.match(adminLoginNotice("unavailable") ?? "", /could not verify/);
    for (const code of [undefined, "", "<script>", "toString", "__proto__", ["unauthorized"]]) {
      assert.equal(adminLoginNotice(code), null, String(code));
    }
  });

  it("builds login URLs", () => {
    assert.equal(adminLoginUrlPath(), "/admin/login");
    assert.equal(adminLoginUrlPath("unauthorized"), "/admin/login?error=unauthorized");
  });
});

describe("signInErrorMessage", () => {
  it("does not reveal whether the account exists", () => {
    const generic = "Invalid email or password.";
    assert.equal(signInErrorMessage({ code: "invalid_credentials", status: 400 }), generic);
    assert.equal(signInErrorMessage({ code: "email_not_confirmed", status: 400 }), generic);
    assert.equal(signInErrorMessage({ code: "user_banned", status: 403 }), generic);
  });

  it("reports rate limiting and unexpected failures without raw details", () => {
    assert.match(signInErrorMessage({ code: "over_request_rate_limit", status: 429 }), /Too many/);
    assert.equal(signInErrorMessage({ status: 500 }), "Sign-in failed. Please try again.");
    assert.equal(signInErrorMessage({}), "Sign-in failed. Please try again.");
  });
});
