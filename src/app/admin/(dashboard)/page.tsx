import Link from "next/link";

import { ADMIN_EMPLOYEES_PATH, ADMIN_PRODUCTS_PATH } from "@/lib/auth/roles";
import { requireStaff } from "@/lib/auth/staff";

export default async function AdminDashboardPage() {
  const user = await requireStaff();

  return (
    <main>
      <h1>Admin dashboard</h1>
      <dl>
        <dt>Email</dt>
        <dd>{user.email ?? "Unknown"}</dd>
        <dt>Role</dt>
        <dd>{user.role === "owner" ? "Owner" : "Employee"}</dd>
      </dl>
      <p>
        <Link href={ADMIN_PRODUCTS_PATH}>Product management</Link>
      </p>
      {/* Convenience only: /admin/employees checks the Owner role itself. */}
      {user.role === "owner" && (
        <p>
          <Link href={ADMIN_EMPLOYEES_PATH}>Employee management</Link>
        </p>
      )}
      <p>Event management will be added in a later milestone.</p>
    </main>
  );
}
