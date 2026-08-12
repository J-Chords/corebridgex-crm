"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EXPECTED_TIME_UNIT_ITEMS,
  bestUnitFor,
  fromMinutes,
  toMinutes,
  type ExpectedTimeUnit,
} from "@/lib/data/expected-time";
import { cn } from "@/lib/utils";

interface ExpectedTimeInputProps {
  id?: string;
  valueMinutes: number | null;
  onChange: (minutes: number | null) => void;
}

/**
 * A value + unit control for an "expected time" estimate (minutes/hours/days) — the caller's form
 * state is always the one canonical `expectedMinutes` number regardless of which unit is currently
 * showing. Blank defaults to minutes, per the request; an existing value re-hydrates in whichever
 * unit divides it evenly (see `bestUnitFor`), so editing an existing "2 days" estimate doesn't
 * confront the person with "2880 minutes." Switching the unit re-displays the same underlying
 * duration in the new unit rather than reinterpreting the typed number — it's a view change, not an
 * accidental 60x/480x jump in the estimate.
 *
 * Owns its own local `amount`/`unit` state rather than staying fully controlled, since re-deriving
 * "what the person is currently typing" from a plain minutes number on every keystroke would fight
 * the input (e.g. collapse a trailing decimal point). Callers that need to reset this when the
 * underlying record changes (switching which task/workstream is being edited) should remount it via
 * `key`, the same convention this app already uses for a form's own reset-on-reopen.
 */
export function ExpectedTimeInput({ id, valueMinutes, onChange }: ExpectedTimeInputProps) {
  const [unit, setUnit] = useState<ExpectedTimeUnit>(() => (valueMinutes != null ? bestUnitFor(valueMinutes) : "minutes"));
  const [amount, setAmount] = useState(() => (valueMinutes != null ? String(fromMinutes(valueMinutes, unit)) : ""));

  function handleAmountChange(next: string) {
    // A free-typed number, digits and at most one decimal point — not `type="number"`, which under a
    // controlled React value has a real, reproducible bug in this app's Chromium/React combination
    // where the DOM value gains a stuck leading "0" that every further keystroke appends to instead of
    // replacing (confirmed via direct DOM inspection: focusing an empty number input alone flips its
    // `.value` to "0" before any key is pressed). Plain text sidesteps the native input's own value
    // coercion entirely; `inputMode="decimal"` still shows a numeric keyboard on mobile.
    if (!/^\d*\.?\d*$/.test(next)) return;
    setAmount(next);
    onChange(next.trim() === "" ? null : toMinutes(Number(next), unit));
  }

  function handleUnitChange(nextUnit: ExpectedTimeUnit) {
    const currentMinutes = amount.trim() === "" ? null : toMinutes(Number(amount), unit);
    setUnit(nextUnit);
    setAmount(currentMinutes != null ? String(fromMinutes(currentMinutes, nextUnit)) : "");
    onChange(currentMinutes);
  }

  /** Same +/-1 step a native number input's spinner arrows give you, in whichever unit is currently showing — never below 0. */
  function step(delta: number) {
    const current = amount.trim() === "" ? 0 : Number(amount);
    const next = Math.max(0, Math.round((current + delta) * 100) / 100);
    handleAmountChange(String(next));
  }

  return (
    <div className="flex gap-2">
      {/* The stepper sits beside the input as its own element, not layered on top of it — an
          absolutely-positioned overlay would sit right on top of the input's own clickable area
          (worse the narrower this field's column gets), silently blocking clicks/typing there. */}
      <div className="flex flex-1 items-stretch">
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => handleAmountChange(e.target.value)}
          placeholder="0"
          className="min-w-0 rounded-r-none border-r-0"
        />
        <div className="flex flex-col divide-y divide-border rounded-r-lg border border-input">
          <button
            type="button"
            aria-label="Increase"
            onClick={() => step(1)}
            className={cn(
              "flex flex-1 items-center justify-center rounded-tr-lg px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            )}
          >
            <ChevronUp className="size-3" />
          </button>
          <button
            type="button"
            aria-label="Decrease"
            onClick={() => step(-1)}
            className={cn(
              "flex flex-1 items-center justify-center rounded-br-lg px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            )}
          >
            <ChevronDown className="size-3" />
          </button>
        </div>
      </div>
      <Select items={EXPECTED_TIME_UNIT_ITEMS} value={unit} onValueChange={(v) => handleUnitChange((v ?? "minutes") as ExpectedTimeUnit)}>
        <SelectTrigger className="w-28 shrink-0" aria-label="Unit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="minutes">Minutes</SelectItem>
          <SelectItem value="hours">Hours</SelectItem>
          <SelectItem value="days">Days</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
