"use server";

import { redirect } from "next/navigation";

import { ADMIN_LOGIN_PATH } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

/**
 * Ends the current session (revokes its refresh token and clears the auth cookies) and
 * returns to the login page. The cookies are cleared even if the revoke request fails.
 */
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect(ADMIN_LOGIN_PATH);
}
