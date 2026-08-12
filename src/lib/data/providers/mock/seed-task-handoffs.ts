import type { TaskHandoff } from "../../types";

export const seedTaskHandoffs: TaskHandoff[] = [
  // Acknowledged: Priya handed part of the Q2 reconciliation to Alicia, who's picked it up.
  {
    id: "handoff-1",
    taskId: "task-1",
    handedById: "user-supervisor-1",
    handedToId: "user-employee-1",
    workDone: "Pulled the Q2 general ledger and matched about 60% of transactions.",
    workRemaining: "Finish matching the remaining transactions and resolve the two flagged discrepancies.",
    blockers: null,
    createdAt: "2026-07-15T10:00:00.000Z",
    acknowledgedById: "user-employee-1",
    acknowledgedAt: "2026-07-15T14:30:00.000Z",
  },
  // Pending: Marcus handed the zoning consult prep to Leo — not yet acknowledged.
  {
    id: "handoff-2",
    taskId: "task-11",
    handedById: "user-supervisor-2",
    handedToId: "user-employee-4",
    workDone: "Drafted the zoning consult briefing outline and gathered the property survey docs.",
    workRemaining: "Finalize talking points and confirm the attendee list with the client.",
    blockers: "Waiting on the client to confirm which stakeholders will attend.",
    createdAt: "2026-07-24T09:00:00.000Z",
    acknowledgedById: null,
    acknowledgedAt: null,
  },
];
