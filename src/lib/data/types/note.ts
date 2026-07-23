export type NoteType = "call" | "meeting" | "internal" | "decision";

/** Always internal — never shown to clients. Exactly one of companyId/taskId is set. */
export interface Note {
  id: string;
  companyId: string | null;
  taskId: string | null;
  authorId: string;
  type: NoteType;
  body: string;
  createdAt: string;
}
