// Verifies that the configured Supabase project is reachable and accepts the
// publishable key. Read-only: calls the Auth health endpoint and touches no data.
//
// Usage: npm run check:supabase   (reads .env.local)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local.",
  );
  process.exit(1);
}

const endpoint = new URL("/auth/v1/health", url);

try {
  const response = await fetch(endpoint, { headers: { apikey: key } });

  if (!response.ok) {
    console.error(
      `Supabase responded with HTTP ${response.status} ${response.statusText}.`,
    );
    if (response.status === 401) {
      console.error("The publishable key was rejected. Check that it belongs to this project.");
    }
    process.exit(1);
  }

  const body = await response.json();
  console.log(`Connected to Supabase at ${endpoint.origin}`);
  console.log(`Auth service: ${body.name ?? "unknown"} ${body.version ?? ""}`.trim());
} catch (error) {
  console.error(`Could not reach Supabase at ${endpoint.origin}:`, error.message);
  process.exit(1);
}
