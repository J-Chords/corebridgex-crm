import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ContainedIcon } from "@/components/ui/contained-icon";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: string;
  icon?: LucideIcon;
  caption?: string;
  delta?: { direction: "up" | "down"; text: string };
  className?: string;
}

/** Stat card from the reference: uppercase micro label, large display value, optional trend delta. */
export function StatCard({ label, value, icon: Icon, caption, delta, className }: StatCardProps) {
  return (
    <Card className={cn("transition-transform duration-300 ease-spring hover:-translate-y-1", className)}>
      <CardContent className="flex flex-col gap-3 py-1">
        <div className="flex items-center justify-between">
          <span className="text-xs tracking-wider text-muted-foreground uppercase">{label}</span>
          {Icon ? (
            <ContainedIcon size="sm" tone="neutral">
              <Icon aria-hidden="true" />
            </ContainedIcon>
          ) : null}
        </div>
        <span className="text-3xl font-semibold tracking-tight text-primary">{value}</span>
        {delta ? (
          <span
            className={cn(
              "text-xs font-medium",
              delta.direction === "up" ? "text-success" : "text-destructive"
            )}
          >
            {delta.direction === "up" ? "↑" : "↓"} {delta.text}
          </span>
        ) : caption ? (
          <span className="text-xs text-muted-foreground">{caption}</span>
        ) : null}
      </CardContent>
    </Card>
  );
}
