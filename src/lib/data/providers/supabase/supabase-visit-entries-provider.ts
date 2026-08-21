import type { VisitEntriesProvider } from "../visit-entries-provider";
import type { VisitEntry, VisitEntryStatus } from "../../types";
import { createClient } from "@/lib/supabase/client";

/**
 * Real Supabase Visit Entries provider — locked Plan → Complete workflow (Phase 9 final semantics
 * fix, 20260821180000). Every mutation is a thin wrapper around the
 * `create_visit_entry`/`update_visit_plan`/`complete_visit_entry`/`delete_visit_entry` RPCs — there
 * is no direct INSERT/UPDATE/DELETE grant on `visit_entries` for `authenticated`, so neither the
 * "no overlap check while planning" rule nor the "full overlap check at completion" rule can ever be
 * routed around from the client. Reads are plain RLS-gated SELECTs.
 */

interface VisitEntryRow {
  id: string;
  user_id: string;
  project_id: string;
  visit_date: string;
  status: VisitEntryStatus;
  start_at: string | null;
  end_at: string | null;
  duration_minutes: number | null;
  agenda: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

function toVisitEntry(row: VisitEntryRow): VisitEntry {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    visitDate: row.visit_date,
    status: row.status,
    startAt: row.start_at,
    endAt: row.end_at,
    durationMinutes: row.duration_minutes,
    agenda: row.agenda,
    timezone: row.timezone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const supabaseVisitEntriesProvider: VisitEntriesProvider = {
  async listMyVisitEntries(viewer) {
    const supabase = createClient();
    const { data, error } = await supabase.from("visit_entries").select("*").eq("user_id", viewer.id).order("visit_date", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as VisitEntryRow[]).map(toVisitEntry);
  },

  async listVisitEntriesForUser(_viewer, userId) {
    // No TS-side permission pre-check here — `visit_entries_select`'s own RLS
    // (`user_id = auth.uid() or manages_user(user_id)`) is the real, authoritative boundary; a
    // query for a userId the viewer isn't allowed to see simply returns zero rows.
    const supabase = createClient();
    const { data, error } = await supabase.from("visit_entries").select("*").eq("user_id", userId).order("visit_date", { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as VisitEntryRow[]).map(toVisitEntry);
  },

  async createVisitEntry(_viewer, input) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_visit_entry", {
      p_project_id: input.projectId,
      p_visit_date: input.visitDate,
      p_agenda: input.agenda,
      p_timezone: input.timezone,
    });
    if (error) throw new Error(error.message);
    return toVisitEntry(data as VisitEntryRow);
  },

  async updateVisitPlan(_viewer, id, input) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("update_visit_plan", {
      target_entry_id: id,
      p_visit_date: input.visitDate,
      p_agenda: input.agenda,
    });
    if (error) throw new Error(error.message);
    return toVisitEntry(data as VisitEntryRow);
  },

  async completeVisitEntry(_viewer, id, input) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("complete_visit_entry", {
      target_entry_id: id,
      p_start_at: input.startAt,
      p_end_at: input.endAt,
    });
    if (error) throw new Error(error.message);
    return toVisitEntry(data as VisitEntryRow);
  },

  async deleteVisitEntry(_viewer, id) {
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_visit_entry", { target_entry_id: id });
    if (error) throw new Error(error.message);
  },
};
