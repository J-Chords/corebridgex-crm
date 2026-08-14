/**
 * Single source of truth for `NEXT_PUBLIC_DATA_PROVIDER`. Centralized here so
 * `providers/index.ts` and any UI that needs to know the mode (e.g. the login
 * form's quick-demo buttons) compare against one parsed value instead of
 * repeating raw string checks against `process.env` throughout the app.
 *
 * "supabase-auth" is a deliberate transitional mode: real Supabase Auth, but
 * every other provider (Companies, Workstreams, Tasks, Time, …) stays mock,
 * since most Supabase business-data providers aren't implemented yet. See
 * docs/current-project-state.md's Supabase Foundation notes for why.
 */
export type ProviderMode = "mock" | "supabase-auth" | "supabase";

function readProviderMode(): ProviderMode {
  const raw = process.env.NEXT_PUBLIC_DATA_PROVIDER;
  if (raw === "supabase-auth" || raw === "supabase") return raw;
  if (raw !== undefined && raw !== "mock") {
    // Fail safe rather than silently selecting a real backend from a typo'd value.
    console.error(
      `Invalid NEXT_PUBLIC_DATA_PROVIDER "${raw}" — expected "mock" | "supabase-auth" | "supabase". Falling back to "mock".`
    );
  }
  return "mock";
}

export const providerMode: ProviderMode = readProviderMode();

/** True when Auth should be real Supabase — "supabase-auth" and "supabase" both qualify. */
export const usesSupabaseAuth = providerMode !== "mock";

/** True only in full "supabase" mode, where every business-data provider is also real. */
export const usesSupabaseData = providerMode === "supabase";
