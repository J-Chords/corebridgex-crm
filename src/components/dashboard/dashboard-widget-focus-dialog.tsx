"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DashboardWidgetFocusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** e.g. "12 active workstreams" — shown right under the title. */
  description?: string;
  children: ReactNode;
  /** A legitimate destination for the full underlying view — omit when none exists. */
  viewAllHref?: string;
  viewAllLabel?: string;
}

/**
 * The ONE Expand destination for an individual bounded Dashboard widget (Team Workload, My Tasks, My
 * Workstreams, Recent Firm Activity, etc.) — a temporary full-page-feeling workspace, deliberately
 * much larger than the KPI cards' own `DashboardDetailDrawer` (that one stays as-is; the two serve
 * different purposes — see stat-card.tsx). Sized to nearly the entire viewport on every screen size,
 * on purpose: a fixed px cap (e.g. max-w-[1680px]) would shrink noticeably on an ordinary 1920px+
 * monitor, so width/height are pure viewport-relative `calc()` expressions with only a small outer
 * margin — no `max-w`/`max-h` ceiling at all. The base `DialogContent` primitive ships its own
 * `max-w-[calc(100%-2rem)]` (unprefixed) AND `sm:max-w-sm` (a SEPARATE modifier group `cn`/twMerge
 * won't touch unless something in the same `sm:` group is provided) — both are explicitly neutralized
 * below via `max-w-none`/`sm:max-w-none` so neither can silently cap this dialog at real desktop
 * widths. The Dashboard stays mounted (and dimmed) behind it. Numbered Dashboard SECTION headings
 * never get one of these — only the individual widgets they contain do.
 */
export function DashboardWidgetFocusDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  viewAllHref,
  viewAllLabel = "View all",
}: DashboardWidgetFocusDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-w-none! flex-col gap-0 rounded-xl p-0 w-[calc(100vw-1rem)] h-[calc(100dvh-1rem)] sm:max-w-none! sm:w-[calc(100vw-2rem)] sm:h-[calc(100dvh-2rem)] sm:rounded-2xl"
      >
        <DialogHeader className="shrink-0 gap-1 border-b px-6 py-4 pr-12">
          <DialogTitle className="font-heading text-xl">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="flex flex-col gap-2">{children}</div>
        </div>
        {viewAllHref && (
          <div className="flex shrink-0 justify-end border-t bg-muted/50 px-6 py-4">
            <Button render={<Link href={viewAllHref} />} nativeButton={false}>
              {viewAllLabel} <ArrowRight className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
