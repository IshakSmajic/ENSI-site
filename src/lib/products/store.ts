import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { ProductStore } from "./management";
import { createSupabaseProductStore } from "./supabase-store";

/**
 * Opens the product store with the current request's session (publishable key), so the
 * products RLS policies apply. Pass it to the functions in ./management.ts, which check
 * the staff role before using it.
 */
export async function openProductStore(): Promise<ProductStore> {
  return createSupabaseProductStore(await createClient());
}
