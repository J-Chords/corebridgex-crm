import type { SavedView } from "../../types";

/** A couple of illustrative examples per user, so the feature is visible without saving one first. */
export const seedSavedViews: SavedView[] = [
  {
    id: "saved-view-1",
    userId: "user-employee-1",
    name: "High priority",
    filters: {
      search: "",
      companyId: "all",
      workstreamId: "all",
      status: "all",
      priority: "high",
      assigneeId: "all",
      groupBy: "company",
    },
    createdAt: "2026-07-22T09:00:00.000Z",
    updatedAt: "2026-07-22T09:00:00.000Z",
  },
  {
    id: "saved-view-2",
    userId: "user-employee-1",
    name: "Waiting on client",
    filters: {
      search: "",
      companyId: "all",
      workstreamId: "all",
      status: "waiting-on-client",
      priority: "all",
      assigneeId: "all",
      groupBy: "none",
    },
    createdAt: "2026-07-23T09:00:00.000Z",
    updatedAt: "2026-07-23T09:00:00.000Z",
  },
  {
    id: "saved-view-3",
    userId: "user-supervisor-1",
    name: "Sparing – in progress",
    filters: {
      search: "",
      companyId: "company-1",
      workstreamId: "all",
      status: "in-progress",
      priority: "all",
      assigneeId: "all",
      groupBy: "workstream",
    },
    createdAt: "2026-07-24T09:00:00.000Z",
    updatedAt: "2026-07-24T09:00:00.000Z",
  },
];
