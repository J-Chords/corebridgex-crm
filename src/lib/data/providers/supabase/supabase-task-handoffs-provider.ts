import type { TaskHandoffsProvider, TaskHandoffWithUsers, TaskHandoffInput, TeamHandoffActivity } from "../task-handoffs-provider";
import type { TaskHandoff, Role, User } from "../../types";
import { createClient } from "@/lib/supabase/client";
import { resolveProfileDirectory } from "./profile-directory";

/**
 * Real Supabase Task Handoffs provider (Phase 7D). `createHandoff`/`acknowledgeHandoff` are thin
 * wrappers around the `create_task_handoff`/`acknowledge_task_handoff` RPCs (recipient-eligibility
 * validation + the handoff row + its notification all commit atomically); `listHandoffCandidates`
 * wraps the `list_handoff_candidates` RPC, since `profiles` RLS alone wouldn't let most callers see
 * legitimate candidates directly. Reads are plain RLS-gated SELECTs, joined in JS.
 */

interface HandoffRow {
  id: string;
  task_id: string;
  handed_by_id: string;
  handed_to_id: string;
  work_done: string;
  work_remaining: string;
  blockers: string | null;
  created_at: string;
  acknowledged_by_id: string | null;
  acknowledged_at: string | null;
}

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  active: boolean;
  supervisor_id: string | null;
  created_at: string;
}

function toUser(row: ProfileRow): User {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    active: row.active,
    supervisorId: row.supervisor_id,
    assignedCompanyIds: [],
    createdAt: row.created_at,
  };
}

function toHandoff(row: HandoffRow): TaskHandoff {
  return {
    id: row.id,
    taskId: row.task_id,
    handedById: row.handed_by_id,
    handedToId: row.handed_to_id,
    workDone: row.work_done,
    workRemaining: row.work_remaining,
    blockers: row.blockers,
    createdAt: row.created_at,
    acknowledgedById: row.acknowledged_by_id,
    acknowledgedAt: row.acknowledged_at,
  };
}

async function withUsers(handoffs: TaskHandoff[]): Promise<TaskHandoffWithUsers[]> {
  if (handoffs.length === 0) return [];
  // Not a plain `profiles` select — `profiles_select` RLS only ever exposes self/your own direct
  // reports, which is too narrow here (e.g. resolving the Supervisor who sent you a handoff).
  const userIds = handoffs.flatMap((h) => [h.handedById, h.handedToId, h.acknowledgedById].filter((x): x is string => x != null));
  const users = await resolveProfileDirectory(userIds);
  return handoffs.map((h) => {
    const handedBy = users.find((u) => u.id === h.handedById);
    const handedTo = users.find((u) => u.id === h.handedToId);
    if (!handedBy) throw new Error(`Handoff ${h.id} references unknown user ${h.handedById}`);
    if (!handedTo) throw new Error(`Handoff ${h.id} references unknown user ${h.handedToId}`);
    const acknowledgedBy = h.acknowledgedById ? (users.find((u) => u.id === h.acknowledgedById) ?? null) : null;
    return { ...h, handedBy, handedTo, acknowledgedBy };
  });
}

export const supabaseTaskHandoffsProvider: TaskHandoffsProvider = {
  async listHandoffsForTask(_viewer, taskId) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("task_handoffs")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return withUsers((data ?? []).map(toHandoff));
  },

  async listHandoffCandidates(_viewer, taskId) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("list_handoff_candidates", { target_task_id: taskId });
    if (error) throw new Error(error.message);
    return ((data ?? []) as ProfileRow[]).map(toUser);
  },

  async createHandoff(_viewer, taskId, input: TaskHandoffInput) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_task_handoff", {
      target_task_id: taskId,
      p_handed_to_id: input.handedToId,
      p_work_done: input.workDone,
      p_work_remaining: input.workRemaining,
      p_blockers: input.blockers,
    });
    if (error) throw new Error(error.message);
    const [hydrated] = await withUsers([toHandoff(data)]);
    return hydrated;
  },

  async acknowledgeHandoff(_viewer, handoffId) {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("acknowledge_task_handoff", { target_handoff_id: handoffId });
    if (error) throw new Error(error.message);
    const [hydrated] = await withUsers([toHandoff(data)]);
    return hydrated;
  },

  async listRecentHandoffs(_viewer, limit = 5): Promise<TeamHandoffActivity[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("task_handoffs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    const handoffs = (data ?? []).map(toHandoff);
    const hydrated = await withUsers(handoffs);
    if (hydrated.length === 0) return [];
    const taskIds = Array.from(new Set(hydrated.map((h) => h.taskId)));
    const { data: taskRows, error: taskError } = await supabase.from("tasks").select("id, title").in("id", taskIds);
    if (taskError) throw new Error(taskError.message);
    const titleById = new Map(((taskRows ?? []) as { id: string; title: string }[]).map((t) => [t.id, t.title]));
    return hydrated.map((h) => ({ ...h, taskTitle: titleById.get(h.taskId) ?? "Untitled task" }));
  },
};
