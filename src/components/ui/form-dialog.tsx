"use client";

import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * Service Manual Acceptance correction pass — the large centered create/edit shell for Service and
 * Task, replacing `FormDrawer`'s narrow right-side Sheet as the primary editing experience (Product
 * Owner explicitly rejected the old drawer as the final Service/Task editing UX). Reuses every inner
 * `FormDrawer*` primitive as-is (`FormDrawerHeader`/`FormDrawerBody`/`FormDrawerSection`/
 * `FormDrawerPropertyGrid`/`FormDrawerField`/`FormDrawerFooter`) — none of them are actually
 * Sheet-specific, they're plain flex/border layout divs, so only this outer shell needed to change.
 * ~960px desktop max width, full-width down to small screens, internal scroll region between a
 * sticky header and sticky footer exactly like the drawer had.
 */
export function FormDialog({
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-[960px] flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[960px]">
        <DialogTitle className="sr-only">{srTitle}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Two side-by-side groups on desktop (e.g. Ownership | Schedule), stacking on small screens — for
 * the sections of a `FormDialog` that are genuinely independent of each other. */
export function FormDialogColumns({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">{children}</div>;
}
