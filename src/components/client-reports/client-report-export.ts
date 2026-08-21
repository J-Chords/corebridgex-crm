import type { ClientReport } from "@/lib/data/types";
import { formatMinutes } from "@/lib/format-minutes";

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Service/Activity/Task/Date/Duration/Details only — no generatedByName, no comments, no history.
 * Nothing here is ever a staff name by construction. One row per actual dated detail row (Phase
 * 9D) — never an additional row for a multi-day Task's presentation-only weekly summary, since a
 * spreadsheet SUM over the Duration column must equal Total Week Hours exactly once per Time Entry,
 * not twice. `Task` repeats as plain descriptive text across a multi-day Task's own rows; it is
 * never itself a duration-bearing row.
 *
 * Phase 9F — when `dailyVisitMinutes` is a real number (not a legacy `null`), a `Record Type`
 * column distinguishes one extra "Visit" total row from every ordinary "Task" row, so a
 * spreadsheet `SUM` over Duration double-counts nothing: it's `Total Week Hours + Daily Visit Hours`
 * by construction, since both kinds of row are already mutually exclusive minutes. Deliberately NO
 * additional numeric "Grand Total" row is ever emitted — that would be the one sum a naive
 * `SUM(Duration)` could double-count. Agenda text is internal by default (Section 28), so the Visit
 * row's Details column stays blank rather than leaking it into a client-facing export.
 */
function reportToCsv(report: ClientReport): string {
  const hasVisitColumn = report.dailyVisitMinutes !== null;
  const header = hasVisitColumn
    ? ["Record Type", "Service", "Activity", "Task", "Date", "Duration", "Details"]
    : ["Service", "Activity", "Task", "Date", "Duration", "Details"];
  const rows: string[][] = [header];
  for (const dept of report.departments) {
    for (const activity of dept.activities) {
      for (const item of activity.lineItems) {
        const row = [dept.departmentName, activity.activityName, item.taskLabel ?? "", item.date, formatMinutes(item.minutes), item.details];
        rows.push(hasVisitColumn ? ["Task", ...row] : row);
      }
    }
  }
  if (hasVisitColumn) {
    rows.push(["Visit", "", "", "", "", formatMinutes(report.dailyVisitMinutes!), ""]);
  }
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n");
}

/** Filename is built only from `companyLabel` + the date range — never a staff name, matching the same name-safety rule as the document itself. */
export function downloadClientReportCsv(report: ClientReport) {
  const csv = reportToCsv(report);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${report.companyLabel.replace(/\s+/g, "-").toLowerCase()}-client-report-${report.rangeStart}-to-${report.rangeEnd}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
