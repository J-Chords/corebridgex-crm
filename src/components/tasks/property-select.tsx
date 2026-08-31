"use client";

import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface PropertySelectOption<T extends string> {
  value: T;
  label: string;
  /** A small leading visual (a status dot, priority bars) — rendered identically in the trigger's
   * current value and in each dropdown item, so the closed control and its open menu always agree. */
  indicator: ReactNode;
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
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v as T)} disabled={disabled}>
      <SelectTrigger aria-label={ariaLabel} className="h-8 w-full">
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
