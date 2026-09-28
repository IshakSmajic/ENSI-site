// StaffDirectory backed by the privileged Supabase client (src/lib/supabase/admin.ts).
//
// Only the error code/status of a failure is kept; messages, SQL details and user
// metadata never leave this file. Only the Auth user fields employee management shows are
// mapped (no metadata, identities, factors or tokens).
//
// Kept free of Next.js and "@/" imports so it runs under `npm test`.

import type { SupabaseClient, User } from "@supabase/supabase-js";

import type {
  AuthAccount,
  DirectoryError,
  DirectoryResult,
  RoleRecord,
  StaffDirectory,
} from "./management";

type AdminClient = Pick<SupabaseClient, "from" | "auth">;

const USERS_PER_PAGE = 1000;
const MAX_USER_PAGES = 50;

function ok<T>(value: T): DirectoryResult<T> {
  return { ok: true, value };
}

function fail(error: { code?: unknown; status?: unknown }): { ok: false; error: DirectoryError } {
  return {
    ok: false,
    error: {
      code: typeof error.code === "string" ? error.code : undefined,
      status: typeof error.status === "number" ? error.status : undefined,
    },
  };
}

function toRole(value: unknown): RoleRecord["role"] | null {
  return value === "owner" || value === "employee" ? value : null;
}

function toAccount(user: User): AuthAccount {
  return {
    id: user.id,
    email: user.email ?? null,
    createdAt: user.created_at,
    invitedAt: user.invited_at ?? null,
    emailConfirmedAt: user.email_confirmed_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
  };
}

export function createSupabaseStaffDirectory(client: AdminClient): StaffDirectory {
  return {
    async listRoles() {
      const { data, error } = await client
        .from("user_roles")
        .select("user_id, role, created_at")
        .order("created_at", { ascending: true });
      if (error) {
        return fail(error);
      }
      const records: RoleRecord[] = [];
      for (const row of data ?? []) {
        const role = toRole(row.role);
        if (role && typeof row.user_id === "string") {
          records.push({ userId: row.user_id, role, createdAt: String(row.created_at) });
        }
      }
      return ok(records);
    },

    async getRole(userId) {
      const { data, error } = await client
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      return error ? fail(error) : ok(toRole(data?.role));
    },

    async getAccount(userId) {
      const { data, error } = await client.auth.admin.getUserById(userId);
      if (error) {
        return error.code === "user_not_found" || error.status === 404 ? ok(null) : fail(error);
      }
      return ok(data.user ? toAccount(data.user) : null);
    },

    async findAccountByEmail(email) {
      // The Admin API has no lookup by email; page through the (small) user list.
      for (let page = 1; page <= MAX_USER_PAGES; page++) {
        const { data, error } = await client.auth.admin.listUsers({
          page,
          perPage: USERS_PER_PAGE,
        });
        if (error) {
          return fail(error);
        }
        const match = data.users.find((user) => user.email?.toLowerCase() === email);
        if (match) {
          return ok(toAccount(match));
        }
        if (data.users.length < USERS_PER_PAGE) {
          return ok(null);
        }
      }
      // Too many users to be sure the email is unused: fail closed.
      return fail({ code: "too_many_users" });
    },

    async inviteUser(email) {
      // No redirectTo: the invitation email template links to
      // {{ .SiteURL }}/admin/accept-invite (README, "Employee invitations").
      const { data, error } = await client.auth.admin.inviteUserByEmail(email);
      if (error) {
        return fail(error);
      }
      return data.user ? ok({ id: data.user.id }) : fail({ code: "no_user_returned" });
    },

    async grantEmployeeRole(userId) {
      const { error } = await client
        .from("user_roles")
        .insert({ user_id: userId, role: "employee" });
      return error ? fail(error) : ok(undefined);
    },

    async revokeEmployeeRole(userId) {
      const { data, error } = await client
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "employee")
        .select("user_id");
      return error ? fail(error) : ok((data ?? []).length > 0);
    },

    async deleteAccount(userId) {
      const { error } = await client.auth.admin.deleteUser(userId);
      return error ? fail(error) : ok(undefined);
    },
  };
}
