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
 */
function reportToCsv(report: ClientReport): string {
  const rows: string[][] = [["Service", "Activity", "Task", "Date", "Duration", "Details"]];
  for (const dept of report.departments) {
    for (const activity of dept.activities) {
      for (const item of activity.lineItems) {
        rows.push([dept.departmentName, activity.activityName, item.taskLabel ?? "", item.date, formatMinutes(item.minutes), item.details]);
      }
    }
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
