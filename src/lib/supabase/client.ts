import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv } from "./env";

/**
 * Supabase client for Client Components (code running in the browser).
 *
 * Uses only the public URL and publishable key. The session is stored in
 * cookies so that server code can read the same session.
 */
export function createClient() {
  const { url, publishableKey } = getSupabaseEnv();

  return createBrowserClient(url, publishableKey);
}
