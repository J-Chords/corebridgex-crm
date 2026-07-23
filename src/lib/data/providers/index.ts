import { mockAuthProvider } from "./mock/mock-auth-provider";
import { supabaseAuthProvider } from "./supabase/supabase-auth-provider";

/**
 * Single switch for the whole app's backend. Set NEXT_PUBLIC_DATA_PROVIDER
 * to "supabase" once the real backend is ready — every screen already talks
 * to `authProvider` (and, in later phases, the other providers exported
 * from here), so nothing else needs to change.
 */
const useSupabase = process.env.NEXT_PUBLIC_DATA_PROVIDER === "supabase";

export const authProvider = useSupabase ? supabaseAuthProvider : mockAuthProvider;
