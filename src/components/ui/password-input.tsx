"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { FloatingLabelInput, type FloatingLabelInputProps } from "@/components/ui/floating-label-input";

export type PasswordInputProps = Omit<FloatingLabelInputProps, "type" | "endAdornment">;

/**
 * Admin Foundation acceptance — the one reusable password field, used everywhere a password is
 * typed (login, Admin create-user initial password, Admin reset password, /change-password,
 * Settings' inert change-password form). Defaults to type="password"; the eye button toggles a
 * purely visual/local `revealed` state, never anything persisted or logged. autoComplete/
 * autofill semantics are untouched (whatever the caller passes through, exactly like any other
 * FloatingLabelInput) — only the DOM `type` attribute flips between "password" and "text".
 */
export function PasswordInput(props: PasswordInputProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <FloatingLabelInput
      {...props}
      type={revealed ? "text" : "password"}
      endAdornment={
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          aria-label={revealed ? "Hide password" : "Show password"}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/10"
        >
          {revealed ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      }
    />
  );
}
