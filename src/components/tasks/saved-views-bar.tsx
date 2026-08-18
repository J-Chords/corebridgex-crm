"use client";

import { useState } from "react";
import { Bookmark, Check, MoreHorizontal, Plus, X, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useSavedViews } from "@/lib/data/hooks/use-saved-views";
import { savedViewsProvider } from "@/lib/data/providers";
import { DEFAULT_TASK_FILTERS, type TaskFilters } from "@/lib/data/hooks/use-task-filters";
import type { SavedViewFilters } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** A saved view stored before Phase 8C's projectId/activityId fields existed has neither key in its
 * stored jsonb at all — normalized here to "all" (never undefined) so it compares/applies exactly
 * like every other filter that was never set, instead of silently mismatching or crashing. */
function normalizeSavedFilters(filters: SavedViewFilters): TaskFilters {
  return { ...filters, projectId: filters.projectId ?? "all", activityId: filters.activityId ?? "all" };
}

function filtersEqual(a: TaskFilters, b: SavedViewFilters): boolean {
  return (
    a.search === b.search &&
    a.projectId === (b.projectId ?? "all") &&
    a.companyId === b.companyId &&
    a.workstreamId === b.workstreamId &&
    a.activityId === (b.activityId ?? "all") &&
    a.status === b.status &&
    a.priority === b.priority &&
    a.assigneeId === b.assigneeId &&
    a.groupBy === b.groupBy
  );
}

interface SavedViewsBarProps {
  filters: TaskFilters;
  onApply: (filters: TaskFilters) => void;
}

/**
 * Personal saved filter combinations, shown as quick chips — reused as-is on the Tasks list and
 * My Day, since both already share the exact same TaskFilters shape/hook. Clicking a chip applies
 * its filters instantly; each chip's own menu offers Rename/Delete. Saving is disabled when the
 * current filters are just the defaults — nothing meaningful to name and save yet.
 */
export function SavedViewsBar({ filters, onApply }: SavedViewsBarProps) {
  const { user } = useAuth();
  const { savedViews, refresh } = useSavedViews();
  const [isSavingNew, setIsSavingNew] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  if (!user) return null;

  const isDefault = filtersEqual(filters, DEFAULT_TASK_FILTERS);

  async function handleSaveNew() {
    const name = nameDraft.trim();
    if (!name || !user) return;
    await savedViewsProvider.createSavedView(user, { name, filters });
    setNameDraft("");
    setIsSavingNew(false);
    refresh();
  }

  async function handleRename(id: string) {
    const name = renameDraft.trim();
    if (!name || !user) return;
    await savedViewsProvider.renameSavedView(user, id, name);
    setRenamingId(null);
    refresh();
  }

  async function handleDelete(id: string) {
    if (!user) return;
    await savedViewsProvider.deleteSavedView(user, id);
    refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {savedViews.map((view) =>
        renamingId === view.id ? (
          <div key={view.id} className="flex items-center gap-1">
            <Input
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              className="h-7 w-40"
              autoFocus
              aria-label="Rename saved view"
              onKeyDown={(e) => e.key === "Enter" && handleRename(view.id)}
            />
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => handleRename(view.id)}>
              <Check />
            </Button>
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => setRenamingId(null)}>
              <X />
            </Button>
          </div>
        ) : (
          <div key={view.id} className="flex items-center rounded-full border">
            <Button
              type="button"
              variant={filtersEqual(filters, view.filters) ? "secondary" : "ghost"}
              size="sm"
              className="rounded-r-none"
              onClick={() => onApply(normalizeSavedFilters(view.filters))}
            >
              <Bookmark className="size-3.5" /> {view.name}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex size-7 items-center justify-center rounded-r-full text-muted-foreground outline-none hover:bg-accent"
                aria-label={`Options for ${view.name}`}
              >
                <MoreHorizontal className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => {
                    setRenamingId(view.id);
                    setRenameDraft(view.name);
                  }}
                >
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => handleDelete(view.id)}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      )}

      {!isDefault && (
        <Button type="button" variant="ghost" size="sm" onClick={() => onApply(DEFAULT_TASK_FILTERS)}>
          <XCircle /> Clear filters
        </Button>
      )}

      {isSavingNew ? (
        <div className="flex items-center gap-1">
          <Input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            placeholder="View name…"
            className="h-7 w-40"
            autoFocus
            aria-label="New saved view name"
            onKeyDown={(e) => e.key === "Enter" && handleSaveNew()}
          />
          <Button type="button" size="sm" disabled={!nameDraft.trim()} onClick={handleSaveNew}>
            Save
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" onClick={() => setIsSavingNew(false)}>
            <X />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isDefault}
          title={isDefault ? "Change a filter first to save it as a view" : undefined}
          onClick={() => setIsSavingNew(true)}
        >
          <Plus /> Save view
        </Button>
      )}
    </div>
  );
}
