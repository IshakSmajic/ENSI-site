import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { adminLoginUrlPath, lookupStaffRole, type StaffRole } from "./roles";

export type StaffUser = { id: string; email: string | null; role: StaffRole };

export type AdminAccess =
  | { status: "anonymous" }
  | { status: "unauthorized" }
  | { status: "unavailable" }
  | { status: "staff"; user: StaffUser };

/**
 * Resolves the current request's admin access from the verified session (getClaims checks
 * the JWT) and the user's own user_roles row. Memoized per request.
 */
export const getAdminAccess = cache(async (): Promise<AdminAccess> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) {
    return { status: "anonymous" };
  }

  const lookup = await lookupStaffRole(supabase, claims.sub);
  if (lookup.status === "error") {
    return { status: "unavailable" };
  }
  if (lookup.status === "none") {
    return { status: "unauthorized" };
  }

  return {
    status: "staff",
    user: {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : null,
      role: lookup.role,
    },
  };
});

/**
 * Returns the signed-in Owner/Employee or redirects to the login page. Call it in every
 * protected admin page, layout and Server Function that reads or changes admin data; the
 * proxy (src/proxy.ts) also guards /admin/*, but this check stays next to the data.
 */
export async function requireStaff(): Promise<StaffUser> {
  const access = await getAdminAccess();

  switch (access.status) {
    case "staff":
      return access.user;
    case "anonymous":
      redirect(adminLoginUrlPath());
    case "unauthorized":
      redirect(adminLoginUrlPath("unauthorized"));
    case "unavailable":
      redirect(adminLoginUrlPath("unavailable"));
  }
}
