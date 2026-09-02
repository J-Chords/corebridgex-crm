import type { AdminUsersProvider, AdminCreateUserInput, AdminUserRow } from "../admin-users-provider";
import type { Role } from "../../types";
import { canManageAdminUsers } from "../../permissions";
import { createClient } from "@/lib/supabase/client";
import { adminCreateUser, adminResetPassword } from "@/app/dashboard/admin/actions";

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  active: boolean;
  supervisor_id: string | null;
  reporting_review_access: boolean;
  must_change_password: boolean;
  created_at: string;
}

/**
 * Real Supabase implementation. Role change / active toggle / Service staffing go straight through
 * the already-gated SECURITY DEFINER RPCs via the normal browser (RLS-respecting) client — no
 * Server Action needed, since is_superadmin() inside each RPC independently re-verifies the real
 * caller from their own session. Only createUser/resetPassword route through the narrow
 * src/app/dashboard/admin/actions.ts Server Actions, since only those need the Auth Admin API.
 */
async function fetchStaffingMaps() {
  const supabase = createClient();
  const [{ data: leads }, { data: members }] = await Promise.all([
    supabase.from("service_team_leads").select("service_line_id, user_id"),
    supabase.from("service_employees").select("service_line_id, user_id"),
  ]);
  const leadershipByUser = new Map<string, string[]>();
  for (const row of leads ?? []) {
    const list = leadershipByUser.get(row.user_id) ?? [];
    list.push(row.service_line_id);
    leadershipByUser.set(row.user_id, list);
  }
  const membershipByUser = new Map<string, string[]>();
  for (const row of members ?? []) {
    const list = membershipByUser.get(row.user_id) ?? [];
    list.push(row.service_line_id);
    membershipByUser.set(row.user_id, list);
  }
  return { leadershipByUser, membershipByUser };
}

function toRow(row: ProfileRow, leadershipByUser: Map<string, string[]>, membershipByUser: Map<string, string[]>): AdminUserRow {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    active: row.active,
    supervisorId: row.supervisor_id,
    assignedCompanyIds: [],
    reportingReviewAccess: row.reporting_review_access,
    mustChangePassword: row.must_change_password,
    createdAt: row.created_at,
    serviceLeadershipIds: leadershipByUser.get(row.id) ?? [],
    serviceMembershipIds: membershipByUser.get(row.id) ?? [],
  };
}

export const supabaseAdminUsersProvider: AdminUsersProvider = {
  async listUsers(viewer) {
    if (!canManageAdminUsers(viewer)) {
      throw new Error("Only an admin can manage users.");
    }
    const supabase = createClient();
    const [{ data: profiles, error }, { leadershipByUser, membershipByUser }] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, full_name, email, role, active, supervisor_id, reporting_review_access, must_change_password, created_at"
        )
        .order("full_name"),
      fetchStaffingMaps(),
    ]);
    if (error) throw new Error(error.message);
    return ((profiles ?? []) as ProfileRow[]).map((row) => toRow(row, leadershipByUser, membershipByUser));
  },

  async createUser(viewer, input: AdminCreateUserInput) {
    if (!canManageAdminUsers(viewer)) {
      throw new Error("Only an admin can manage users.");
    }
    const { id } = await adminCreateUser(input);
    const supabase = createClient();
    const { data: profile, error } = await supabase
      .from("profiles")
      .select(
        "id, full_name, email, role, active, supervisor_id, reporting_review_access, must_change_password, created_at"
      )
      .eq("id", id)
      .single<ProfileRow>();
    if (error || !profile) throw new Error("User created but couldn't be reloaded.");
    const { leadershipByUser, membershipByUser } = await fetchStaffingMaps();
    return toRow(profile, leadershipByUser, membershipByUser);
  },

  async setFullName(viewer, userId, fullName) {
    if (!canManageAdminUsers(viewer)) {
      throw new Error("Only an admin can manage users.");
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_full_name", { target_id: userId, new_full_name: fullName });
    if (error) throw new Error(error.message);
    return refetchOne(userId);
  },

  async setRole(viewer, userId, role) {
    if (!canManageAdminUsers(viewer)) {
      throw new Error("Only an admin can manage users.");
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_user_role", { target_id: userId, new_role: role });
    if (error) throw new Error(error.message);
    return refetchOne(userId);
  },

  async setActive(viewer, userId, active) {
    if (!canManageAdminUsers(viewer)) {
      throw new Error("Only an admin can manage users.");
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_active", { target_id: userId, new_active: active });
    if (error) throw new Error(error.message);
    return refetchOne(userId);
  },

  async setServiceLeadership(viewer, userId, serviceLineIds) {
    if (!canManageAdminUsers(viewer)) {
      throw new Error("Only an admin can manage users.");
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_user_service_leadership", {
      p_user_id: userId,
      p_service_line_ids: serviceLineIds,
    });
    if (error) throw new Error(error.message);
    return refetchOne(userId);
  },

  async setServiceMembership(viewer, userId, serviceLineIds) {
    if (!canManageAdminUsers(viewer)) {
      throw new Error("Only an admin can manage users.");
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_user_service_membership", {
      p_user_id: userId,
      p_service_line_ids: serviceLineIds,
    });
    if (error) throw new Error(error.message);
    return refetchOne(userId);
  },

  async resetPassword(viewer, userId, newPassword) {
    if (!canManageAdminUsers(viewer)) {
      throw new Error("Only an admin can manage users.");
    }
    await adminResetPassword(userId, newPassword);
  },
};

async function refetchOne(userId: string): Promise<AdminUserRow> {
  const supabase = createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, role, active, supervisor_id, reporting_review_access, must_change_password, created_at"
    )
    .eq("id", userId)
    .single<ProfileRow>();
  if (error || !profile) throw new Error("Couldn't reload the updated user.");
  const { leadershipByUser, membershipByUser } = await fetchStaffingMaps();
  return toRow(profile, leadershipByUser, membershipByUser);
}
