"use client";

import { useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface ChecklistBuilderRow {
  id?: string;
  description: string;
  key: string;
}

interface ChecklistBuilderProps {
  items: ChecklistBuilderRow[];
  onAdd: (description: string) => void;
  onUpdate: (key: string, description: string) => void;
  onRemove: (key: string) => void;
}

/**
 * Type an item, press Enter to commit it and clear the field for the next one — a dedicated "next
 * item" input replaces the old "click Add item to get an empty row" flow. Already-added items stay
 * inline-editable and are individually removable, same as before.
 */
export function ChecklistBuilder({ items, onAdd, onUpdate, onRemove }: ChecklistBuilderProps) {
  const [draft, setDraft] = useState("");

  function commitDraft() {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft("");
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((row) => (
        <div key={row.key} className="flex items-center gap-2">
          <Input
            value={row.description}
            onChange={(e) => onUpdate(row.key, e.target.value)}
            placeholder="Checklist item"
            aria-label="Checklist item description"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onRemove(row.key)}
            aria-label="Remove checklist item"
          >
            <X />
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleDraftKeyDown}
          placeholder="Add a checklist item…"
          aria-label="New checklist item"
          className="border-dashed"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={commitDraft}
          disabled={!draft.trim()}
          aria-label="Add checklist item"
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}
