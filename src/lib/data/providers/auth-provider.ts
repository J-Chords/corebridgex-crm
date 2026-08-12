import type { User } from "../types";

/**
 * Auth contract every provider (mock, Supabase, future AWS) must implement.
 * Screens only ever talk to `authProvider` from `./index`, never to a
 * concrete implementation — that's what makes the backend swappable.
 */
export interface ProfileInput {
  fullName: string;
  email: string;
}

export interface AuthProvider {
  getCurrentUser(): Promise<User | null>;
  login(email: string, password: string): Promise<User>;
  logout(): Promise<void>;
  /** Name/email only — password management needs a real credential store, which doesn't exist yet (see Settings' Profile section). */
  updateProfile(viewer: User, input: ProfileInput): Promise<User>;
}
