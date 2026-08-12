import type { TaskGroupBy, TaskPriority, TaskStatus } from "./task";

/**
 * Mirrors `TaskFilters` (`src/lib/data/hooks/use-task-filters.ts`) field-for-field. Declared
 * independently here rather than imported from that hook module, so this schema type doesn't
 * depend on a "use client" hook — keep the two shapes in sync if the filter fields ever change.
 * `groupBy` rides along here too — a saved view remembers how its tasks were clustered, not just
 * which ones were narrowed in.
 */
export interface SavedViewFilters {
  search: string;
  companyId: string;
  workstreamId: string;
  status: TaskStatus | "all";
  priority: TaskPriority | "all";
  assigneeId: string;
  groupBy: TaskGroupBy;
}

/**
 * A user's own saved task-filter combination — personal only, never shared, no team-views
 * concept yet. Reused as-is on both the Tasks list and My Day, since both already filter with
 * the same `TaskFilters` shape.
 */
export interface SavedView {
  id: string;
  userId: string;
  name: string;
  filters: SavedViewFilters;
  createdAt: string;
  updatedAt: string;
}
