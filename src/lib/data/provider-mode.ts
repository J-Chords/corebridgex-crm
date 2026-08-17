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
 *
 * "supabase-core" is Phase 7's transitional mode: real Auth + Companies +
 * Workstreams + Activity Catalog + Tasks + Time Entries + Notifications —
 * the operational core that now has a real schema/RLS/providers — while
 * Notes/Templates/Task Handoffs/Accomplishments Report/Saved Views/Daily
 * Updates/Client Report stay mock, since those providers are still
 * `notImplemented` stubs. This is a temporary, coherent mode (not a
 * per-provider toggle) meant to be retired once the remaining providers are
 * migrated and full "supabase" mode is safe to use.
 */
export type ProviderMode = "mock" | "supabase-auth" | "supabase-core" | "supabase";

function readProviderMode(): ProviderMode {
  const raw = process.env.NEXT_PUBLIC_DATA_PROVIDER;
  if (raw === "supabase-auth" || raw === "supabase-core" || raw === "supabase") return raw;
  if (raw !== undefined && raw !== "mock") {
    // Fail safe rather than silently selecting a real backend from a typo'd value.
    console.error(
      `Invalid NEXT_PUBLIC_DATA_PROVIDER "${raw}" — expected "mock" | "supabase-auth" | "supabase-core" | "supabase". Falling back to "mock".`
    );
  }
  return "mock";
}

export const providerMode: ProviderMode = readProviderMode();

/** True when Auth should be real Supabase — every mode except "mock" qualifies. */
export const usesSupabaseAuth = providerMode !== "mock";

/** True in "supabase-core" and full "supabase" — the operational-core providers are real in both. */
export const usesSupabaseCoreData = providerMode === "supabase-core" || providerMode === "supabase";

/** True only in full "supabase" mode, where every business-data provider (including the
 * not-yet-migrated ones) is also real. */
export const usesSupabaseData = providerMode === "supabase";
