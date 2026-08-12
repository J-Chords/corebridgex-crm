import type { Note } from "../../types";

export const seedNotes: Note[] = [
  // Company notes
  {
    id: "note-1",
    companyId: "company-1",
    taskId: null,
    authorId: "user-supervisor-1",
    type: "call",
    body: "Spoke with Marion about the Q2 close timeline — she wants the summary a week early this quarter.",
    createdAt: "2026-07-15T15:00:00.000Z",
  },
  {
    id: "note-2",
    companyId: "company-1",
    taskId: null,
    authorId: "user-employee-1",
    type: "internal",
    body: "Heads up: client mentioned they might add a payroll service line next quarter.",
    createdAt: "2026-07-19T16:30:00.000Z",
  },
  {
    id: "note-3",
    companyId: "company-6",
    taskId: null,
    authorId: "user-employee-3",
    type: "decision",
    body: "Decided to pause outreach after two unanswered check-ins — will revisit in Q4.",
    createdAt: "2026-07-11T11:00:00.000Z",
  },
  // Task notes
  {
    id: "note-4",
    companyId: null,
    taskId: "task-1",
    authorId: "user-supervisor-1",
    type: "meeting",
    body: "Reviewed the reconciliation approach with Alicia — agreed to flag anything over $500 for manual review.",
    createdAt: "2026-07-12T14:00:00.000Z",
  },
  {
    id: "note-5",
    companyId: null,
    taskId: "task-3",
    authorId: "user-employee-1",
    type: "call",
    body: "Client asked for one more revision round on the hero creative.",
    createdAt: "2026-07-14T10:00:00.000Z",
  },
  {
    id: "note-6",
    companyId: null,
    taskId: "task-5",
    authorId: "user-supervisor-1",
    type: "decision",
    body: "Blocked until the finance lead confirms which vendor entries are true duplicates vs. legitimate splits.",
    createdAt: "2026-07-22T09:00:00.000Z",
  },
];
