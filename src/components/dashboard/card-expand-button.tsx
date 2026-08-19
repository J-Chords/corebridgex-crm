"use client";

import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CardExpandButtonProps {
  onClick: () => void;
  label: string;
}

/** The small, discoverable "see the fuller list" control every bounded Dashboard list widget's
 * header gets (Phase 8E) — opens a `DashboardDetailDrawer`, never inline-expands the card itself. */
export function CardExpandButton({ onClick, label }: CardExpandButtonProps) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={onClick} aria-label={label}>
      <Maximize2 />
    </Button>
  );
}
