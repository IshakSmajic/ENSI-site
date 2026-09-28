import type { Metadata } from "next";

import { requireStaff } from "@/lib/auth/staff";

import { logout } from "../actions";

export const metadata: Metadata = {
  title: "Admin | Plant Pharmacy",
  robots: { index: false, follow: false },
};

// Every admin page except /admin/login lives in this route group. The proxy checks each
// request; this layout re-checks on full page loads, and pages/Server Functions that touch
// admin data must call requireStaff() themselves (layouts do not re-run on navigation).
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireStaff();

  return (
    <>
      <header className="admin-header">
        <span>
          Signed in as {user.email ?? "unknown email"} ({user.role})
        </span>
        <form action={logout}>
          <button type="submit">Log out</button>
        </form>
      </header>
      {children}
    </>
  );
}
