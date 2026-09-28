"use server";

import { revalidatePath } from "next/cache";

import { ADMIN_EMPLOYEES_PATH } from "@/lib/auth/roles";
import { getAdminAccess } from "@/lib/auth/staff";
import { openStaffDirectory } from "@/lib/employees/directory";
import {
  inviteEmployee as inviteEmployeeForOwner,
  removeEmployee as removeEmployeeForOwner,
  type ActionResult,
} from "@/lib/employees/management";

export type InviteEmployeeState = (ActionResult & { email: string }) | undefined;
export type RemoveEmployeeState = ActionResult | undefined;

// Both Server Functions are public POST endpoints. The Owner check happens inside the
// management functions, from the caller's verified session, before any privileged call;
// nothing the browser sends (role, hidden fields) is trusted as authorization.

export async function inviteEmployee(
  _previousState: InviteEmployeeState,
  formData: FormData,
): Promise<InviteEmployeeState> {
  const email = formData.get("email");
  const result = await inviteEmployeeForOwner(
    await getAdminAccess(),
    openStaffDirectory,
    email,
  );
  if (result.ok) {
    revalidatePath(ADMIN_EMPLOYEES_PATH);
  }
  // On success the field is cleared; on failure the typed email is kept.
  return { ...result, email: !result.ok && typeof email === "string" ? email : "" };
}

export async function removeEmployee(
  _previousState: RemoveEmployeeState,
  formData: FormData,
): Promise<RemoveEmployeeState> {
  const result = await removeEmployeeForOwner(
    await getAdminAccess(),
    openStaffDirectory,
    formData.get("userId"),
  );
  if (result.ok) {
    revalidatePath(ADMIN_EMPLOYEES_PATH);
  }
  return result;
}
