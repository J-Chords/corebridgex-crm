"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * The one place a browser-side Supabase client gets constructed — nothing outside
 * src/lib/supabase/ should import `@supabase/ssr` or `@supabase/supabase-js` directly.
 * Not called anywhere yet: the app runs entirely on the mock provider
 * (`providers/index.ts`) until a real `supabaseXxxProvider` is implemented and wired in.
 *
 * Throws only when actually invoked without the required env vars configured — never at
 * module load — so importing this file (or the app starting in mock mode, where these
 * vars are intentionally unset) never crashes on its own.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase browser client requested but NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY aren't set. Expected while NEXT_PUBLIC_DATA_PROVIDER=mock — this should only be called once a supabase*Provider is actually wired in."
    );
  }
  return createBrowserClient(url, key);
}
