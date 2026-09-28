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
      <p>Product and event management will be added in later milestones.</p>
    </main>
  );
}
