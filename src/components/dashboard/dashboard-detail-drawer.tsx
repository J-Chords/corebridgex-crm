"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface DashboardDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** e.g. "4 tasks" — shown right under the title. */
  description?: string;
  children: ReactNode;
  /** A legitimate destination for the full underlying view (e.g. "/dashboard/tasks?overdue=1") —
   * omit when none exists, matching every other "never a dead-end" rule in this app. */
  viewAllHref?: string;
  viewAllLabel?: string;
}

/**
 * The one generic Dashboard "expand" surface (Phase 8E) — every KPI card and list widget's Expand
 * control opens this same component with its own already-loaded content, never a bespoke dialog per
 * card and never duplicate business/provider state (the content passed in is exactly what the
 * calling card already computed for its own bounded preview, just unsliced/less-sliced).
 *
 * Sized per the locked interaction model: ~50% viewport width with a sensible cap on desktop, full
 * width on narrow/mobile — noticeably larger than the Task Drawer's own width isn't the goal here
 * (this is a list of summaries, not a full record), so a slightly narrower cap is intentional.
 */
export function DashboardDetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  viewAllHref,
  viewAllLabel = "View all",
}: DashboardDetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:w-[50vw] sm:max-w-2xl">
        <div className="flex flex-col gap-1 border-b bg-card px-6 py-5">
          <SheetTitle className="font-heading text-lg font-semibold text-foreground">{title}</SheetTitle>
          {description ? (
            <SheetDescription>{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">{title}</SheetDescription>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="flex flex-col gap-2">{children}</div>
        </div>

        {viewAllHref && (
          <SheetFooter className="flex-row justify-end border-t bg-card">
            <Button render={<Link href={viewAllHref} />} nativeButton={false}>
              {viewAllLabel} <ArrowRight className="size-3.5" aria-hidden="true" />
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
