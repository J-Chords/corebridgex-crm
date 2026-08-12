import type { User } from "@/lib/data/types";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import { computeWorkload, type WorkloadLevel } from "@/lib/data/workload";
import { formatExpectedTime } from "@/lib/data/expected-time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

function initials(fullName: string) {
  return fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const LEVEL_BADGE_VARIANT: Record<WorkloadLevel, "success" | "warning" | "destructive"> = {
  available: "success",
  busy: "warning",
  "at-capacity": "destructive",
};

interface TeamWorkloadCardProps {
  members: User[];
  tasks: TaskWithRelations[];
}

/** Per-person active-task load across a team — doubles as a lightweight capacity view. Real data only: no invented capacity target, just active task counts and their own expected-hours estimates. */
export function TeamWorkloadCard({ members, tasks }: TeamWorkloadCardProps) {
  const rows = members.map((member) => {
    const activeTasks = tasks.filter(
      (t) => t.status !== "done" && t.assignees.some((a) => a.id === member.id)
    );
    const expectedMinutes = activeTasks.reduce((sum, t) => sum + (t.expectedMinutes ?? 0), 0);
    return { member, activeCount: activeTasks.length, expectedMinutes, workload: computeWorkload(activeTasks.length) };
  });

  const maxCount = Math.max(1, ...rows.map((r) => r.activeCount));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Team Workload</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No team members yet.</p>
        ) : (
          rows.map(({ member, activeCount, expectedMinutes, workload }, i) => {
            const pct = Math.round((activeCount / maxCount) * 100);
            return (
              <div
                key={member.id}
                className={cn(
                  "-mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/60",
                  STAGGER_ITEM_CLASS
                )}
                style={staggerDelay(i)}
              >
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className="text-xs">{initials(member.fullName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{member.fullName}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {expectedMinutes > 0
                        ? `${activeCount} active · ${formatExpectedTime(expectedMinutes)} est.`
                        : `${activeCount} active`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <Badge variant={LEVEL_BADGE_VARIANT[workload.level]} className="shrink-0">
                  {workload.label}
                </Badge>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
