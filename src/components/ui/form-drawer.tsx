"use client";

import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Phase 13 Form Drawer redesign — shared primitives for a right-side CREATE/EDIT form Sheet, a
 * distinct family from `DetailDrawer` (`detail-drawer.tsx`, view/inspect only) rather than an
 * overload of it: a form has real inputs, a sticky action footer, and a wider desktop measure than
 * a compact inspector needs. Built for Task/Service create-edit; Activity's own create flow stays a
 * small, focused dialog (see `create-activity-dialog.tsx`) — never opened as a second stacked
 * Drawer while a Task/Service `FormDrawer` is already open (the locked "no nested drawer chaos"
 * rule).
 *
 * Width: 520-560px on desktop (540px), full-width on mobile — wider than `DetailDrawer`'s ~500px
 * since a form's own labels/controls need more breathing room than read-only property rows do.
 * Typography/spacing follow the session's locked scale: a 20px semibold title, 13-14px medium
 * context line, 12-13px muted secondary line, 11-12px tracked-uppercase section labels, 12-13px
 * field labels, 13-14px inputs (the existing `Input`/`Select` default) — no new pixel values
 * invented beyond what those numbers require.
 */
export function FormDrawer({
  open,
  onOpenChange,
  srTitle,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Screen-reader-only fallback title — every real header should also render its own visible
   * `FormDrawerHeader`, but base-ui's Dialog requires a Title element at all times. */
  srTitle: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:w-[540px] data-[side=right]:sm:max-w-[540px]"
      >
        <SheetTitle className="sr-only">{srTitle}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Sticky header: a title ("New Task"/"Edit Task"), then the operational context shown exactly
 * once (Company name as the primary line, "Service · Activity" as a muted secondary line) — never
 * a repeated Client/Project/Company chain lower in the form.
 */
export function FormDrawerHeader({
  title,
  context,
  secondaryContext,
  children,
}: {
  title: ReactNode;
  context?: ReactNode;
  secondaryContext?: ReactNode;
  /** Escape hatch for a header that needs more than title/context (e.g. a status badge row) —
   * rendered below the standard title/context block. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b bg-card px-6 py-4 max-sm:px-4">
      <h2 className="truncate text-xl font-semibold leading-tight text-foreground">{title}</h2>
      {context && <div className="text-sm font-medium text-foreground/80">{context}</div>}
      {secondaryContext && <div className="text-xs text-muted-foreground">{secondaryContext}</div>}
      {children}
    </div>
  );
}

/** The single scroll region — every section lives here, spaced by rhythm (`gap-6`) rather than
 * card borders. */
export function FormDrawerBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5 max-sm:px-4", className)}>{children}</div>;
}

/** One labeled section — heading + fields, no bordered Card, no card-in-card. `action` is an
 * optional trailing control (e.g. "+ Add existing Activities" next to an "Activities" heading). */
export function FormDrawerSection({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

/** A compact 2-up field grid for related properties (Status/Priority, Start/Due) — never two
 * full-width stacked fields for things that belong side by side. */
export function FormDrawerPropertyGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-4">{children}</div>;
}

/** One field: a small label, `gap-1.5` above its control (6px), matching the locked
 * label-to-control spacing. */
export function FormDrawerField({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Progressive disclosure for low-frequency fields — collapsed by default behind a plain text
 * toggle ("More options"), never hiding a required field. `defaultOpen` lets a caller start it
 * expanded when editing a Task that already has one of these fields set (so nothing looks silently
 * hidden on an existing record).
 */
export function FormDrawerDisclosure({
  label = "More options",
  defaultOpen = false,
  children,
}: {
  label?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="group/disclosure flex flex-col gap-3" open={defaultOpen}>
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <span className="transition-transform group-open/disclosure:rotate-90">›</span>
        {label}
      </summary>
      <div className="flex flex-col gap-4">{children}</div>
    </details>
  );
}

/** Sticky footer — Cancel + primary action, right-aligned, same as every other Dialog/Sheet
 * footer in the app. */
export function FormDrawerFooter({ children }: { children: ReactNode }) {
  return <div className="mt-auto flex flex-row justify-end gap-2 border-t bg-card px-6 py-4 max-sm:px-4">{children}</div>;
}
