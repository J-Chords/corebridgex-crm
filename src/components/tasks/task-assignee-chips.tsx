"use client";

import { Check } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/data/types";

function initials(fullName: string) {
  return fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

interface TaskAssigneeChipsProps {
  staff: User[];
  selectedIds: string[];
  /** Omit for a read-only display (e.g. an employee's own self-assign, which can't be toggled). */
  onToggle?: (id: string, checked: boolean) => void;
}

/** Clickable avatar chips for picking assignees — reused as-is (no `onToggle`) for the employee self-assign display, so the same chip look applies whether it's choosable or fixed. */
export function TaskAssigneeChips({ staff, selectedIds, onToggle }: TaskAssigneeChipsProps) {
  if (staff.length === 0) {
    return <p className="text-xs text-muted-foreground">No assignable staff found.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {staff.map((person) => {
        const selected = selectedIds.includes(person.id);
        const chipClass = cn(
          "flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition-all duration-150",
          selected
            ? "border-primary bg-primary/10 text-foreground"
            : "border-border bg-card text-muted-foreground"
        );
        const chipContent = (
          <>
            <Avatar className="size-6">
              <AvatarFallback className="text-[10px]">{initials(person.fullName)}</AvatarFallback>
            </Avatar>
            {person.fullName}
            {selected && <Check className="size-3.5 text-primary" aria-hidden="true" />}
          </>
        );

        if (!onToggle) {
          return (
            <div key={person.id} className={chipClass}>
              {chipContent}
            </div>
          );
        }

        return (
          <button
            key={person.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(person.id, !selected)}
            className={cn(chipClass, "hover:-translate-y-0.5 hover:border-primary/40 hover:text-foreground")}
          >
            {chipContent}
          </button>
        );
      })}
    </div>
  );
}
