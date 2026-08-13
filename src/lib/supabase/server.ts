import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * The one place a server-side (Server Component / Route Handler / Server Function) Supabase
 * client gets constructed. Uses the publishable (anon) key only — never the service-role key,
 * which must never reach application code that could end up bundled or logged; a real
 * admin-only operation (e.g. the invite-onboarding flow) belongs in its own narrowly-scoped
 * server-only module, not here.
 *
 * Not called anywhere yet — see the note in `./client.ts`. `cookies()` can only be called
 * from a Server Component/Route Handler/Server Function, so this stays an async function
 * rather than a bare client construction.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase server client requested but NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY aren't set. Expected while NEXT_PUBLIC_DATA_PROVIDER=mock — this should only be called once a supabase*Provider is actually wired in."
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, which can't set cookies — safe to ignore as long
          // as src/proxy.ts is also refreshing the session (it is).
        }
      },
    },
  });
}
