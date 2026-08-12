"use client";

import { Search } from "lucide-react";
import { useCommandPalette } from "@/lib/command-palette-context";
import { useIsMac } from "@/lib/use-is-mac";
import { cn } from "@/lib/utils";

type SearchTriggerVariant = "compact" | "hero" | "pill";

interface SearchTriggerBarProps {
  /** "compact" — the sidebar's always-visible bar. "hero" — the dashboard's prominent hero bar. "pill" — My Day's fully-rounded bar. */
  variant: SearchTriggerVariant;
  placeholder: string;
  className?: string;
}

const VARIANT_CLASS: Record<SearchTriggerVariant, string> = {
  compact: "h-8 rounded-lg border bg-muted/40 px-3 text-sm hover:bg-muted/70",
  hero: "h-12 rounded-xl border bg-card px-4 text-sm shadow-sm hover:-translate-y-1 hover:shadow-md hover:border-primary/40",
  pill: "h-14 rounded-full border bg-card px-5 text-sm shadow-sm hover:-translate-y-1 hover:shadow-md hover:border-primary/40",
};

const ICON_CLASS: Record<SearchTriggerVariant, string> = {
  compact: "size-3.5",
  hero: "size-4",
  pill: "size-4",
};

/** Compact sits on bg-muted/40, so its kbd needs bg-background for contrast; hero/pill sit on bg-card, so bg-muted reads better there. */
const KBD_CLASS: Record<SearchTriggerVariant, string> = {
  compact: "bg-background",
  hero: "bg-muted",
  pill: "bg-muted",
};

/**
 * Opens the shared Ctrl+K command palette — the palette itself never changes, only where and how
 * prominently this trigger is offered per page (sidebar/dashboard-hero/My-Day-pill). One component
 * behind every entry point so their behavior (and the "Ctrl K"/"⌘K" hint) can never drift apart.
 */
export function SearchTriggerBar({ variant, placeholder, className }: SearchTriggerBarProps) {
  const { setOpen } = useCommandPalette();
  const isMac = useIsMac();

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        "flex w-full items-center gap-2 text-left text-muted-foreground transition-all duration-300 ease-spring",
        VARIANT_CLASS[variant],
        className
      )}
    >
      <Search className={cn("shrink-0", ICON_CLASS[variant])} aria-hidden="true" />
      <span className="flex-1 truncate">{placeholder}</span>
      <kbd
        className={cn(
          "hidden shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium sm:inline-flex",
          KBD_CLASS[variant]
        )}
      >
        {isMac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}
