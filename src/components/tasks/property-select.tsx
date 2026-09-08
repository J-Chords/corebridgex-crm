"use client";

import type { CSSProperties, ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface PropertySelectOption<T extends string> {
  value: T;
  label: string;
  /** A small leading visual (a status dot, priority bars) — rendered identically in the trigger's
   * current value and in each dropdown item, so the closed control and its open menu always agree. */
  indicator: ReactNode;
  /** Task Level Phase 2, Section 14 — an optional colored-chip style applied to the trigger ONLY
   * while this option is the current value (e.g. `statusChipStyle(status)`), so the selected value
   * visually reads as "selected" at a glance instead of a plain bordered box with a small dot. Omit
   * for an enum with no such per-value color (e.g. Priority keeps the plain trigger). */
  triggerStyle?: CSSProperties;
}

/**
 * Phase 13 visual polish — the one compact dropdown language for a small colored single-choice
 * enum (Status, Priority, a Workstream's own Status): `[ ● To do  ▾ ]`. Replaces the earlier
 * `PillSelect` row-of-buttons treatment in Create/Edit forms, which read as a "giant" segmented
 * control competing with the rest of the form; this reads as one property among several, matching
 * the property rail's own already-accepted `TaskStatusRail` shape.
 */
export function PropertySelect<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled,
}: {
  options: PropertySelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const items = Object.fromEntries(options.map((o) => [o.value, o.label]));
  const currentOption = options.find((o) => o.value === value);
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v as T)} disabled={disabled}>
      <SelectTrigger aria-label={ariaLabel} className="h-8 w-full font-medium" style={currentOption?.triggerStyle}>
        <SelectValue>
          {(current: T | null) => {
            const option = options.find((o) => o.value === current);
            if (!option) return null;
            return (
              <span className="flex items-center gap-1.5">
                {option.indicator}
                {option.label}
              </span>
            );
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="flex items-center gap-1.5">
              {option.indicator}
              {option.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
