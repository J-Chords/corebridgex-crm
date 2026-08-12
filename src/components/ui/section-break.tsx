import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface SectionBreakProps {
  /** Short ordinal, e.g. "01" — rendered in the primary color, mirroring the reference's numbered dividers. */
  num: string;
  label: string;
  className?: string;
}

/** Mono, uppercase divider between dashboard sections — "01 · TODAY" flanked by rules. */
export function SectionBreak({ num, label, className }: SectionBreakProps) {
  return (
    <div className={cn("flex items-center gap-4 py-1", className)}>
      <Separator className="flex-1" />
      <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] whitespace-nowrap uppercase">
        <span className="text-primary">{num}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{label}</span>
      </span>
      <Separator className="flex-1" />
    </div>
  );
}
