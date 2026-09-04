"use client";

import { useRef, useState } from "react";
import { Bold, Eye, ImageIcon, Italic, Link as LinkIcon, List, ListOrdered, Pencil } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SafeMarkdown } from "@/lib/markdown-lite";

interface RichDescriptionEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  rows?: number;
}

type DialogKind = "link" | "image" | null;

/**
 * Project Level Part 6 — v1 rich Description editor. A plain Textarea plus a formatting toolbar
 * that inserts Markdown syntax (bold/italic/bulleted list/numbered list/link/image URL); "Preview"
 * renders the same content through `renderMarkdownLite` so what's shown here always matches what
 * the Overview tab will later display. No third-party editor package, no raw-HTML mode.
 */
export function RichDescriptionEditor({ value, onChange, placeholder, id, rows = 4 }: RichDescriptionEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [dialogKind, setDialogKind] = useState<DialogKind>(null);
  const [dialogText, setDialogText] = useState("");
  const [dialogUrl, setDialogUrl] = useState("");

  function wrapSelection(before: string, after: string, placeholderText: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || placeholderText;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    const cursor = start + before.length + selected.length + after.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  }

  function prefixLines(prefix: (i: number) => string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextNewline = value.indexOf("\n", end);
    const lineEnd = nextNewline === -1 ? value.length : nextNewline;
    const block = value.slice(lineStart, lineEnd);
    const lines = block.length > 0 ? block.split("\n") : [""];
    const replaced = lines.map((line, i) => `${prefix(i)}${line}`).join("\n");
    const next = value.slice(0, lineStart) + replaced + value.slice(lineEnd);
    onChange(next);
    const cursor = lineStart + replaced.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  }

  function openDialog(kind: "link" | "image") {
    const el = textareaRef.current;
    setDialogText(el ? value.slice(el.selectionStart, el.selectionEnd) : "");
    setDialogUrl("https://");
    setDialogKind(kind);
  }

  function insertDialogResult() {
    const url = dialogUrl.trim();
    if (!url) {
      setDialogKind(null);
      return;
    }
    const text = dialogText.trim() || (dialogKind === "image" ? "image" : url);
    const markup = dialogKind === "image" ? `![${text}](${url})` : `[${text}](${url})`;
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = value.slice(0, start) + markup + value.slice(end);
      onChange(next);
      const cursor = start + markup.length;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(cursor, cursor);
      });
    } else {
      onChange(value ? `${value}\n${markup}` : markup);
    }
    setDialogKind(null);
  }

  return (
    <div className="flex flex-col gap-0">
      <div className="flex flex-wrap items-center gap-0.5 rounded-t-md border border-b-0 bg-muted/40 p-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Bold"
          disabled={mode === "preview"}
          onClick={() => wrapSelection("**", "**", "bold text")}
        >
          <Bold className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Italic"
          disabled={mode === "preview"}
          onClick={() => wrapSelection("*", "*", "italic text")}
        >
          <Italic className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Bulleted list"
          disabled={mode === "preview"}
          onClick={() => prefixLines(() => "- ")}
        >
          <List className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Numbered list"
          disabled={mode === "preview"}
          onClick={() => prefixLines((i) => `${i + 1}. `)}
        >
          <ListOrdered className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Link"
          disabled={mode === "preview"}
          onClick={() => openDialog("link")}
        >
          <LinkIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Image URL"
          disabled={mode === "preview"}
          onClick={() => openDialog("image")}
        >
          <ImageIcon className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-7 gap-1 text-xs"
          onClick={() => setMode(mode === "write" ? "preview" : "write")}
        >
          {mode === "write" ? (
            <>
              <Eye className="size-3.5" /> Preview
            </>
          ) : (
            <>
              <Pencil className="size-3.5" /> Edit
            </>
          )}
        </Button>
      </div>

      {mode === "write" ? (
        <Textarea
          id={id}
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="rounded-t-none"
        />
      ) : (
        <div className="min-h-24 rounded-b-md border px-3 py-2 text-sm">
          {value.trim() ? <SafeMarkdown text={value} /> : <span className="text-muted-foreground">Nothing to preview.</span>}
        </div>
      )}

      <Dialog open={dialogKind !== null} onOpenChange={(open) => !open && setDialogKind(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{dialogKind === "image" ? "Insert image" : "Insert link"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="md-dialog-text">{dialogKind === "image" ? "Alt text" : "Link text"}</Label>
              <Input id="md-dialog-text" value={dialogText} onChange={(e) => setDialogText(e.target.value)} autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="md-dialog-url">{dialogKind === "image" ? "Image URL" : "URL"}</Label>
              <Input id="md-dialog-url" value={dialogUrl} onChange={(e) => setDialogUrl(e.target.value)} placeholder="https://" />
              <p className="text-xs text-muted-foreground">
                Only http:// and https:// {dialogKind === "image" ? "images" : "links"} render — anything else shows as plain text.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogKind(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={insertDialogResult} disabled={!dialogUrl.trim()}>
              Insert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
