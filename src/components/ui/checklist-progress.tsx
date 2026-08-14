import { cn } from "@/lib/utils";

export interface ChecklistProgressProps {
  done: number;
  total: number;
  className?: string;
  label?: string;
  /** Shown when total === 0 — defaults to "No checklist" (a Task's own checklist state). Override when this same bar is reused for a different rollup, e.g. a Workstream's task count, where "No checklist" would be a confusing thing to say about zero *tasks*. */
  emptyLabel?: string;
}

/** Progress bar from the reference's `.progress-track`/`.progress-fill` pattern, with real ARIA semantics. */
export function ChecklistProgress({ done, total, className, label, emptyLabel = "No checklist" }: ChecklistProgressProps) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {(label || total > 0) && (
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">{label}</span>
          <span className="font-mono text-muted-foreground">
            {total === 0 ? emptyLabel : `${done}/${total} · ${percent}%`}
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Checklist progress"}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            percent === 100 ? "bg-success" : "bg-primary"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
