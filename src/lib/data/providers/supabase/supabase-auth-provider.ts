import type { AuthProvider } from "../auth-provider";

/**
 * Real backend slot-in point. Swap the factory in `providers/index.ts` to
 * point here once Supabase Auth + the `users` table are wired up — no
 * screen or component changes required, since everything consumes
 * `AuthProvider`, not this class directly.
 */
export const supabaseAuthProvider: AuthProvider = {
  async getCurrentUser() {
    throw new Error("supabaseAuthProvider is not implemented yet — use the mock provider.");
  },
  async login() {
    throw new Error("supabaseAuthProvider is not implemented yet — use the mock provider.");
  },
  async logout() {
    throw new Error("supabaseAuthProvider is not implemented yet — use the mock provider.");
  },
  async updateProfile() {
    throw new Error("supabaseAuthProvider is not implemented yet — use the mock provider.");
  },
};
