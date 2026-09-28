// Owner employee management: list, invite and remove Employees (PROJECT.md section 5).
//
// Every operation takes the caller's resolved admin access and checks for the Owner role
// itself before touching the privileged StaffDirectory, so a Server Function cannot forget
// the check. Only the `employee` role is ever granted or revoked here: there is no generic
// role editor, and the Owner row cannot be created, changed or removed through this module.
//
// Messages returned to the browser are fixed strings; raw Supabase/PostgreSQL errors are
// never passed through.
//
// Kept free of Next.js and "@/" imports so it runs under `npm test`.

import type { StaffRole } from "../auth/roles";

/** Structural subset of AdminAccess (src/lib/auth/staff.ts). */
export type ManagementAccess =
  | { status: "anonymous" | "unauthorized" | "unavailable" }
  | { status: "staff"; user: { id: string; role: StaffRole } };

/** Supabase error details kept for decisions; never shown to the user. */
export type DirectoryError = { code?: string; status?: number };

export type DirectoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: DirectoryError };

export type RoleRecord = { userId: string; role: StaffRole; createdAt: string };

export type AuthAccount = {
  id: string;
  email: string | null;
  createdAt: string;
  invitedAt: string | null;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
};

/**
 * Privileged operations used by employee management (Auth Admin API + user_roles with the
 * secret key). Implemented in ./supabase-directory.ts.
 */
export interface StaffDirectory {
  listRoles(): Promise<DirectoryResult<RoleRecord[]>>;
  getRole(userId: string): Promise<DirectoryResult<StaffRole | null>>;
  getAccount(userId: string): Promise<DirectoryResult<AuthAccount | null>>;
  findAccountByEmail(email: string): Promise<DirectoryResult<AuthAccount | null>>;
  /** Creates the Auth user and sends the Supabase invitation email. */
  inviteUser(email: string): Promise<DirectoryResult<{ id: string }>>;
  /** Inserts a user_roles row with role 'employee' (never anything else). */
  grantEmployeeRole(userId: string): Promise<DirectoryResult<void>>;
  /** Deletes the user's row only if its role is 'employee'. Returns whether a row was deleted. */
  revokeEmployeeRole(userId: string): Promise<DirectoryResult<boolean>>;
  /** Deletes the Auth user and, through it, its sessions and refresh tokens. */
  deleteAccount(userId: string): Promise<DirectoryResult<void>>;
}

export type EmployeeStatus = "invited" | "active";

export type EmployeeSummary = {
  id: string;
  email: string | null;
  status: EmployeeStatus;
  addedAt: string;
};

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export const EMPLOYEE_MESSAGES = {
  signedOut: "Your session has expired. Sign in again.",
  notOwner: "Only the owner can manage employees.",
  unavailable: "We could not verify your access right now. Please try again.",
  notConfigured: "Employee management is not configured on the server.",
  loadFailed: "Could not load employees. Please try again.",
  invalidEmail: "Enter a valid email address.",
  ownerEmail: "This email belongs to the owner account.",
  alreadyEmployee: "This person is already an employee.",
  accountExists:
    "An account with this email already exists but has no staff access. " +
    "Resolve it in the Supabase Dashboard before inviting this email.",
  inviteRateLimited: "Too many invitation emails were sent recently. Try again later.",
  inviteFailed: "Could not send the invitation. No account was created. Please try again.",
  grantFailedCleanedUp:
    "Could not grant employee access, so the invitation was cancelled. Please try again.",
  grantFailedOrphan:
    "Could not grant employee access. An account was created without any access; " +
    "the invitation cannot be used to reach the admin area. Contact the site administrator.",
  invalidEmployee: "Select a valid employee.",
  cannotRemoveSelf: "You cannot remove your own account.",
  cannotRemoveOwner: "The owner account cannot be removed.",
  notEmployee: "This account is not an employee (it may already have been removed).",
  removeFailed: "Could not remove employee access. Please try again.",
  removedAccountKept:
    "Access removed: they can no longer use the admin area. Their sign-in account could " +
    "not be deleted; remove it in the Supabase Dashboard.",
} as const;

type OwnerCheck = { ok: true; ownerId: string } | { ok: false; error: string };

/** The only gate for employee management: the caller must hold the owner role. */
export function authorizeOwner(access: ManagementAccess): OwnerCheck {
  switch (access.status) {
    case "staff":
      return access.user.role === "owner"
        ? { ok: true, ownerId: access.user.id }
        : { ok: false, error: EMPLOYEE_MESSAGES.notOwner };
    case "anonymous":
      return { ok: false, error: EMPLOYEE_MESSAGES.signedOut };
    case "unauthorized":
      return { ok: false, error: EMPLOYEE_MESSAGES.notOwner };
    case "unavailable":
      return { ok: false, error: EMPLOYEE_MESSAGES.unavailable };
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Trimmed, lower-cased email, or null if it is not a plausible address. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

export function parseUserId(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

// The directory is opened only after the Owner check, so a missing secret key never
// changes what an unauthorized caller sees.
function openDirectory(
  openStaffDirectory: () => StaffDirectory,
): { ok: true; directory: StaffDirectory } | { ok: false; error: string } {
  try {
    return { ok: true, directory: openStaffDirectory() };
  } catch {
    return { ok: false, error: EMPLOYEE_MESSAGES.notConfigured };
  }
}

export async function listEmployees(
  access: ManagementAccess,
  openStaffDirectory: () => StaffDirectory,
): Promise<{ ok: true; employees: EmployeeSummary[] } | { ok: false; error: string }> {
  const owner = authorizeOwner(access);
  if (!owner.ok) {
    return owner;
  }
  const opened = openDirectory(openStaffDirectory);
  if (!opened.ok) {
    return opened;
  }
  const { directory } = opened;

  const roles = await directory.listRoles();
  if (!roles.ok) {
    return { ok: false, error: EMPLOYEE_MESSAGES.loadFailed };
  }

  // Only employee rows: the Owner never appears in (or can be removed from) this list.
  const employeeRoles = roles.value.filter((record) => record.role === "employee");
  const accounts = await Promise.all(
    employeeRoles.map((record) => directory.getAccount(record.userId)),
  );

  const employees: EmployeeSummary[] = [];
  for (const [index, record] of employeeRoles.entries()) {
    const account = accounts[index];
    if (!account.ok) {
      return { ok: false, error: EMPLOYEE_MESSAGES.loadFailed };
    }
    employees.push({
      id: record.userId,
      email: account.value?.email ?? null,
      status: account.value?.emailConfirmedAt ? "active" : "invited",
      addedAt: record.createdAt,
    });
  }
  return { ok: true, employees };
}

/**
 * Invites a new Employee: creates the Auth user through Supabase's invitation (Supabase
 * sends the email; the Employee sets their own password at /admin/accept-invite), then
 * grants the employee role. If the role cannot be granted, the new Auth user is deleted
 * again, which also invalidates the emailed link. An Auth user without a role never has
 * admin access, so every failure path fails closed.
 */
export async function inviteEmployee(
  access: ManagementAccess,
  openStaffDirectory: () => StaffDirectory,
  rawEmail: unknown,
): Promise<ActionResult> {
  const owner = authorizeOwner(access);
  if (!owner.ok) {
    return owner;
  }

  const email = normalizeEmail(rawEmail);
  if (!email) {
    return { ok: false, error: EMPLOYEE_MESSAGES.invalidEmail };
  }

  const opened = openDirectory(openStaffDirectory);
  if (!opened.ok) {
    return opened;
  }
  const { directory } = opened;

  // Refuse existing accounts up front: inviting must never attach the employee role to an
  // account someone else created, and must never touch the Owner.
  const existing = await directory.findAccountByEmail(email);
  if (!existing.ok) {
    return { ok: false, error: EMPLOYEE_MESSAGES.inviteFailed };
  }
  if (existing.value) {
    const role = await directory.getRole(existing.value.id);
    if (!role.ok) {
      return { ok: false, error: EMPLOYEE_MESSAGES.inviteFailed };
    }
    if (role.value === "owner") {
      return { ok: false, error: EMPLOYEE_MESSAGES.ownerEmail };
    }
    if (role.value === "employee") {
      return { ok: false, error: EMPLOYEE_MESSAGES.alreadyEmployee };
    }
    return { ok: false, error: EMPLOYEE_MESSAGES.accountExists };
  }

  const invited = await directory.inviteUser(email);
  if (!invited.ok) {
    const { code, status } = invited.error;
    if (code === "email_exists" || code === "user_already_exists" || status === 422) {
      // Created concurrently (e.g. a double submission that got here first).
      return { ok: false, error: EMPLOYEE_MESSAGES.accountExists };
    }
    if (code === "over_email_send_rate_limit" || status === 429) {
      return { ok: false, error: EMPLOYEE_MESSAGES.inviteRateLimited };
    }
    return { ok: false, error: EMPLOYEE_MESSAGES.inviteFailed };
  }

  const granted = await directory.grantEmployeeRole(invited.value.id);
  if (!granted.ok) {
    // Compensate: remove the Auth user so no half-created account (or usable invitation
    // link) remains. If that fails too, the account exists without a role and therefore
    // without access.
    const cleanup = await directory.deleteAccount(invited.value.id);
    return {
      ok: false,
      error: cleanup.ok
        ? EMPLOYEE_MESSAGES.grantFailedCleanedUp
        : EMPLOYEE_MESSAGES.grantFailedOrphan,
    };
  }

  return { ok: true, message: `Invitation sent to ${email}.` };
}

/**
 * Removes an Employee: deletes the employee role first (access ends on the Employee's next
 * request, since every admin request re-reads the role), then deletes the Auth user, which
 * revokes all of their sessions/refresh tokens and frees the email for a later re-invite.
 */
export async function removeEmployee(
  access: ManagementAccess,
  openStaffDirectory: () => StaffDirectory,
  rawUserId: unknown,
): Promise<ActionResult> {
  const owner = authorizeOwner(access);
  if (!owner.ok) {
    return owner;
  }

  const userId = parseUserId(rawUserId);
  if (!userId) {
    return { ok: false, error: EMPLOYEE_MESSAGES.invalidEmployee };
  }
  if (userId === owner.ownerId.toLowerCase()) {
    return { ok: false, error: EMPLOYEE_MESSAGES.cannotRemoveSelf };
  }

  const opened = openDirectory(openStaffDirectory);
  if (!opened.ok) {
    return opened;
  }
  const { directory } = opened;

  // The browser only names a user; what that user is gets re-read here.
  const role = await directory.getRole(userId);
  if (!role.ok) {
    return { ok: false, error: EMPLOYEE_MESSAGES.removeFailed };
  }
  if (role.value === "owner") {
    return { ok: false, error: EMPLOYEE_MESSAGES.cannotRemoveOwner };
  }
  if (role.value !== "employee") {
    return { ok: false, error: EMPLOYEE_MESSAGES.notEmployee };
  }

  // Filtered on role = 'employee' in the database too, so this can never delete the owner
  // row even if roles changed since the check above.
  const revoked = await directory.revokeEmployeeRole(userId);
  if (!revoked.ok) {
    return { ok: false, error: EMPLOYEE_MESSAGES.removeFailed };
  }
  if (!revoked.value) {
    // Nothing was revoked, so do not delete the account either.
    return { ok: false, error: EMPLOYEE_MESSAGES.notEmployee };
  }

  const account = await directory.deleteAccount(userId);
  if (!account.ok && account.error.code !== "user_not_found") {
    return { ok: true, message: EMPLOYEE_MESSAGES.removedAccountKept };
  }

  return { ok: true, message: "Employee access removed and their account deleted." };
}
