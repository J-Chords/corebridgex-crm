"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(date: string, deltaDays: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/** "today" / "yesterday" / "on Monday, August 3" — built for a sentence like "What did your team do {phrase}?" */
export function formatDatePhrase(date: string): string {
  const today = todayDateString();
  if (date === today) return "today";
  if (date === shiftDate(today, -1)) return "yesterday";
  const d = new Date(`${date}T00:00:00Z`);
  const sameYear = d.getUTCFullYear() === new Date(`${today}T00:00:00Z`).getUTCFullYear();
  const label = d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  });
  return `on ${label}`;
}

interface DateStepperProps {
  date: string;
  onChange: (date: string) => void;
}

/** Browse-by-day control for Team Updates — arrows step a day at a time, capped at today since there's nothing to browse in the future; the date field jumps straight to any day. */
export function DateStepper({ date, onChange }: DateStepperProps) {
  const today = todayDateString();
  const isToday = date === today;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl border bg-card p-1 shadow-sm">
        <Button variant="ghost" size="icon-sm" onClick={() => onChange(shiftDate(date, -1))} aria-label="Previous day">
          <ChevronLeft />
        </Button>
        <div className="flex items-center gap-1.5 px-1 text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          <Input
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && onChange(e.target.value)}
            aria-label="Jump to date"
            className="h-6 w-[132px] border-0 bg-transparent p-0 text-center text-sm font-medium text-foreground shadow-none focus-visible:ring-0"
          />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onChange(shiftDate(date, 1))}
          disabled={isToday}
          aria-label="Next day"
        >
          <ChevronRight />
        </Button>
      </div>
      {!isToday && (
        <Button variant="outline" size="sm" onClick={() => onChange(today)}>
          Today
        </Button>
      )}
    </div>
  );
}
