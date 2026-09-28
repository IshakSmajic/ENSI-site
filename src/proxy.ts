import type { NextRequest } from "next/server";

import {
  adminLoginUrlPath,
  isProtectedAdminPath,
  lookupStaffRole,
} from "@/lib/auth/roles";
import { redirectWithSession, updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const { supabase, claims, response } = await updateSession(request);

  // Admin gate: covers /admin and every current and future child route (page loads,
  // client navigations and Server Function POSTs) except /admin/login. Pages repeat
  // the check with requireStaff() (src/lib/auth/staff.ts); this is not the only line.
  if (!isProtectedAdminPath(request.nextUrl.pathname)) {
    return response();
  }

  if (!claims?.sub) {
    return redirectWithSession(request, response(), adminLoginUrlPath());
  }

  const lookup = await lookupStaffRole(supabase, claims.sub);

  if (lookup.status === "error") {
    // Keep the session: the failure may be transient.
    return redirectWithSession(request, response(), adminLoginUrlPath("unavailable"));
  }

  if (lookup.status === "none") {
    // Signed in but not staff: end this session so the account cannot linger in the
    // admin area, then explain on the login page (no redirect loop: login is public).
    await supabase.auth.signOut({ scope: "local" });
    return redirectWithSession(request, response(), adminLoginUrlPath("unauthorized"));
  }

  return response();
}

export const config = {
  matcher: [
    // Run on all paths except Next.js internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
