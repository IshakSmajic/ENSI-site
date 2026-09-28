"use server";

import { redirect } from "next/navigation";

import {
  ADMIN_HOME_PATH,
  ADMIN_LOGIN_NOTICES,
  lookupStaffRole,
  signInErrorMessage,
} from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string; email: string } | undefined;

/**
 * Email/password sign-in for Owners and Employees. There is intentionally no sign-up
 * counterpart: accounts are provisioned by the Owner/administrator (README).
 */
export async function login(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    return { error: "Enter your email and password.", email: "" };
  }

  const trimmedEmail = email.trim();
  if (!trimmedEmail || !password) {
    return { error: "Enter your email and password.", email: trimmedEmail };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  });

  if (error || !data.user) {
    return {
      error: signInErrorMessage(error ?? {}),
      email: trimmedEmail,
    };
  }

  // Authentication alone is not authorization: require an owner/employee row.
  const lookup = await lookupStaffRole(supabase, data.user.id);

  if (lookup.status !== "staff") {
    // Do not keep a session that cannot use the admin area.
    await supabase.auth.signOut({ scope: "local" });
    return {
      error:
        lookup.status === "error"
          ? ADMIN_LOGIN_NOTICES.unavailable
          : ADMIN_LOGIN_NOTICES.unauthorized,
      email: trimmedEmail,
    };
  }

  redirect(ADMIN_HOME_PATH);
}
