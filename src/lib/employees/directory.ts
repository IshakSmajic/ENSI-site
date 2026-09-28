import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type { StaffDirectory } from "./management";
import { createSupabaseStaffDirectory } from "./supabase-directory";

/**
 * Opens the privileged staff directory. Pass it (unopened) to the functions in
 * ./management.ts, which call it only after verifying the Owner role.
 */
export function openStaffDirectory(): StaffDirectory {
  return createSupabaseStaffDirectory(createAdminClient());
}
