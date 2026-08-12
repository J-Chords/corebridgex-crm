import type { ClientReportActivitySection, ClientReportDepartmentSection, ClientReportLineItem } from "./types";

/** Totals are always derived from `lineItems`, never stored redundantly — there's no "stale total after an edit" bug class to worry about. */
export function sumLineItems(items: ClientReportLineItem[]): number {
  return items.reduce((sum, item) => sum + item.minutes, 0);
}

export function sumActivity(activity: ClientReportActivitySection): number {
  return sumLineItems(activity.lineItems);
}

export function sumDepartment(department: ClientReportDepartmentSection): number {
  return department.activities.reduce((sum, activity) => sum + sumActivity(activity), 0);
}

export function sumAllDepartments(departments: ClientReportDepartmentSection[]): number {
  return departments.reduce((sum, dept) => sum + sumDepartment(dept), 0);
}

export function countActivities(departments: ClientReportDepartmentSection[]): number {
  return departments.reduce((sum, dept) => sum + dept.activities.length, 0);
}

export function countDistinctDates(departments: ClientReportDepartmentSection[]): number {
  const dates = new Set<string>();
  for (const dept of departments) {
    for (const activity of dept.activities) {
      for (const item of activity.lineItems) dates.add(item.date);
    }
  }
  return dates.size;
}

/**
 * Strips activities with zero line items (and departments left with zero activities as a result) —
 * a manually-added-but-not-yet-filled-in section, or one emptied by deleting its last line. Only the
 * owner's own editable draft should ever see an empty placeholder (so they know to fill it in or
 * remove it); every other consumer — a non-owner's read-only view, the KPI band, the section-jump
 * rail, a finalized report, and the printed/exported document — should never show or count one.
 */
export function visibleDepartments(
  departments: ClientReportDepartmentSection[],
  editable: boolean
): ClientReportDepartmentSection[] {
  if (editable) return departments;
  return departments
    .map((dept) => ({ ...dept, activities: dept.activities.filter((a) => a.lineItems.length > 0) }))
    .filter((dept) => dept.activities.length > 0);
}
