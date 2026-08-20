import type { ClientReportDepartmentSection, ClientReportLineItem, ClientReportLineItemSource, TaskStatus } from "./types";
import { dateKeyFromTimestamp } from "@/lib/planner-dates";
import { textMentionsStaffName } from "./client-report-name-scan";

/**
 * Phase 9D — the Weekly Client Report content generator. Pure functions only: no DB/mock/Supabase
 * access here, so the anti-double-counting contract is directly testable without any provider
 * plumbing. Both `mock-client-report-provider.ts` and `supabase-client-report-provider.ts` gather
 * their own already-real Tasks/TimeEntries/DailyUpdates/catalog data (each in its own established
 * flat-fetch-then-JS-join style) and hand it to `computeWeeklyReportSections` unchanged.
 *
 * LOCKED QUALIFYING-TASK RULE: a Task qualifies for the selected report period when
 * `status === "done"` AND its `statusChangedAt` falls within the period (Phase 9A audited this
 * timestamp as reliable — every status→done path stamps it, including checklist-auto-done).
 * `updatedAt`/`dueDate`/`createdAt` are never used as the completion signal.
 *
 * ANTI-DOUBLE-COUNTING CONTRACT (enforced by construction, not just convention):
 * - Every `ClientReportLineItem` is one (Task, work date) pair — its `minutes` is the sum of every
 *   legitimate contributor's Time Entry duration for that exact pair, computed exactly once here.
 * - The "weekly summary" a multi-day Task gets on screen/PDF is a PRESENTATION grouping over these
 *   same line items (see `groupLineItemsByTask` below) — it has no minutes field of its own anywhere
 *   in this module's output; every consumer must derive it live via `sum(items)`, never read or
 *   store a separate total.
 * - Department/activity/report totals (`client-report-totals.ts`, already existing and unchanged)
 *   already sum straight from `lineItems`, so they automatically inherit this guarantee for free.
 */

export interface WeeklyReportTaskInput {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  statusChangedAt: string | null;
  /** Caller is responsible for Project scoping (only Tasks belonging to the target Project's own
   * Workstreams should ever be passed in) — this module trusts that scope and does not re-derive
   * or re-check it itself. */
  activityId: string | null;
}

/**
 * Already-aggregated Actual Time evidence — one entry per (Task, local work date), summed across
 * every legitimate contributor by the caller BEFORE this module ever sees it (Phase 9D hotfix: the
 * Supabase provider gets this pre-aggregated from the hardened `get_client_report_weekly_evidence`
 * RPC, which sums directly in SQL so contributor identity/notes/correction history never has to
 * cross the wire to the browser at all; the mock provider aggregates its own in-memory Time
 * Entries the same way before calling in, using the identical `dateKeyFromTimestamp` local-date
 * rule). This module trusts `minutes` as already correctly summed and `date` as already the
 * correct local work date — it does no per-entry filtering or date-bucketing of its own.
 */
export interface WeeklyReportTimeEvidenceInput {
  taskId: string;
  /** YYYY-MM-DD, the local work date this aggregate belongs to. */
  date: string;
  minutes: number;
}

/** One Task-backed Daily Update entry, already flattened out of whichever confirmed
 * `DailyUpdate` it came from — `date` is that update's own (local-calendar-safe) work date. */
export interface WeeklyReportDailyUpdateEntryInput {
  date: string;
  sourceTaskId: string | null;
  details: string;
}

export interface WeeklyReportActivityCatalogEntry {
  id: string;
  name: string;
  departmentId: string;
  position: number;
}

export interface WeeklyReportDepartmentCatalogEntry {
  id: string;
  name: string;
  position: number;
}

export interface ComputeWeeklyReportInput {
  /** Already Project-scoped by the caller (every Task here belongs to a Workstream of the target Project) — this module never re-derives or re-validates Project scope itself. */
  tasks: WeeklyReportTaskInput[];
  /** Already-aggregated per (Task, local work date) — see `WeeklyReportTimeEvidenceInput`. This module still filters to the selected range and to qualifying Tasks; it does not need to filter by contributor or re-sum, since that already happened upstream. */
  timeEvidence: WeeklyReportTimeEvidenceInput[];
  /** Every Task-backed entry from a CONFIRMED Daily Update whose `sourceTaskId` is one of the Tasks above — the caller does not need to pre-filter by date, only by "confirmed" and "belongs to one of these Tasks." */
  dailyUpdateEntries: WeeklyReportDailyUpdateEntryInput[];
  activities: WeeklyReportActivityCatalogEntry[];
  departments: WeeklyReportDepartmentCatalogEntry[];
  /** Full names to scan candidate narrative text against before ever using it client-facing (Phase 9C Daily Update narrative can contain human-entered text/Handoff context that might name someone). */
  knownStaffNames: string[];
  /** YYYY-MM-DD, inclusive on both ends. */
  rangeStart: string;
  rangeEnd: string;
}

export interface ComputeWeeklyReportResult {
  departments: ClientReportDepartmentSection[];
  /** Internal-only generation notes (never rendered client-facing) — e.g. a completed Task with
   * zero legitimate tracked time in range, or a narrative discarded for containing a staff name. */
  warnings: string[];
}

function inRange(dateKey: string, rangeStart: string, rangeEnd: string): boolean {
  return dateKey >= rangeStart && dateKey <= rangeEnd;
}

/**
 * The core algorithm. For each qualifying Task, sums every legitimate contributor's Time Entry
 * minutes per work date (Section 12 — multi-employee aggregation, contributor identity never
 * reaches the output), resolves one safe narrative per (Task, date) with the locked precedence
 * (confirmed Daily Update → Task description → Task title, each screened for staff names before
 * use), and buckets the resulting line items into the Task's own Activity/Department exactly like
 * the pre-9D algorithm did — Service/Activity grouping is unchanged, only *which* line items exist
 * and *how they're identified* (via `taskId`/`taskLabel`, new in 9D) changed.
 */
export function computeWeeklyReportSections(input: ComputeWeeklyReportInput): ComputeWeeklyReportResult {
  const warnings: string[] = [];
  const { rangeStart, rangeEnd } = input;

  // 1. Qualifying Tasks — status=done AND statusChangedAt's LOCAL work date falls in range.
  const qualifyingTasks = input.tasks.filter((t) => {
    if (t.status !== "done" || !t.statusChangedAt) return false;
    return inRange(dateKeyFromTimestamp(t.statusChangedAt), rangeStart, rangeEnd);
  });
  const qualifyingTaskIds = new Set(qualifyingTasks.map((t) => t.id));

  // 2. Sum already-aggregated evidence per (taskId, workDateKey) — the caller has already summed
  // every legitimate contributor's minutes and bucketed by local work date (see
  // WeeklyReportTimeEvidenceInput's own doc comment for why); this loop only filters to qualifying
  // Tasks and the selected range, plus a defensive re-sum in case the caller ever hands in more
  // than one evidence row for the same (task, date) key.
  const minutesByTaskDate = new Map<string, number>();
  function keyFor(taskId: string, dateKey: string) {
    return `${taskId}::${dateKey}`;
  }
  for (const ev of input.timeEvidence) {
    if (!qualifyingTaskIds.has(ev.taskId)) continue;
    if (!inRange(ev.date, rangeStart, rangeEnd)) continue;
    const key = keyFor(ev.taskId, ev.date);
    minutesByTaskDate.set(key, (minutesByTaskDate.get(key) ?? 0) + ev.minutes);
  }

  // 3. Candidate Daily Update narratives per (taskId, dateKey) — confirmed entries only (the
  // caller only ever passes confirmed ones), grouped so a safe one can be picked deterministically.
  const dailyUpdateCandidatesByTaskDate = new Map<string, string[]>();
  for (const e of input.dailyUpdateEntries) {
    if (!e.sourceTaskId || !qualifyingTaskIds.has(e.sourceTaskId)) continue;
    if (!inRange(e.date, rangeStart, rangeEnd)) continue;
    if (!e.details.trim()) continue;
    const key = keyFor(e.sourceTaskId, e.date);
    const list = dailyUpdateCandidatesByTaskDate.get(key) ?? [];
    list.push(e.details);
    dailyUpdateCandidatesByTaskDate.set(key, list);
  }

  // 4. Every (taskId, dateKey) pair that has EITHER tracked time OR a completed-task presence —
  // a zero-time completed Task is handled separately (step 6) since it has no dated line at all.
  const taskDateKeys = Array.from(minutesByTaskDate.keys());

  // `source` must be truthful: it may say "daily-update" ONLY when the Details actually came from
  // one (Phase 9D hotfix) — a candidate that existed but was rejected for naming a staff member,
  // falling through to the Task description/title, must be recorded as "raw," never "daily-update."
  function resolveNarrative(task: WeeklyReportTaskInput, dateKey: string): { details: string; source: ClientReportLineItemSource } {
    const candidates = dailyUpdateCandidatesByTaskDate.get(keyFor(task.id, dateKey)) ?? [];
    for (const candidate of candidates) {
      const mentionsStaffName = input.knownStaffNames.some((fullName) => textMentionsStaffName(candidate, fullName));
      if (!mentionsStaffName) return { details: candidate, source: "daily-update" };
      warnings.push(`Daily Update narrative for "${task.title}" on ${dateKey} mentioned a staff name and was not used — fell back to the Task description/title instead.`);
    }
    if (task.description && task.description.trim()) return { details: task.description.trim(), source: "raw" };
    return { details: task.title, source: "raw" };
  }

  const lineItemsByTask = new Map<string, ClientReportLineItem[]>();
  for (const key of taskDateKeys) {
    const [taskId, dateKey] = splitKey(key);
    const task = qualifyingTasks.find((t) => t.id === taskId);
    if (!task) continue;
    const minutes = minutesByTaskDate.get(key)!;
    const { details, source } = resolveNarrative(task, dateKey);
    const item: ClientReportLineItem = {
      id: crypto.randomUUID(),
      date: dateKey,
      minutes,
      details,
      source,
      taskId: task.id,
      taskLabel: task.title,
    };
    const list = lineItemsByTask.get(taskId) ?? [];
    list.push(item);
    lineItemsByTask.set(taskId, list);
  }

  // 5. Zero-time completed Tasks: qualifying, but no legitimate tracked time anywhere in range.
  // Chosen behavior (Section 23): omit from duration-bearing lines rather than inventing a Duration
  // — this app's ClientReportLineItem.minutes is a non-nullable number with no "no data" sentinel
  // today, and adding one would ripple through every sum/format call site for a presentation-only
  // need; a completed Task with truly nothing tracked is surfaced as an internal generation warning
  // instead, so nothing implies a false Duration of 0 minutes was actually measured.
  for (const task of qualifyingTasks) {
    if (lineItemsByTask.has(task.id)) continue;
    warnings.push(`"${task.title}" was completed in this range but has no legitimate tracked time — omitted from duration-bearing lines.`);
  }

  // 6. Bucket every Task's line items into its own Activity/Department — identical grouping shape
  // to the pre-9D algorithm, just fed from Task-derived line items instead of contributor-day ones.
  interface DeptAccum {
    departmentId: string;
    departmentName: string;
    position: number;
    activities: Map<string, { activityId: string; activityName: string; position: number; lineItems: ClientReportLineItem[] }>;
  }
  const departmentsById = new Map<string, DeptAccum>();
  const otherLineItems: ClientReportLineItem[] = [];

  for (const [taskId, items] of lineItemsByTask) {
    const task = qualifyingTasks.find((t) => t.id === taskId)!;
    items.sort((a, b) => a.date.localeCompare(b.date));
    if (!task.activityId) {
      otherLineItems.push(...items);
      continue;
    }
    const activity = input.activities.find((a) => a.id === task.activityId);
    if (!activity) {
      otherLineItems.push(...items);
      continue;
    }
    const department = input.departments.find((d) => d.id === activity.departmentId);
    if (!department) {
      otherLineItems.push(...items);
      continue;
    }
    let dept = departmentsById.get(department.id);
    if (!dept) {
      dept = { departmentId: department.id, departmentName: department.name, position: department.position, activities: new Map() };
      departmentsById.set(department.id, dept);
    }
    let act = dept.activities.get(activity.id);
    if (!act) {
      act = { activityId: activity.id, activityName: activity.name, position: activity.position, lineItems: [] };
      dept.activities.set(activity.id, act);
    }
    act.lineItems.push(...items);
  }

  const departments: ClientReportDepartmentSection[] = Array.from(departmentsById.values())
    .sort((a, b) => a.position - b.position)
    .map((d) => ({
      departmentId: d.departmentId,
      departmentName: d.departmentName,
      activities: Array.from(d.activities.values())
        .sort((a, b) => a.position - b.position)
        .map(({ activityId, activityName, lineItems }) => ({
          activityId,
          activityName,
          lineItems: lineItems.sort((a, b) => a.date.localeCompare(b.date)),
        })),
    }));

  if (otherLineItems.length > 0) {
    departments.push({
      departmentId: null,
      departmentName: "Other",
      activities: [
        {
          activityId: null,
          activityName: "Untagged work",
          lineItems: otherLineItems.sort((a, b) => a.date.localeCompare(b.date)),
        },
      ],
    });
  }

  return { departments, warnings };
}

function splitKey(key: string): [string, string] {
  const idx = key.lastIndexOf("::");
  return [key.slice(0, idx), key.slice(idx + 2)];
}

/** One (line item, its original position in the ungrouped array) pair — the index is what the
 * existing editable-report mutation handlers (`onLineChange(deptIndex, activityIndex, lineIndex,
 * ...)` etc.) address, so grouping for display must never lose it. */
export interface IndexedLineItem {
  item: ClientReportLineItem;
  index: number;
}

/** One entry per distinct `taskId` in `items` (in first-seen order), plus one entry per item with
 * no `taskId` (legacy rows, and every manually-added line, render standalone — never grouped). The
 * group's `totalMinutes` is ALWAYS `sum(items)`, computed here, never read from storage — this is
 * the one and only place a "weekly summary" number is produced, and it is recomputed on every call,
 * so an edited detail line's new minutes value is reflected immediately with no separate value to
 * keep in sync. A group with exactly one item has nothing worth summarizing separately from that
 * one line — callers should render it as a plain single row, not a "summary of 1."
 */
export interface TaskLineGroup {
  taskId: string | null;
  taskLabel: string | null;
  totalMinutes: number;
  items: IndexedLineItem[];
}

export function groupLineItemsByTask(items: ClientReportLineItem[]): TaskLineGroup[] {
  const groups: TaskLineGroup[] = [];
  const groupByTaskId = new Map<string, TaskLineGroup>();
  items.forEach((item, index) => {
    if (!item.taskId) {
      groups.push({ taskId: null, taskLabel: item.taskLabel ?? null, totalMinutes: item.minutes, items: [{ item, index }] });
      return;
    }
    let group = groupByTaskId.get(item.taskId);
    if (!group) {
      group = { taskId: item.taskId, taskLabel: item.taskLabel ?? null, totalMinutes: 0, items: [] };
      groupByTaskId.set(item.taskId, group);
      groups.push(group);
    }
    group.items.push({ item, index });
    group.totalMinutes += item.minutes;
  });
  return groups;
}
