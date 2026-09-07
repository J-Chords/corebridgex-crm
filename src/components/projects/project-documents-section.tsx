"use client";

import { useMemo, useState } from "react";
import {
  Download,
  FileText,
  MessageSquare,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useProjectDocuments } from "@/lib/data/hooks/use-project-documents";
import { documentsProvider } from "@/lib/data/providers";
import { isSuperadmin, isSupervisor } from "@/lib/data/permissions";
import type { Document, DocumentCategory } from "@/lib/data/types";
import { ProjectCommentsSection } from "@/components/projects/project-comments-section";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToastManager } from "@/components/ui/toast";

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  engagement_letter: "Engagement Letter",
  working_paper: "Working Paper",
  client_provided: "Client Provided",
  deliverable: "Deliverable",
  compliance: "Compliance",
  other: "Other",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function EditDocumentDialog({
  doc,
  onOpenChange,
  onSaved,
}: {
  doc: Document;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const toastManager = useToastManager();
  const [displayName, setDisplayName] = useState(doc.displayName ?? doc.originalFilename);
  const [description, setDescription] = useState(doc.description ?? "");
  const [category, setCategory] = useState<DocumentCategory>(doc.category ?? "other");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    if (!user) return;
    setIsSaving(true);
    try {
      await documentsProvider.updateDocumentMetadata(user, doc.id, {
        displayName: displayName.trim() || null,
        description: description.trim() || null,
        category: doc.taskId ? undefined : category,
      });
      toastManager.add({ description: "Document updated." });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't update document." });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit document</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-doc-name">Display name</Label>
            <Input id="edit-doc-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-doc-description">Description</Label>
            <Textarea id="edit-doc-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {!doc.taskId && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-doc-category">Category</Label>
              <Select items={CATEGORY_LABELS} value={category} onValueChange={(v) => v && setCategory(v as DocumentCategory)}>
                <SelectTrigger id="edit-doc-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Project Level Parts 14/15/17, demoted to a secondary section under the Documents tab's own
 * generated-Report library (Boss Feedback Alignment, Section 8 — Documents' primary meaning is now
 * "reports already produced," not "a generic upload center"). The full surface — upload (reserve →
 * authenticated upload → finalize, entirely inside `documentsProvider.uploadDocument`), list,
 * metadata edit, signed download, soft-delete/Trash view/restore, and per-Document threaded Comments
 * via the one reusable `ProjectCommentsSection` — is untouched and fully preserved; only the header's
 * framing/prominence changed, never the underlying `documents` table/infrastructure or any historical
 * file. No public URLs, no service-role key anywhere in this component — every Storage call stays
 * inside the provider.
 */
export function ProjectDocumentsSection({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const toastManager = useToastManager();
  const { documents, trashedDocuments, isLoading, refresh } = useProjectDocuments(projectId);
  const [view, setView] = useState<"active" | "trash">("active");
  const [search, setSearch] = useState("");
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [trashingDoc, setTrashingDoc] = useState<Document | null>(null);
  const [commentsDoc, setCommentsDoc] = useState<Document | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const rows = view === "active" ? documents : trashedDocuments;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((d) => (d.displayName ?? d.originalFilename).toLowerCase().includes(q));
  }, [rows, search]);

  if (!user) return null;

  // UI-only convenience gate for showing action buttons — the real authority is always the
  // server-side RLS/RPC check inside each provider call, this only avoids showing a button that
  // would predictably fail.
  function canActOnUI(doc: Document): boolean {
    if (!user) return false;
    if (isSuperadmin(user)) return true;
    if (isSupervisor(user)) return true;
    return doc.uploadedById === user.id;
  }

  async function handleDownload(doc: Document) {
    if (!user) return;
    try {
      const url = await documentsProvider.getDocumentDownloadUrl(user, doc.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't open this document." });
    }
  }

  async function handleTrash() {
    if (!user || !trashingDoc) return;
    setPendingId(trashingDoc.id);
    try {
      await documentsProvider.deleteDocument(user, trashingDoc.id);
      toastManager.add({ description: "Moved to Trash." });
      refresh();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't move this document to Trash." });
    } finally {
      setPendingId(null);
      setTrashingDoc(null);
    }
  }

  async function handleRestore(doc: Document) {
    if (!user) return;
    setPendingId(doc.id);
    try {
      await documentsProvider.restoreDocument(user, doc.id);
      toastManager.add({ description: "Restored." });
      refresh();
    } catch (err) {
      toastManager.add({ description: err instanceof Error ? err.message : "Couldn't restore this document." });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Historical Files</CardTitle>
        <CardDescription>Other files on record for this Project — contracts, working papers, client-provided files.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-40 max-w-xs flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents…"
              className="pl-8"
              aria-label="Search documents"
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border p-0.5">
            {(["active", "trash"] as const).map((v) => (
              <Button
                key={v}
                size="sm"
                variant={view === v ? "secondary" : "ghost"}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v === "active" ? "Active" : `Trash${trashedDocuments.length > 0 ? ` (${trashedDocuments.length})` : ""}`}
              </Button>
            ))}
          </div>
        </div>

        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {view === "trash" ? "Trash is empty." : "No other files on record for this project."}
          </p>
        )}

        <div className="flex flex-col gap-1">
          {filtered.map((doc, i) => {
            const canAct = canActOnUI(doc);
            return (
              <div key={doc.id}>
                {i > 0 && <Separator className="my-2.5" />}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{doc.displayName ?? doc.originalFilename}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(doc.sizeBytes)} · {formatDate(doc.createdAt)}
                        {doc.category ? ` · ${CATEGORY_LABELS[doc.category]}` : ""}
                        {doc.taskId ? " · Task attachment" : ""}
                      </span>
                      {doc.description && <span className="text-xs text-muted-foreground">{doc.description}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {view === "active" ? (
                      <>
                        <Button size="icon-sm" variant="ghost" aria-label="Download" onClick={() => handleDownload(doc)}>
                          <Download className="size-3.5" />
                        </Button>
                        <Button size="icon-sm" variant="ghost" aria-label="Comments" onClick={() => setCommentsDoc(doc)}>
                          <MessageSquare className="size-3.5" />
                        </Button>
                        {canAct && (
                          <>
                            <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={() => setEditingDoc(doc)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Move to Trash"
                              disabled={pendingId === doc.id}
                              onClick={() => setTrashingDoc(doc)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        )}
                      </>
                    ) : (
                      canAct && (
                        <Button size="sm" variant="outline" disabled={pendingId === doc.id} onClick={() => handleRestore(doc)}>
                          <RotateCcw /> Restore
                        </Button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>

      {editingDoc && (
        <EditDocumentDialog doc={editingDoc} onOpenChange={(open) => !open && setEditingDoc(null)} onSaved={refresh} />
      )}

      <ConfirmDialog
        open={trashingDoc !== null}
        onOpenChange={(open) => !open && setTrashingDoc(null)}
        title="Move to Trash?"
        description={`"${trashingDoc?.displayName ?? trashingDoc?.originalFilename}" will move to Trash. You can restore it later.`}
        confirmLabel="Move to Trash"
        confirmVariant="destructive"
        onConfirm={handleTrash}
      />

      <Dialog open={commentsDoc !== null} onOpenChange={(open) => !open && setCommentsDoc(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Comments — {commentsDoc?.displayName ?? commentsDoc?.originalFilename}</DialogTitle>
          </DialogHeader>
          {commentsDoc && (
            <ProjectCommentsSection target={{ projectId, documentId: commentsDoc.id }} compact />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
