import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ADMIN_HOME_PATH, adminLoginNotice } from "@/lib/auth/roles";
import { getAdminAccess } from "@/lib/auth/staff";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Admin sign in | Plant Pharmacy",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: PageProps<"/admin/login">) {
  // Staff who are already signed in skip the form. Anyone else (including a signed-in
  // user without a role) sees the form, so there is no redirect loop.
  const access = await getAdminAccess();
  if (access.status === "staff") {
    redirect(ADMIN_HOME_PATH);
  }

  const { error } = await searchParams;

  return (
    <main className="admin-login">
      <h1>Admin sign in</h1>
      <p>For pharmacy staff only. Accounts are created by the pharmacy owner.</p>
      <LoginForm notice={adminLoginNotice(error)} />
    </main>
  );
}
