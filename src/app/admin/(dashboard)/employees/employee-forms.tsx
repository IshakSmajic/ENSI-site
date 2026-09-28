"use client";

import { useActionState } from "react";

import type { EmployeeSummary } from "@/lib/employees/management";

import { inviteEmployee, removeEmployee } from "./actions";

export function InviteEmployeeForm() {
  const [state, formAction, pending] = useActionState(inviteEmployee, undefined);

  return (
    <form action={formAction} className="admin-form">
      <label htmlFor="employee-email">Email</label>
      <input
        // Remounting resets the field after a successful invitation.
        key={state?.ok ? `sent-${state.message}` : "form"}
        id="employee-email"
        name="email"
        type="email"
        autoComplete="off"
        defaultValue={state?.email}
        required
      />

      {state && !state.ok && (
        <p role="alert" className="admin-error">
          {state.error}
        </p>
      )}
      {state?.ok && <p role="status">{state.message}</p>}

      <button type="submit" disabled={pending}>
        {pending ? "Sending invitation…" : "Add employee"}
      </button>
    </form>
  );
}

const STATUS_LABELS: Record<EmployeeSummary["status"], string> = {
  invited: "Invitation sent (not accepted yet)",
  active: "Active",
};

// One removal state for the whole list: a removed row disappears, but its result message
// stays visible above the list.
export function EmployeeList({ employees }: { employees: EmployeeSummary[] }) {
  const [state, formAction, pending] = useActionState(removeEmployee, undefined);

  return (
    <>
      {state && !state.ok && (
        <p role="alert" className="admin-error">
          {state.error}
        </p>
      )}
      {state?.ok && <p role="status">{state.message}</p>}

      {employees.length === 0 ? (
        <p>No employees yet.</p>
      ) : (
        <ul className="admin-list">
          {employees.map((employee) => {
            const email = employee.email ?? "Unknown email";
            return (
              <li key={employee.id}>
                <div>
                  <strong>{email}</strong>
                  <div>
                    Employee · {STATUS_LABELS[employee.status]} · added{" "}
                    {new Date(employee.addedAt).toLocaleDateString("en-GB", { timeZone: "UTC" })}
                  </div>
                </div>
                <form
                  action={formAction}
                  onSubmit={(event) => {
                    if (!window.confirm(`Remove admin access for ${email} and delete their account?`)) {
                      event.preventDefault();
                    }
                  }}
                >
                  {/* Only names the target; the server re-checks that it is an employee. */}
                  <input type="hidden" name="userId" value={employee.id} />
                  <button type="submit" disabled={pending}>
                    {pending ? "Removing…" : "Remove access"}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
