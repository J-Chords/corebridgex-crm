import { Building2, CalendarDays, ClipboardList, Clock } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { formatMinutes } from "@/lib/format-minutes";
import { countActivities, countDistinctDates, sumAllDepartments } from "@/lib/data/client-report-totals";
import type { ClientReportDepartmentSection } from "@/lib/data/types";

interface ClientReportKpiBandProps {
  departments: ClientReportDepartmentSection[];
}

/** The ACAS "KPI band" pattern, adapted to this report's own domain — real numbers only, nothing invented (no fabricated cost/financial figures, since this isn't a payroll report). Reuses the shared `StatCard` primitive. */
export function ClientReportKpiBand({ departments }: ClientReportKpiBandProps) {
  const totalMinutes = sumAllDepartments(departments);
  const activityCount = countActivities(departments);
  const daysCovered = countDistinctDates(departments);
  const departmentCount = departments.length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Total Hours"
        value={formatMinutes(totalMinutes)}
        icon={Clock}
        className={STAGGER_ITEM_CLASS}
        style={staggerDelay(0)}
      />
      <StatCard
        label="Activities Covered"
        value={String(activityCount)}
        icon={ClipboardList}
        className={STAGGER_ITEM_CLASS}
        style={staggerDelay(1)}
      />
      <StatCard
        label="Days With Activity"
        value={String(daysCovered)}
        icon={CalendarDays}
        className={STAGGER_ITEM_CLASS}
        style={staggerDelay(2)}
      />
      <StatCard
        label="Departments"
        value={String(departmentCount)}
        icon={Building2}
        className={STAGGER_ITEM_CLASS}
        style={staggerDelay(3)}
      />
    </div>
  );
}
