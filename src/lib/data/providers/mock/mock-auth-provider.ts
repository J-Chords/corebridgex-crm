import type { AuthProvider } from "../auth-provider";
import { canEditOwnProfile } from "../../permissions";
import { db } from "./mock-db";

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
    return db.users.find((u) => u.id === id) ?? null;
  },

  async login(email, password) {
    if (!password) {
      throw new Error("Password is required.");
    }
    const user = db.users.find(
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

  async updateProfile(viewer, input) {
    if (!canEditOwnProfile(viewer)) {
      throw new Error("Only a superadmin can edit profile details.");
    }
    const fullName = input.fullName.trim();
    const email = input.email.trim();
    if (!fullName) throw new Error("Name can't be empty.");
    if (!email) throw new Error("Email can't be empty.");
    const emailTaken = db.users.some(
      (u) => u.id !== viewer.id && u.email.toLowerCase() === email.toLowerCase()
    );
    if (emailTaken) throw new Error("Another account already uses that email.");

    const updated = { ...viewer, fullName, email };
    db.users = db.users.map((u) => (u.id === viewer.id ? updated : u));
    return updated;
  },
};
