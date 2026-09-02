"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Role } from "@/lib/data/types";

/**
 * Admin Foundation Part 9 — the narrow server-only boundary for the two Admin operations that
 * genuinely require the Supabase Auth Admin API (creating a new Auth identity; setting another
 * user's password directly) — nothing else needs a Server Action. Role change, active toggle, and
 * Service staffing are already safely gated SECURITY DEFINER RPCs (admin_set_user_role/
 * admin_set_active/admin_set_user_service_leadership/admin_set_user_service_membership) callable
 * directly from the browser client, exactly like every other RPC in this codebase — routing them
 * through here too would just duplicate the same is_superadmin() check for no benefit.
 *
 * Every action here independently re-verifies the CALLER's own authenticated/active/superadmin
 * status via the normal session client (never trusting anything the client submits about its own
 * role) before ever touching the service-role client. The service-role client is used ONLY for
 * `auth.admin.*` calls; every other DB write goes through the caller's own authenticated session
 * client, so the existing RPCs' own is_superadmin() check resolves the real caller (a service-role
 * client has no auth.uid() at all and would fail that check).
 */

async function requireActiveSuperadmin() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) {
    throw new Error("Not signed in.");
  }
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", authUser.id)
    .maybeSingle<{ role: string; active: boolean }>();
  if (error || !profile || !profile.active || profile.role !== "superadmin") {
    throw new Error("Only an active admin can perform this action.");
  }
  return { supabase, callerId: authUser.id };
}

export interface AdminCreateUserInput {
  fullName: string;
  email: string;
  initialPassword: string;
  role: Role;
  serviceLeadershipIds?: string[];
  serviceMembershipIds?: string[];
}

export async function adminCreateUser(input: AdminCreateUserInput): Promise<{ id: string }> {
  const { supabase } = await requireActiveSuperadmin();

  const fullName = input.fullName.trim();
  const email = input.email.trim();
  if (!fullName) throw new Error("Name can't be empty.");
  if (!email) throw new Error("Email can't be empty.");
  if (!input.initialPassword || input.initialPassword.length < 8) {
    throw new Error("Initial password must be at least 8 characters.");
  }
  if (!["employee", "supervisor", "superadmin"].includes(input.role)) {
    throw new Error("Invalid role.");
  }

  const admin = createServiceRoleClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: input.initialPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    throw new Error(createError?.message ?? "Couldn't create the account.");
  }
  const newUserId = created.user.id;

  try {
    if (input.role !== "employee") {
      const { error } = await supabase.rpc("admin_set_user_role", {
        target_id: newUserId,
        new_role: input.role,
      });
      if (error) throw new Error(error.message);
    }
    if (input.role === "supervisor" && input.serviceLeadershipIds?.length) {
      const { error } = await supabase.rpc("admin_set_user_service_leadership", {
        p_user_id: newUserId,
        p_service_line_ids: input.serviceLeadershipIds,
      });
      if (error) throw new Error(error.message);
    }
    if (
      (input.role === "employee" || input.role === "supervisor") &&
      input.serviceMembershipIds?.length
    ) {
      const { error } = await supabase.rpc("admin_set_user_service_membership", {
        p_user_id: newUserId,
        p_service_line_ids: input.serviceMembershipIds,
      });
      if (error) throw new Error(error.message);
    }
    const { error: flagError } = await supabase.rpc("admin_set_must_change_password", {
      target_id: newUserId,
      new_value: true,
    });
    if (flagError) throw new Error(flagError.message);
  } catch (err) {
    // Compensating cleanup — only ever delete the Auth user THIS action just created, never an
    // established one.
    await admin.auth.admin.deleteUser(newUserId);
    throw err instanceof Error ? err : new Error("Couldn't finish setting up the new account.");
  }

  return { id: newUserId };
}

export async function adminResetPassword(userId: string, newPassword: string): Promise<void> {
  const { supabase } = await requireActiveSuperadmin();
  if (!newPassword || newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) throw new Error(error.message);

  const { error: flagError } = await supabase.rpc("admin_set_must_change_password", {
    target_id: userId,
    new_value: true,
  });
  if (flagError) throw new Error(flagError.message);
}
