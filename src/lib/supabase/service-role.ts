import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Admin Foundation Part 8 — the ONE place a service-role Supabase client gets constructed. Only
 * ever import this from a Server Action (files marked "use server", never a Client Component).
 * SUPABASE_SERVICE_ROLE_KEY is deliberately NOT prefixed NEXT_PUBLIC_ — Next.js only inlines
 * NEXT_PUBLIC_-prefixed env vars into the browser bundle, so even an accidental client-side import
 * of this module could never actually leak the key; it would just read undefined and throw the
 * error below at runtime. The key itself must never be logged or returned to any client — every
 * privileged Admin operation (`src/app/dashboard/admin/actions.ts`) is the only caller. This
 * client bypasses RLS entirely by design (`auth.admin.*`, and any direct table write it performs)
 * — callers MUST independently re-verify the caller's own authenticated/active/superadmin status
 * via the normal session client BEFORE ever touching this module; it never makes that decision
 * itself.
 *
 * Throws only when actually invoked without the key configured — never at module load — so
 * importing this file while running in mock mode (the expected default, no service-role key
 * present) never crashes the app on its own.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase service-role client requested but NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY aren't set. Admin user-management actions require SUPABASE_SERVICE_ROLE_KEY in .env.local (never committed) — see .env.example."
    );
  }
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
