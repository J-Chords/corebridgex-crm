"use client";

import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Phase 13B final boss-feedback pass — shared primitives for a right-side "quick operational
 * inspector" drawer (as opposed to a create/edit form Sheet, which keeps its own existing look).
 * Built out of the Task Drawer redesign; reuse these for any future single-entity detail drawer
 * instead of hand-rolling spacing/typography again. `DashboardDetailDrawer` (a *list* of summaries,
 * not a single record) was evaluated and deliberately left alone — different purpose, already has
 * its own documented width rationale.
 *
 * Width: ~500px on desktop (between the requested 480-520px range), full-width on mobile/narrow —
 * overriding `SheetContent`'s own default `sm:max-w-sm`. Typography/spacing reuse the app's existing
 * scale throughout (no new pixel values invented): section labels are the same `font-mono text-[10px]
 * tracking-wider uppercase` every other properties rail already uses; body/property text is the
 * existing `text-sm`; secondary/muted context is the existing `text-xs text-muted-foreground`.
 */
export function DetailDrawer({
  open,
  onOpenChange,
  srTitle,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A screen-reader-only fallback title — every real header should also render its own visible
   * `DetailDrawerIdentity`, but base-ui's Dialog requires a Title element to exist at all times,
   * including during the loading/not-found states before that header can render. */
  srTitle: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:w-[500px] data-[side=right]:sm:max-w-[500px]"
      >
        <SheetTitle className="sr-only">{srTitle}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}

export function DetailDrawerHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-2 border-b bg-card px-5 py-4", className)}>{children}</div>;
}

/**
 * The identity block: [status/type avatar] + title, then the primary operational identity (e.g. a
 * Company name) and optional muted secondary context (e.g. "Service · Activity") — never a repeated
 * Client/Project chain. `titleAs` lets the Task Drawer render its real `<h1>`-equivalent as a plain
 * `<span>` here (the Sheet's own required a11y title lives separately, via `DetailDrawer`'s
 * `srTitle`, to avoid two competing Title elements).
 */
export function DetailDrawerIdentity({
  icon,
  title,
  primaryContext,
  secondaryContext,
}: {
  icon?: ReactNode;
  title: ReactNode;
  primaryContext?: ReactNode;
  secondaryContext?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-lg font-semibold leading-tight text-foreground">
        {icon}
        <span className="min-w-0 truncate">{title}</span>
      </div>
      {primaryContext && <div className="flex items-center gap-1.5 text-sm font-medium text-foreground/80">{primaryContext}</div>}
      {secondaryContext && <div className="text-xs text-muted-foreground">{secondaryContext}</div>}
    </div>
  );
}

export function DetailDrawerBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4", className)}>{children}</div>;
}

/** One labeled section — a heading + content, no bordered Card, no card-in-card. Dividers between
 * sections come from the body's own `gap-5` plus each section's optional `<Separator>` when a
 * harder break is actually useful; most sections don't need one. */
export function DetailDrawerSection({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Compact label/value property rows (Start/Due/Assignee, etc.) — a real grid, not another Card. */
export function DetailDrawerPropertyGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">{children}</div>;
}

export function DetailDrawerPropertyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-foreground">{children}</span>
    </div>
  );
}

export function DetailDrawerFooter({ children }: { children: ReactNode }) {
  return <div className="mt-auto flex flex-row justify-end gap-2 border-t bg-card px-5 py-4">{children}</div>;
}
