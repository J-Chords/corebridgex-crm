"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import type { NoteWithAuthor } from "@/lib/data/providers/notes-provider";
import type { NoteType } from "@/lib/data/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NoteTypeBadge, NOTE_TYPE_SELECT_ITEMS } from "@/components/notes/note-type-badge";

function initials(fullName: string) {
  return fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface NotesSectionProps {
  title: string;
  description?: string;
  notes: NoteWithAuthor[];
  emptyMessage: string;
  onAddNote: (input: { body: string; type: NoteType }) => Promise<void>;
}

export function NotesSection({ title, description, notes, emptyMessage, onAddNote }: NotesSectionProps) {
  const [body, setBody] = useState("");
  const [type, setType] = useState<NoteType>("internal");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setIsSubmitting(true);
    try {
      await onAddNote({ body: body.trim(), type });
      setBody("");
      setType("internal");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a note…"
            rows={2}
            aria-label="Note body"
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
            <Button type="submit" size="sm" disabled={isSubmitting || !body.trim()}>
              <Send /> {isSubmitting ? "Posting…" : "Post note"}
            </Button>
          </div>
        </form>

        <Separator />

        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {notes.map((note) => (
              <li key={note.id} className="flex gap-3">
                <Avatar className="size-7 shrink-0">
                  <AvatarFallback className="text-[10px]">{initials(note.author.fullName)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{note.author.fullName}</span>
                    <NoteTypeBadge type={note.type} />
                    <span className="text-xs text-muted-foreground">{formatDateTime(note.createdAt)}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-foreground">{note.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
