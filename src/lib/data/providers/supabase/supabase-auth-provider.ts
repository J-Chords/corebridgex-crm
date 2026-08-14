import type { AuthProvider } from "../auth-provider";
import type { User } from "../../types";
import { canEditOwnProfile } from "../../permissions";
import { createClient } from "@/lib/supabase/client";

/**
 * Real Supabase Auth, wired up per the "Supabase Auth — Controlled Transitional Mode" phase.
 * Only Auth is real here — every other provider stays mock (see `NEXT_PUBLIC_DATA_PROVIDER
 * = "supabase-auth"` in `../provider-mode`). No screen changes were needed: everything
 * still consumes the same `AuthProvider` contract as `mockAuthProvider`.
 *
 * Authorization facts (role/active/supervisorId/assignedCompanyIds) always come from
 * `public.profiles`/`public.user_companies`, read through the signed-in user's own
 * session — never from `user_metadata`/JWT claims, and never through a service-role
 * client. RLS is the real access-control boundary; this file never bypasses it.
 */

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: string;
  active: boolean;
  supervisor_id: string | null;
  created_at: string;
}

/**
 * Loads the application-level User for the current Supabase session, or null if there's no
 * valid session. Shared by `getCurrentUser` and `login` so profile-mapping logic exists in
 * exactly one place.
 *
 * Throws (rather than returning null) when a Supabase Auth identity exists but its
 * `profiles`/active state doesn't allow app access — the caller decides how to surface that:
 * `login` lets it propagate as a user-facing error, `getCurrentUser` catches it and signs out
 * silently, since there's no form in view during a background session restore to show it on.
 */
async function loadCurrentAppUser(): Promise<User | null> {
  const supabase = createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, active, supervisor_id, created_at")
    .eq("id", authUser.id)
    .maybeSingle<ProfileRow>();

  if (profileError) {
    throw new Error("Couldn't load your profile. Please try again.");
  }
  if (!profile) {
    throw new Error(
      "Your account doesn't have an application profile yet. Contact your admin."
    );
  }
  if (!profile.active) {
    throw new Error("This account has been deactivated. Contact your admin.");
  }

  const { data: companyRows, error: companiesError } = await supabase
    .from("user_companies")
    .select("company_id")
    .eq("user_id", authUser.id);

  if (companiesError) {
    throw new Error("Couldn't load your assigned companies. Please try again.");
  }

  return {
    id: profile.id,
    fullName: profile.full_name,
    email: profile.email,
    role: profile.role as User["role"],
    active: profile.active,
    supervisorId: profile.supervisor_id,
    assignedCompanyIds: (companyRows ?? []).map((row) => row.company_id as string),
    createdAt: profile.created_at,
  };
}

export const supabaseAuthProvider: AuthProvider = {
  async getCurrentUser() {
    try {
      return await loadCurrentAppUser();
    } catch {
      // No form is on screen during a silent session restore (page load/refresh) — fail
      // closed by signing out and reporting "no session" rather than throwing here.
      const supabase = createClient();
      await supabase.auth.signOut();
      return null;
    }
  },

  async login(email, password) {
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      throw new Error(signInError.message);
    }

    try {
      const user = await loadCurrentAppUser();
      if (!user) {
        throw new Error("Sign-in succeeded but no session was found. Please try again.");
      }
      return user;
    } catch (err) {
      // A signed-in Auth identity that can't become an app User (no profile, inactive) must
      // not be left half-signed-in.
      await supabase.auth.signOut();
      throw err;
    }
  },

  async logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
  },

  async updateProfile(viewer, input) {
    if (!canEditOwnProfile(viewer)) {
      throw new Error("Only a superadmin can edit profile details.");
    }
    const fullName = input.fullName.trim();
    const email = input.email.trim();
    if (!fullName) throw new Error("Name can't be empty.");
    if (!email) throw new Error("Email can't be empty.");

    if (email.toLowerCase() !== viewer.email.toLowerCase()) {
      // Changing profiles.email alone would diverge from the real Supabase Auth sign-in
      // email — this slice doesn't yet implement the confirmation flow needed to change
      // both safely together. Reject rather than produce a mismatched identity.
      throw new Error(
        "Changing your sign-in email isn't supported yet — update your name only for now."
      );
    }

    const supabase = createClient();
    const { data: updated, error } = await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", viewer.id)
      .select("full_name")
      .single();

    if (error || !updated) {
      throw new Error("Couldn't update your profile. Please try again.");
    }

    return { ...viewer, fullName: updated.full_name };
  },
};
