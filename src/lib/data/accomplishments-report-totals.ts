import type {
  AccomplishmentsReportActivityLine,
  AccomplishmentsReportBrandSection,
  AccomplishmentsReportDepartment,
} from "./types";

/** Every checklist line in a brand section — its departments' activities plus its own "Other" catch-all (a sibling of `departments`, not inside one), counted only while `otherIncluded`. */
function allLines(section: AccomplishmentsReportBrandSection): AccomplishmentsReportActivityLine[] {
  return [...section.departments.flatMap((d) => d.activities), ...(section.otherIncluded ? [section.other] : [])];
}

function hasContent(line: AccomplishmentsReportActivityLine): boolean {
  return line.done || line.detail.trim() !== "";
}

/**
 * What a reader/exported document ever sees: individual activities with real content
 * (auto-detected or filled in by hand), departments left with at least one such activity, and
 * whole brand sections with nothing to show at all — mirroring `visibleDepartments` in
 * `client-report-totals.ts`. Filtering activity-by-activity (not just department-by-department)
 * matters because a department can hold both a real, auto-detected activity and a separate one
 * added by hand via "+ Add service" that never got filled in — the department as a whole has
 * content, but that one added-and-abandoned row still shouldn't reach a reader. While `editable`,
 * everything currently in the draft renders as-is, so the owner can see an empty added row and fill
 * it in across sessions.
 */
export function visibleBrandSections(
  sections: AccomplishmentsReportBrandSection[],
  editable: boolean
): AccomplishmentsReportBrandSection[] {
  if (editable) return sections;
  return sections
    .map((section) => ({
      ...section,
      departments: section.departments
        .map((dept) => ({ ...dept, activities: dept.activities.filter(hasContent) }))
        .filter((dept) => dept.activities.length > 0),
      otherIncluded: section.otherIncluded && hasContent(section.other),
    }))
    .filter((section) => section.departments.length > 0 || section.otherIncluded);
}

export function countActivities(sections: AccomplishmentsReportBrandSection[]): number {
  return sections.reduce((sum, s) => sum + allLines(s).length, 0);
}

export function countCompleted(sections: AccomplishmentsReportBrandSection[]): number {
  return sections.reduce((sum, s) => sum + allLines(s).filter((l) => l.done).length, 0);
}

/** Whole percent, 0 when there's nothing to complete yet (never a divide-by-zero NaN). */
export function completionPercent(sections: AccomplishmentsReportBrandSection[]): number {
  const total = countActivities(sections);
  return total === 0 ? 0 : Math.round((countCompleted(sections) / total) * 100);
}

export function countDepartmentActivities(department: AccomplishmentsReportDepartment): number {
  return department.activities.length;
}

export function countDepartmentCompleted(department: AccomplishmentsReportDepartment): number {
  return department.activities.filter((l) => l.done).length;
}
