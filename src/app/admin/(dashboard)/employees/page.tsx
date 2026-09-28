import Link from "next/link";

import { ADMIN_HOME_PATH } from "@/lib/auth/roles";
import { requireStaff } from "@/lib/auth/staff";
import { openStaffDirectory } from "@/lib/employees/directory";
import { listEmployees } from "@/lib/employees/management";

import { EmployeeList, InviteEmployeeForm } from "./employee-forms";

// Owner only. Anonymous visitors are redirected by the proxy and requireStaff(); an
// Employee gets this page without any employee data (the check is here on the server,
// not only in the hidden dashboard link). The Server Functions check the role again.
export default async function EmployeesPage() {
  const user = await requireStaff();

  if (user.role !== "owner") {
    return (
      <main>
        <h1>Employee management</h1>
        <p role="alert" className="admin-error">
          Only the owner can manage employees.
        </p>
        <p>
          <Link href={ADMIN_HOME_PATH}>Back to the dashboard</Link>
        </p>
      </main>
    );
  }

  const result = await listEmployees({ status: "staff", user }, openStaffDirectory);

  return (
    <main>
      <p>
        <Link href={ADMIN_HOME_PATH}>← Dashboard</Link>
      </p>
      <h1>Employee management</h1>

      <section>
        <h2>Current employees</h2>
        {result.ok ? (
          <EmployeeList employees={result.employees} />
        ) : (
          <p role="alert" className="admin-error">
            {result.error}
          </p>
        )}
      </section>

      <section className="admin-login">
        <h2>Add employee</h2>
        <p>
          Supabase emails the address an invitation. They choose their own password and get
          the Employee role only.
        </p>
        <InviteEmployeeForm />
      </section>
    </main>
  );
}
