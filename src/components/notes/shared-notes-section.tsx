"use client";

import { useState } from "react";
import { Plus, Send } from "lucide-react";
import type { NoteWithAuthor } from "@/lib/data/providers/notes-provider";
import type { NoteType } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NoteTypeBadge, NOTE_TYPE_SELECT_ITEMS } from "@/components/notes/note-type-badge";
import { getInitials as initials } from "@/lib/initials";

const PREVIEW_COUNT = 3;

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface SharedNotesSectionProps {
  notes: NoteWithAuthor[];
  onAddNote?: (input: { body: string; type: NoteType }) => Promise<void>;
  /** Manual Acceptance Step 4 — Comments is now the one normal place to add Project discussion/
   * context; this legacy Note history stays visible (never destructively hidden or deleted) but
   * strictly read-only, so no new legacy Note can be authored from the normal V1 Project UI. */
  readOnly?: boolean;
  /** Defaults to "Shared Notes"; the read-only composition on the Comments tab passes "Legacy
   * Notes" instead so it reads clearly as historical, not a second active authoring surface. */
  title?: string;
}

/**
 * Phase 13B final correction pass — a deliberately compact alternative to `NotesSection` for a
 * surface (the Project workspace) where notes are secondary, recurring context rather than the
 * page's main purpose. Same underlying Company-level Notes architecture
 * (`useCompanyNotes`/`notesProvider.createCompanyNote`, storage keyed by `companyId` — the caller
 * still owns that call, this component only renders/composes) — no new Note type/table/provider.
 * When there are no notes yet, renders only a single-line "+ Add shared note" action instead of a
 * large empty card, so an Employee never loses vertical space to a feature they haven't used.
 */
export function SharedNotesSection({ notes, onAddNote, readOnly, title = "Shared Notes" }: SharedNotesSectionProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState("");
  const [type, setType] = useState<NoteType>("internal");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || !onAddNote) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onAddNote({ body: body.trim(), type });
      setBody("");
      setType("internal");
      setComposerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to post note.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function cancelComposer() {
    setComposerOpen(false);
    setBody("");
    setError(null);
  }

  if (notes.length === 0) {
    if (readOnly) return null;
    return (
      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        <Plus className="size-3.5" aria-hidden="true" />
        Add shared note
      </button>
    );
  }

  const visible = expanded ? notes : notes.slice(0, PREVIEW_COUNT);

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-sm font-medium">{title}</span>
          <p className="text-xs text-muted-foreground">
            {readOnly ? "Historical context, kept for reference — new Project discussion happens in Comments above." : "Shared notes available across related Projects."}
          </p>
        </div>
        {!readOnly && !composerOpen && (
          <Button size="sm" variant="outline" onClick={() => setComposerOpen(true)}>
            <Plus /> Add note
          </Button>
        )}
      </div>

      {!readOnly && composerOpen && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a note…"
            rows={2}
            aria-label="Note body"
            autoFocus
          />
          <div className="flex items-center justify-between gap-2">
            <Select items={NOTE_TYPE_SELECT_ITEMS} value={type} onValueChange={(v) => setType((v ?? "internal") as NoteType)}>
              <SelectTrigger aria-label="Note type" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="call">Call</SelectItem>
                <SelectItem value="meeting">Meeting</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="decision">Decision</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={cancelComposer}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting || !body.trim()}>
                <Send /> {isSubmitting ? "Posting…" : "Post"}
              </Button>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      )}

      {notes.length > 0 && (
        <ul className="flex flex-col gap-2">
          {visible.map((note) => (
            <li key={note.id} className="flex gap-2 border-t pt-2 first:border-t-0 first:pt-0">
              <Avatar className="size-6 shrink-0">
                <AvatarFallback className="text-[9px]">{initials(note.author.fullName)}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium">{note.author.fullName}</span>
                  <NoteTypeBadge type={note.type} />
                  <span className="text-[10px] text-muted-foreground">{formatDateShort(note.createdAt)}</span>
                </div>
                <p className="line-clamp-2 text-xs whitespace-pre-wrap text-foreground">{note.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {notes.length > PREVIEW_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-fit text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {expanded ? "Show less" : `View all ${notes.length} notes`}
        </button>
      )}
    </div>
  );
}
