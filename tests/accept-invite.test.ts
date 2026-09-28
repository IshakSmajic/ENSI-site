// Unit tests for accepting an Employee invitation (src/lib/auth/invite.ts). Run with
// `npm test`. The Supabase session is faked; no network and no real accounts.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  INVITE_MESSAGES,
  acceptInvitation,
  newPasswordError,
  parseTokenHash,
  type InviteSession,
} from "../src/lib/auth/invite.ts";
import type { StaffRoleLookup } from "../src/lib/auth/roles.ts";

const TOKEN = "a".repeat(56);
const PASSWORD = "correct horse battery";

function fakeSession(options: {
  verify?: { userId: string } | null;
  role?: StaffRoleLookup;
  passwordSaved?: boolean;
}) {
  const calls: string[] = [];
  const session: InviteSession = {
    async verifyInvite(tokenHash) {
      calls.push(`verify:${tokenHash}`);
      return options.verify === undefined ? { userId: "u1" } : options.verify;
    },
    async lookupRole(userId) {
      calls.push(`role:${userId}`);
      return options.role ?? { status: "staff", role: "employee" };
    },
    async setPassword() {
      calls.push("setPassword");
      return options.passwordSaved ?? true;
    },
    async signOut() {
      calls.push("signOut");
    },
  };
  return { session, calls };
}

const input = { tokenHash: TOKEN, password: PASSWORD, confirmation: PASSWORD };

describe("acceptInvitation", () => {
  it("verifies the token, sets the password and keeps the Employee signed in", async () => {
    const { session, calls } = fakeSession({});
    assert.deepEqual(await acceptInvitation(session, input), { ok: true });
    assert.deepEqual(calls, [`verify:${TOKEN}`, "setPassword", "role:u1"]);
  });

  it("does not spend the token when the input is invalid", async () => {
    const cases: [typeof input, string][] = [
      [{ ...input, tokenHash: "" }, INVITE_MESSAGES.invalidLink],
      [{ ...input, tokenHash: "bad token!" }, INVITE_MESSAGES.invalidLink],
      [{ ...input, confirmation: "different password" }, INVITE_MESSAGES.passwordsDiffer],
      [{ ...input, password: "short", confirmation: "short" }, INVITE_MESSAGES.passwordTooShort],
    ];
    for (const [value, message] of cases) {
      const { session, calls } = fakeSession({});
      assert.deepEqual(await acceptInvitation(session, value), { ok: false, error: message });
      assert.deepEqual(calls, []);
    }
  });

  it("rejects invalid, expired or used tokens", async () => {
    const { session, calls } = fakeSession({ verify: null });
    assert.deepEqual(await acceptInvitation(session, input), {
      ok: false,
      error: INVITE_MESSAGES.invalidLink,
    });
    assert.ok(!calls.includes("setPassword"));
  });

  it("signs out an invited user whose access was revoked", async () => {
    const { session, calls } = fakeSession({ role: { status: "none" } });
    assert.deepEqual(await acceptInvitation(session, input), {
      ok: false,
      error: INVITE_MESSAGES.noAccess,
    });
    assert.equal(calls.at(-1), "signOut");
  });

  it("signs out when the role cannot be verified (fails closed)", async () => {
    const { session, calls } = fakeSession({ role: { status: "error" } });
    assert.deepEqual(await acceptInvitation(session, input), {
      ok: false,
      error: INVITE_MESSAGES.passwordSaved,
    });
    assert.equal(calls.at(-1), "signOut");
  });

  it("signs out when the password cannot be saved", async () => {
    const { session, calls } = fakeSession({ passwordSaved: false });
    assert.deepEqual(await acceptInvitation(session, input), {
      ok: false,
      error: INVITE_MESSAGES.passwordNotSaved,
    });
    assert.deepEqual(calls.slice(-2), ["setPassword", "signOut"]);
  });
});

describe("password and token rules", () => {
  it("enforces length (bytes, for bcrypt) and confirmation", () => {
    assert.equal(newPasswordError("12345678", "12345678"), null);
    assert.equal(newPasswordError("1234567", "1234567"), INVITE_MESSAGES.passwordTooShort);
    assert.equal(newPasswordError("a".repeat(72), "a".repeat(72)), null);
    assert.equal(newPasswordError("é".repeat(40), "é".repeat(40)), INVITE_MESSAGES.passwordTooLong);
    assert.equal(newPasswordError(null, null), INVITE_MESSAGES.passwordTooShort);
  });

  it("accepts only token-hash-shaped values", () => {
    assert.equal(parseTokenHash(TOKEN), TOKEN);
    for (const value of [undefined, "", "short", "<script>", ["x".repeat(20)], "a".repeat(300)]) {
      assert.equal(parseTokenHash(value), null, String(value));
    }
  });
});
