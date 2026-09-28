// Rules for accepting an Employee invitation at /admin/accept-invite.
//
// The invitation email links to /admin/accept-invite?token_hash=... (README, "Employee
// invitations"). Opening the link does not use the token; it is verified only when the
// Employee submits their new password, so email link scanners cannot consume it.
//
// Kept free of Next.js and "@/" imports so it runs under `npm test`.

import type { StaffRoleLookup } from "./roles";

// Supabase Auth hashes passwords with bcrypt, which only uses the first 72 bytes.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

export const INVITE_MESSAGES = {
  invalidLink:
    "This invitation link is invalid, expired or already used. Ask the owner for a new invitation.",
  noAccess:
    "This invitation is no longer valid for the admin area. Contact the owner.",
  passwordSaved:
    "Your password was saved, but we could not verify your access right now. Sign in to continue.",
  passwordNotSaved:
    "Your invitation was accepted but your password could not be saved, and the link " +
    "cannot be used again. Ask the owner to remove and re-invite you.",
  passwordsDiffer: "The passwords do not match.",
  passwordTooShort: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  passwordTooLong: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
} as const;

/** The token hash from the invitation link, or null if it is missing or malformed. */
export function parseTokenHash(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,256}$/.test(value) ? value : null;
}

/** Returns an error message, or null when the new password is acceptable. */
export function newPasswordError(password: unknown, confirmation: unknown): string | null {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return INVITE_MESSAGES.passwordTooShort;
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_LENGTH) {
    return INVITE_MESSAGES.passwordTooLong;
  }
  if (password !== confirmation) {
    return INVITE_MESSAGES.passwordsDiffer;
  }
  return null;
}

/** Session operations of the request's user-scoped Supabase client (publishable key). */
export type InviteSession = {
  /** verifyOtp({ type: "invite", token_hash }); starts a session. Null when rejected. */
  verifyInvite(tokenHash: string): Promise<{ userId: string } | null>;
  lookupRole(userId: string): Promise<StaffRoleLookup>;
  /** updateUser({ password }) for the session's user. */
  setPassword(password: string): Promise<boolean>;
  signOut(): Promise<void>;
};

export type AcceptInviteResult = { ok: true } | { ok: false; error: string };

/**
 * Verifies the invitation token, sets the invited user's password, and checks they still
 * have a staff role. The password is validated before the single-use token is spent. Any
 * failure after verification signs the new session out, so a half-finished acceptance
 * never leaves a session behind.
 */
export async function acceptInvitation(
  session: InviteSession,
  input: { tokenHash: unknown; password: unknown; confirmation: unknown },
): Promise<AcceptInviteResult> {
  const tokenHash = parseTokenHash(input.tokenHash);
  if (!tokenHash) {
    return { ok: false, error: INVITE_MESSAGES.invalidLink };
  }

  const passwordError = newPasswordError(input.password, input.confirmation);
  if (passwordError) {
    return { ok: false, error: passwordError };
  }
  const password = input.password as string;

  const verified = await session.verifyInvite(tokenHash);
  if (!verified) {
    return { ok: false, error: INVITE_MESSAGES.invalidLink };
  }

  // Set the password before the role check: a password alone grants nothing (sign-in and
  // every admin request still require a role), and this way a transient role-lookup error
  // does not strand the Employee with a spent link.
  if (!(await session.setPassword(password))) {
    await session.signOut();
    return { ok: false, error: INVITE_MESSAGES.passwordNotSaved };
  }

  // Access may have been revoked after the invitation was sent.
  const lookup = await session.lookupRole(verified.userId);
  if (lookup.status !== "staff") {
    await session.signOut();
    return {
      ok: false,
      error: lookup.status === "error" ? INVITE_MESSAGES.passwordSaved : INVITE_MESSAGES.noAccess,
    };
  }

  return { ok: true };
}
