import { CheckCircle2, ClipboardList, Layers, Percent } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { completionPercent, countActivities, countCompleted } from "@/lib/data/accomplishments-report-totals";
import type { AccomplishmentsReportBrandSection } from "@/lib/data/types";

interface ReportKpiBandProps {
  sections: AccomplishmentsReportBrandSection[];
}

/**
 * The same ACAS "KPI band" pattern Client Reports already uses, adapted to this report's checklist
 * domain — completion counts, not durations (a checklist line has no structured time field the way a
 * client report's line item does). Reuses the shared `StatCard` primitive, not a bespoke card.
 */
export function ReportKpiBand({ sections }: ReportKpiBandProps) {
  const total = countActivities(sections);
  const completed = countCompleted(sections);
  const percent = completionPercent(sections);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Total Activities"
        value={String(total)}
        icon={ClipboardList}
        className={STAGGER_ITEM_CLASS}
        style={staggerDelay(0)}
      />
      <StatCard
        label="Completed"
        value={String(completed)}
        icon={CheckCircle2}
        className={STAGGER_ITEM_CLASS}
        style={staggerDelay(1)}
      />
      <StatCard
        label="Completion"
        value={`${percent}%`}
        icon={Percent}
        className={STAGGER_ITEM_CLASS}
        style={staggerDelay(2)}
      />
      <StatCard
        label="Sections"
        value={String(sections.length)}
        icon={Layers}
        className={STAGGER_ITEM_CLASS}
        style={staggerDelay(3)}
      />
    </div>
  );
}
