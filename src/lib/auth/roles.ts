// Admin authorization rules shared by the proxy, Server Components and Server Functions.
//
// Signing in with Supabase Auth only proves identity. Admin access additionally requires a
// user_roles row with an owner/employee role (PROJECT.md section 5). The row is read with the
// user's own session: the user_roles_select_own RLS policy lets a user read only their own
// row, so no privileged key is involved.
//
// Kept free of Next.js and "@/" imports so it runs in the proxy and under `npm test`.

import type { SupabaseClient } from "@supabase/supabase-js";

export const ADMIN_HOME_PATH = "/admin";
export const ADMIN_LOGIN_PATH = "/admin/login";

export const STAFF_ROLES = ["owner", "employee"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export function parseStaffRole(value: unknown): StaffRole | null {
  return STAFF_ROLES.find((role) => role === value) ?? null;
}

/** Every /admin route except the login page requires an Owner or Employee. */
export function isProtectedAdminPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === ADMIN_LOGIN_PATH) {
    return false;
  }
  return path === ADMIN_HOME_PATH || path.startsWith(`${ADMIN_HOME_PATH}/`);
}

export type StaffRoleLookup =
  | { status: "staff"; role: StaffRole }
  // Authenticated, but no owner/employee row: not allowed into the admin area.
  | { status: "none" }
  // The role could not be read (network/database error). Fails closed.
  | { status: "error" };

export async function lookupStaffRole(
  supabase: Pick<SupabaseClient, "from">,
  userId: string,
): Promise<StaffRoleLookup> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { status: "error" };
  }

  const role = parseStaffRole(data?.role);
  return role ? { status: "staff", role } : { status: "none" };
}

// Reasons the login page may be shown with (?error=...). Only these fixed codes are
// rendered, so the query string cannot inject arbitrary text into the page.
export const ADMIN_LOGIN_NOTICES = {
  unauthorized: "This account does not have access to the admin area.",
  unavailable: "We could not verify your access right now. Please try again.",
} as const;

export type AdminLoginNotice = keyof typeof ADMIN_LOGIN_NOTICES;

export function adminLoginNotice(code: unknown): string | null {
  return typeof code === "string" && Object.hasOwn(ADMIN_LOGIN_NOTICES, code)
    ? ADMIN_LOGIN_NOTICES[code as AdminLoginNotice]
    : null;
}

export function adminLoginUrlPath(notice?: AdminLoginNotice): string {
  return notice ? `${ADMIN_LOGIN_PATH}?error=${notice}` : ADMIN_LOGIN_PATH;
}

/**
 * Maps a Supabase sign-in error to a message that is safe to show. It never says whether
 * the email exists, and never echoes the raw error.
 */
export function signInErrorMessage(error: { code?: string; status?: number }): string {
  if (error.code === "over_request_rate_limit" || error.status === 429) {
    return "Too many sign-in attempts. Please wait a moment and try again.";
  }
  if (
    error.code === "invalid_credentials" ||
    error.code === "email_not_confirmed" ||
    error.code === "user_banned" ||
    error.status === 400
  ) {
    return "Invalid email or password.";
  }
  return "Sign-in failed. Please try again.";
}
