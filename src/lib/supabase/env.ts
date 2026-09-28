// Public Supabase configuration shared by the browser, server and proxy clients.
//
// Both values are intentionally public (NEXT_PUBLIC_) and safe to ship to the
// browser: access control is enforced by Supabase Auth and Row Level Security.
// Privileged keys (secret / service_role) must never be read here.
//
// The variables are referenced literally so Next.js can inline them into the
// browser bundle at build time.

export function getSupabaseEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local (see .env.example).",
    );
  }

  if (isPrivilegedKey(publishableKey)) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY contains a secret/service_role key. " +
        "Use the publishable (or legacy anon) key and rotate the exposed secret key.",
    );
  }

  return { url, publishableKey };
}

// Detects new-style secret keys and legacy service_role JWTs.
function isPrivilegedKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) {
    return true;
  }

  const payload = key.split(".")[1];
  if (!payload) {
    return false;
  }

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims: unknown = JSON.parse(atob(base64));
    return (
      typeof claims === "object" &&
      claims !== null &&
      "role" in claims &&
      claims.role === "service_role"
    );
  } catch {
    return false;
  }
}
