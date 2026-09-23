"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface TruncatedTextProps {
  text: string;
  className?: string;
}

/**
 * A free-text field's one-line preview, with "View more"/"Show less" appearing only when the text
 * actually overflows a single line — a short description never shows a pointless toggle. Overflow
 * is measured directly (scrollWidth vs. clientWidth) rather than guessed from a character count, so
 * it stays correct across font sizes/container widths. First used by the Template description
 * (Phase 1 Template workspace) — no prior component in this codebase did single-field
 * truncate-with-expand (only static `line-clamp` with no expand affordance, or list-level
 * "show all N" patterns, existed before).
 */
export function TruncatedText({ text, className }: TruncatedTextProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const measureRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    setOverflows(el.scrollWidth > el.clientWidth + 1);
  }, [text]);

  return (
    <div className={cn("flex min-w-0 flex-col items-start gap-0.5", className)}>
      <span
        ref={measureRef}
        className={cn("min-w-0 text-sm text-muted-foreground", !expanded && "block max-w-full truncate")}
      >
        {text}
      </span>
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs font-medium text-primary hover:underline"
        >
          {expanded ? "Show less" : "View more"}
        </button>
      )}
    </div>
  );
}
