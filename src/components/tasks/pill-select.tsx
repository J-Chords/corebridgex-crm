"use client";

import type { CSSProperties } from "react";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type PillVariant = "success" | "info" | "warning" | "destructive" | "neutral";

/** Matches each Badge color variant to a same-hue ring, so the selected pill visibly "lights up" in its own color rather than a generic focus ring. Only used as a fallback when an option has no `chipStyle` override (see below). */
const RING_CLASS: Record<PillVariant, string> = {
  success: "ring-success/50",
  info: "ring-info/50",
  warning: "ring-warning/50",
  destructive: "ring-destructive/50",
  neutral: "ring-border",
};

export interface PillSelectOption<T extends string> {
  value: T;
  label: string;
  variant: PillVariant;
  /**
   * Optional bolder chip styling, keyed by selection state — pass this to make a pill's own color
   * clearly visible (and its selected state unmistakable) instead of the generic `Badge` tint.
   * Status pills supply this; priority pills deliberately don't, so priority's look is unchanged.
   */
  chipStyle?: { selected: CSSProperties; unselected: CSSProperties };
}

interface PillSelectProps<T extends string> {
  options: PillSelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}

/**
 * A row of colored, clickable pills for a small single-choice enum (status/priority) — reuses the
 * exact same `Badge` color variants every status/priority badge elsewhere in the app already uses,
 * so these never drift from `TaskStatusBadge`/`TaskPriorityBadge`. Not a dropdown: the whole point is
 * every option is visible and one click away, each already colored so no legend is needed.
 */
export function PillSelect<T extends string>({ options, value, onChange, ariaLabel }: PillSelectProps<T>) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        const style = option.chipStyle ? (selected ? option.chipStyle.selected : option.chipStyle.unselected) : undefined;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            style={style}
            className={cn(
              badgeVariants({ variant: option.variant }),
              "cursor-pointer border font-semibold transition-all duration-150 hover:scale-105",
              !option.chipStyle && (selected ? cn("ring-2", RING_CLASS[option.variant]) : "opacity-60 hover:opacity-100")
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
