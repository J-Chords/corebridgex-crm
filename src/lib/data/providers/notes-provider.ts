import type { Note, NoteType, User } from "../types";

export interface NoteWithAuthor extends Note {
  author: User;
}

export interface NoteInput {
  body: string;
  type: NoteType;
}

/**
 * Contract every provider (mock, Supabase, future AWS) must implement.
 * Notes are always internal-only. Read and write share the same gate —
 * per the base RBAC rules, anyone who can see a task/company can write
 * a note on it, not just managers.
 */
export interface NotesProvider {
  listNotesForTask(viewer: User, taskId: string): Promise<NoteWithAuthor[]>;
  listNotesForCompany(viewer: User, companyId: string): Promise<NoteWithAuthor[]>;
  createTaskNote(viewer: User, taskId: string, input: NoteInput): Promise<NoteWithAuthor>;
  createCompanyNote(viewer: User, companyId: string, input: NoteInput): Promise<NoteWithAuthor>;
}
