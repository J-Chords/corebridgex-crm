"use client";

import { useId, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

/**
 * Admin Foundation Part 15 — a generic searchable multi-select. At 50+ options this keeps the page
 * itself light — nothing renders as a static on-page grid, and the trigger/chip row stays cheap
 * regardless of catalog size. The *popover's* own list is a plain filtered render, not a
 * virtualized one: an empty search still renders every option inside the open popover (typically
 * fine well past 50 rows in a `max-h-64 overflow-y-auto` list; add virtualization only if a real
 * catalog grows large enough to make that scroll list itself feel heavy — not needed today).
 * Selected items stay visible as removable chips below the trigger regardless of whether the
 * popover is open. Reusable anywhere a set of ids needs picking from a list of people (or anything
 * else with an id/label) — first used for Admin Foundation's Team Lead/Employee pickers, intended
 * for Task assignees later.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
  disabled,
  "aria-label": ariaLabel,
}: MultiSelectProps) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const selected = useMemo(
    () => value.map((id) => options.find((o) => o.id === id)).filter((o): o is MultiSelectOption => !!o),
    [value, options]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q)
    );
  }, [options, query]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  function remove(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered[highlighted];
      if (option) toggle(option.id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setQuery("");
            setHighlighted(0);
          }
        }}
      >
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              className="w-full justify-between font-normal"
              aria-label={ariaLabel}
            />
          }
        >
          <span className="truncate text-muted-foreground">
            {selected.length > 0 ? `${selected.length} selected` : placeholder}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlighted(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
            />
          </div>
          <div id={listboxId} role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 && <p className="px-2 py-4 text-center text-xs text-muted-foreground">{emptyText}</p>}
            {filtered.map((option, i) => {
              const isSelected = value.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => toggle(option.id)}
                  onMouseEnter={() => setHighlighted(i)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    i === highlighted ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                      isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input"
                    )}
                  >
                    {isSelected && <Check className="size-3" aria-hidden="true" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{option.label}</span>
                    {option.sublabel && (
                      <span className="truncate text-xs text-muted-foreground">{option.sublabel}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((option) => (
            <Badge key={option.id} variant="secondary" className="gap-1 pr-1">
              {option.label}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(option.id)}
                  aria-label={`Remove ${option.label}`}
                  className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
