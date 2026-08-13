import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Next.js 16 file convention — the renamed successor to `middleware.ts` (same runtime
 * behavior, new name/export; see next/dist/docs/.../file-conventions/proxy.md). Narrowly
 * scoped to refreshing a Supabase auth session's cookies so Server Components (which can't
 * write cookies themselves) always see a fresh token. This is NOT the authorization layer —
 * actual data access control is, and remains, Postgres RLS. Nothing here makes an allow/deny
 * decision about any route.
 *
 * The app currently runs entirely on the mock provider (`NEXT_PUBLIC_DATA_PROVIDER=mock`),
 * which has no Supabase session to refresh — so when the Supabase env vars aren't configured
 * (the expected, intentional state right now), this just passes the request through
 * unchanged rather than constructing a client with undefined credentials.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims() is the current recommended call for this: it refreshes the session first if the
  // access token is close to expiring (writing the refreshed cookies above), then verifies the
  // JWT — typically locally via the cached JWKS endpoint, so it's cheaper than getUser(), which
  // always round-trips to the Auth server. The return value itself is intentionally unused here
  // — this proxy only refreshes the session, it never redirects/blocks based on who the user is.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
