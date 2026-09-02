"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface FloatingLabelInputProps
  extends Omit<React.ComponentProps<"input">, "placeholder"> {
  label: string;
  error?: string;
  hint?: string;
  /** Optional trailing control (e.g. a password show/hide toggle) absolutely positioned inside
   * the input's own relative wrapper — see PasswordInput for the first consumer. */
  endAdornment?: React.ReactNode;
}

/**
 * Floating-label input, ported from the reference design system's `.fl-*`
 * pattern. The label position is driven entirely by CSS (`:placeholder-shown`
 * / `:focus` via the `peer` variant) rather than JS tracking "filled" state,
 * so it works whether the input is controlled or uncontrolled and needs no
 * DOM manipulation. `placeholder=" "` is required for the CSS trick — it's
 * never visible to the user since the floating label sits on top of it.
 */
export function FloatingLabelInput({
  id,
  label,
  error,
  hint,
  className,
  endAdornment,
  ...props
}: FloatingLabelInputProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <input
          id={inputId}
          placeholder=" "
          aria-invalid={!!error}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cn(
            "peer w-full rounded-md border-[1.5px] border-input bg-card px-4 pt-[22px] pb-2 text-base text-foreground outline-none transition-colors placeholder:text-transparent focus:border-primary focus:ring-[3px] focus:ring-primary/10",
            endAdornment && "pr-11",
            error && "border-destructive focus:border-destructive focus:ring-destructive/10",
            className
          )}
          {...props}
        />
        <label
          htmlFor={inputId}
          className={cn(
            "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-muted-foreground transition-all duration-150",
            "peer-focus:top-[10px] peer-focus:translate-y-0 peer-focus:text-[10px] peer-focus:tracking-wide peer-focus:text-primary",
            "peer-[:not(:placeholder-shown)]:top-[10px] peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[10px] peer-[:not(:placeholder-shown)]:tracking-wide",
            error && "peer-focus:text-destructive"
          )}
        >
          {label}
        </label>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-center scale-x-0 rounded-b-md bg-primary transition-transform duration-200 peer-focus:scale-x-100"
        />
        {endAdornment && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">{endAdornment}</div>
        )}
      </div>
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
