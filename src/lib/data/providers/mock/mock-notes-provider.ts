import type { NoteInput, NotesProvider, NoteWithAuthor } from "../notes-provider";
import type { Note } from "../../types";
import { canAccessCompany, canAccessTask, canAccessTaskDirectly } from "../../permissions";
import { db } from "./mock-db";

function taskAssigneeIds(taskId: string): string[] {
  return db.taskAssignees.filter((ta) => ta.taskId === taskId).map((ta) => ta.userId);
}

function toNoteWithAuthor(note: Note): NoteWithAuthor {
  const author = db.users.find((u) => u.id === note.authorId);
  if (!author) {
    throw new Error(`Note ${note.id} references unknown author ${note.authorId}`);
  }
  return { ...note, author };
}

function sortNewestFirst(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export const mockNotesProvider: NotesProvider = {
  async listNotesForTask(viewer, taskId) {
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task) return [];
    const assigneeIds = taskAssigneeIds(taskId);
    if (!canAccessTask(viewer, { assigneeIds, companyId: task.companyId }, db.users)) return [];

    return sortNewestFirst(db.notes.filter((n) => n.taskId === taskId)).map(toNoteWithAuthor);
  },

  async listNotesForCompany(viewer, companyId) {
    if (!canAccessCompany(viewer, companyId, db.users)) return [];
    return sortNewestFirst(db.notes.filter((n) => n.companyId === companyId)).map(toNoteWithAuthor);
  },

  async createTaskNote(viewer, taskId, input: NoteInput) {
    const task = db.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error("Task not found.");
    const assigneeIds = taskAssigneeIds(taskId);
    // Phase 10 hierarchy-authorization hardening — writing a Note requires DIRECT Task access, not
    // hierarchy-only visibility (listNotesForTask above stays on canAccessTask; reads may remain
    // hierarchy-visible).
    if (!canAccessTaskDirectly(viewer, { assigneeIds, companyId: task.companyId }, db.users)) {
      throw new Error("You don't have access to this task.");
    }

    const note: Note = {
      id: crypto.randomUUID(),
      companyId: null,
      taskId,
      authorId: viewer.id,
      type: input.type,
      body: input.body,
      createdAt: new Date().toISOString(),
    };
    db.notes = [...db.notes, note];
    return toNoteWithAuthor(note);
  },

  async createCompanyNote(viewer, companyId, input: NoteInput) {
    if (!canAccessCompany(viewer, companyId, db.users)) {
      throw new Error("You don't have access to this company.");
    }

    const note: Note = {
      id: crypto.randomUUID(),
      companyId,
      taskId: null,
      authorId: viewer.id,
      type: input.type,
      body: input.body,
      createdAt: new Date().toISOString(),
    };
    db.notes = [...db.notes, note];
    return toNoteWithAuthor(note);
  },
};
