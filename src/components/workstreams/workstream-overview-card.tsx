import type { CSSProperties } from "react";
import Link from "next/link";
import type { WorkstreamWithRelations } from "@/lib/data/providers/workstreams-provider";
import { workstreamDisplayHeading } from "@/lib/data/workstream-name";
import { ChecklistProgress } from "@/components/ui/checklist-progress";
import { BudgetBarCompact } from "@/components/ui/budget-bar";
import { RecurrenceIndicatorCompact } from "@/components/workstreams/recurrence-indicator";
import { cn } from "@/lib/utils";

/** A small, deterministic palette so each brand gets a consistent tile color across the app — not real "brand color" data (none exists), just a stable visual cue derived from the brand id. */
const TILE_COLORS = ["var(--info)", "var(--success)", "var(--warning)", "var(--primary)"];

function brandInitials(name: string) {
  return name
    .split(" ")
    .map((word) => word[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function brandColor(brandId: string) {
  let hash = 0;
  for (let i = 0; i < brandId.length; i++) hash = (hash * 31 + brandId.charCodeAt(i)) >>> 0;
  return TILE_COLORS[hash % TILE_COLORS.length];
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface WorkstreamOverviewCardProps {
  workstream: WorkstreamWithRelations;
  className?: string;
  style?: CSSProperties;
}

/** Compact project-overview card — brand tile, name + client, progress bar, task count, renewal date. Everything else stays one click away on the workstream detail page. */
export function WorkstreamOverviewCard({ workstream, className, style }: WorkstreamOverviewCardProps) {
  const renewalDate = formatDate(workstream.endDate);

  return (
    <Link
      href={`/dashboard/workstreams/${workstream.id}`}
      style={style}
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-all duration-300 ease-spring hover:-translate-y-1 hover:border-primary/40 hover:shadow-md",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white"
          style={{ backgroundColor: brandColor(workstream.brand.id) }}
          aria-hidden="true"
        >
          {brandInitials(workstream.brand.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {workstreamDisplayHeading(workstream.name, workstream.serviceLine?.name ?? null)}
          </p>
          <p className="truncate text-xs text-muted-foreground">{workstream.company.name}</p>
        </div>
      </div>

      <ChecklistProgress done={workstream.doneTaskCount} total={workstream.taskCount} />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {workstream.taskCount} task{workstream.taskCount === 1 ? "" : "s"}
        </span>
        {renewalDate && <span>Renews {renewalDate}</span>}
      </div>

      <BudgetBarCompact budget={workstream.budget} />
      {workstream.recurrence && <RecurrenceIndicatorCompact recurrence={workstream.recurrence} />}
    </Link>
  );
}
