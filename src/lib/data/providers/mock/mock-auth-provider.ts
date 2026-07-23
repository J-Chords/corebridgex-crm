import type { AuthProvider } from "../auth-provider";
import { seedUsers } from "./seed-users";

const SESSION_KEY = "corebridge-mock-session-user-id";

function readSessionUserId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_KEY);
}

/**
 * Mock auth: validates the email against seeded users and ignores the
 * password (there is no real credential store yet). This lets the login
 * screen, session persistence, and redirect flow all be exercised now,
 * while the real Supabase Auth provider slots in later with the same
 * `login`/`logout`/`getCurrentUser` contract.
 */
export const mockAuthProvider: AuthProvider = {
  async getCurrentUser() {
    const id = readSessionUserId();
    if (!id) return null;
    return seedUsers.find((u) => u.id === id) ?? null;
  },

  async login(email, password) {
    if (!password) {
      throw new Error("Password is required.");
    }
    const user = seedUsers.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase()
    );
    if (!user) {
      throw new Error("No account found for that email. This tool is invite-only.");
    }
    if (!user.active) {
      throw new Error("This account has been deactivated. Contact your admin.");
    }
    window.localStorage.setItem(SESSION_KEY, user.id);
    return user;
  },

  async logout() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(SESSION_KEY);
  },
};
