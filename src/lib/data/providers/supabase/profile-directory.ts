import type { User, Role } from "../../types";
import { createClient } from "@/lib/supabase/client";

interface DirectoryRow {
  id: string;
  full_name: string;
  role: Role;
  supervisor_id: string | null;
}

/**
 * Resolves the minimum personnel info (id/fullName/role/supervisorId) needed to hydrate a
 * Task/Workstream/Note/Task Handoff's related-person fields (creator, status-changer, assignee,
 * lead, team member, author, handoff participant) — for ids the viewer has a legitimate reason to
 * see: themselves, anyone they manage, or anyone who co-occurs with them on a Task/Workstream/
 * Note/Handoff they can already access. See `resolve_profile_directory()`
 * (20260814120000_profile_directory.sql) for the real access boundary — this is a thin wrapper.
 *
 * Deliberately narrower than an ordinary `profiles` table read: email/active/createdAt are never
 * read off any of these relation objects by any UI (confirmed by codebase search), so they're
 * defaulted here rather than fetched — this function can never leak them.
 *
 * `profiles_select`'s own RLS (self, or your own direct reports only) is too narrow for this use:
 * an Employee legitimately viewing a Task their Supervisor created could never otherwise resolve
 * that Supervisor's own profile row, since Supervisor isn't the Employee's own report.
 */
export async function resolveProfileDirectory(ids: string[]): Promise<User[]> {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) return [];
  const supabase = createClient();
  const { data, error } = await supabase.rpc("resolve_profile_directory", { target_ids: uniqueIds });
  if (error) throw new Error(error.message);
  return ((data ?? []) as DirectoryRow[]).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: "",
    role: row.role,
    active: true,
    supervisorId: row.supervisor_id,
    assignedCompanyIds: [],
    // Not authoritative — this directory exists only to hydrate a related-person display field
    // (see the doc comment above), never to check a permission against. Real value is read fresh
    // off the current viewer's own session (supabase-auth-provider.ts) whenever it actually matters.
    reportingReviewAccess: false,
    createdAt: "",
  }));
}
