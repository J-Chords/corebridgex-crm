import type { TaskHandoff, User } from "../types";

export interface TaskHandoffWithUsers extends TaskHandoff {
  handedBy: User;
  handedTo: User;
  acknowledgedBy: User | null;
}

export interface TaskHandoffInput {
  handedToId: string;
  workDone: string;
  workRemaining: string;
  blockers: string | null;
}

/**
 * Contract every provider (mock, Supabase, future AWS) must implement.
 * Read/write share the task visibility gate (anyone who can see the task can
 * hand it off — not manager-gated, same philosophy as notes); who a handoff
 * can be addressed *to* is separately restricted to people who already have
 * access to the task (src/lib/data/permissions.ts).
 */
export interface TeamHandoffActivity extends TaskHandoffWithUsers {
  taskTitle: string;
}

export interface TaskHandoffsProvider {
  listHandoffsForTask(viewer: User, taskId: string): Promise<TaskHandoffWithUsers[]>;
  /** Candidate recipients for a new handoff on this task. */
  listHandoffCandidates(viewer: User, taskId: string): Promise<User[]>;
  createHandoff(viewer: User, taskId: string, input: TaskHandoffInput): Promise<TaskHandoffWithUsers>;
  acknowledgeHandoff(viewer: User, handoffId: string): Promise<TaskHandoffWithUsers>;
  /**
   * Most recent handoffs the viewer can see (same `canAccessTask` gate as everything else here —
   * supervisor gets their team's, superadmin gets everyone's), newest first, capped to `limit`.
   * Feeds a "recent activity" dashboard panel; not paginated, this is a small recent-N read.
   */
  listRecentHandoffs(viewer: User, limit?: number): Promise<TeamHandoffActivity[]>;
}
