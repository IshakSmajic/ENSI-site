import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnv, isPrivilegedKey } from "./env";

/**
 * Privileged Supabase client (secret / service_role key). It bypasses RLS and can use the
 * Auth Admin API, so its only purpose is Owner employee management
 * (src/lib/employees/). Every caller must verify the Owner role first.
 *
 * Never use it for ordinary data access: that stays on the user-scoped clients in
 * ./server.ts and ./client.ts so RLS applies. The "server-only" import makes importing
 * this file from a Client Component a build error, and the key is read from a variable
 * without the NEXT_PUBLIC_ prefix, so Next.js never inlines it into browser code.
 */
export function createAdminClient() {
  const { url } = getSupabaseEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  // The messages name the variable, never its value.
  if (!secretKey) {
    throw new Error("Missing SUPABASE_SECRET_KEY (server-only). See .env.example.");
  }
  if (!isPrivilegedKey(secretKey)) {
    throw new Error(
      "SUPABASE_SECRET_KEY must be the secret key (sb_secret_...) or the legacy service_role key.",
    );
  }

  return createClient(url, secretKey, {
    auth: {
      // A stateless server client: no user session is stored, refreshed or read from a URL.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
