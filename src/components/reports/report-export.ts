import type { AccomplishmentsReport } from "@/lib/data/types";

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function hasContent(line: { done: boolean; detail: string }): boolean {
  return line.done || line.detail.trim() !== "";
}

/** An activity with nothing ticked or written is a manually-added service left empty — an export always represents the finished record, so it's skipped here regardless of the report's current draft/finalized status. A department can hold both a real activity and a separate empty one added by hand, so this filters activity-by-activity, not just department-by-department. Same for `other`, gated on `otherIncluded` too. */
function reportToCsv(report: AccomplishmentsReport): string {
  const rows: string[][] = [["Brand", "Department", "Activity", "Done", "Detail"]];
  for (const section of report.brandSections) {
    for (const dept of section.departments) {
      for (const line of dept.activities) {
        if (!hasContent(line)) continue;
        rows.push([section.brandName, dept.departmentName, line.activityName, line.done ? "Yes" : "No", line.detail]);
      }
    }
    if (section.otherIncluded && hasContent(section.other)) {
      rows.push([section.brandName, "—", section.other.activityName, section.other.done ? "Yes" : "No", section.other.detail]);
    }
  }
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n");
}

/** No CSV library needed — this is a flat, small document, plain string-building is genuinely simplest. */
export function downloadReportCsv(report: AccomplishmentsReport) {
  const csv = reportToCsv(report);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `accomplishments-${report.subjectLabel.replace(/\s+/g, "-").toLowerCase()}-${report.rangeStart}-to-${report.rangeEnd}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
