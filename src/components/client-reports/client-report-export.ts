import type { ClientReport } from "@/lib/data/types";
import { formatMinutes } from "@/lib/format-minutes";

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Department/Activity/Date/Duration/Details only — no generatedByName, no comments, no history. Nothing here is ever a staff name by construction. */
function reportToCsv(report: ClientReport): string {
  const rows: string[][] = [["Department", "Activity", "Date", "Duration", "Details"]];
  for (const dept of report.departments) {
    for (const activity of dept.activities) {
      for (const item of activity.lineItems) {
        rows.push([dept.departmentName, activity.activityName, item.date, formatMinutes(item.minutes), item.details]);
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
