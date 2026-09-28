import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnv } from "./env";

/**
 * Refreshes the Supabase auth session (if any) and forwards the updated auth
 * cookies to both the rendered request and the browser.
 *
 * Returns the Supabase client and the verified JWT claims so the proxy can make
 * routing decisions. Always build the final response with `response()` (or copy
 * its cookies onto a redirect with `redirectWithSession`), since any later auth
 * call such as signOut() replaces it with one carrying new cookies.
 */
export async function updateSession(request: NextRequest) {
  const { url, publishableKey } = getSupabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        // Prevents CDNs from caching responses that carry a user's session.
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // Must run before anything else so an expired session is refreshed and its
  // cookies are written before the response is committed. Invalid or expired
  // sessions that cannot be refreshed yield no claims.
  const { data } = await supabase.auth.getClaims();

  return {
    supabase,
    claims: data?.claims ?? null,
    response: () => response,
  };
}

/** Redirects while keeping any auth cookies/headers the session update produced. */
export function redirectWithSession(
  request: NextRequest,
  response: NextResponse,
  pathWithQuery: string,
) {
  const redirect = NextResponse.redirect(new URL(pathWithQuery, request.url));
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  const cacheControl = response.headers.get("cache-control");
  if (cacheControl) {
    redirect.headers.set("cache-control", cacheControl);
  }
  return redirect;
}
