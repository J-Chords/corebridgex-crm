import type { NotesProvider, NoteInput, NoteWithAuthor } from "../notes-provider";
import type { Note } from "../../types";
import { createClient } from "@/lib/supabase/client";
import { resolveProfileDirectory } from "./profile-directory";

/**
 * Real Supabase Notes provider (Phase 7D). Append-only — no update/delete method exists on the
 * interface, matching the mock exactly. RLS (`notes_select`/`notes_insert`) mirrors
 * `can_access_task`/`can_access_company` exactly, the same gate the parent Task/Company already uses.
 */

interface NoteRow {
  id: string;
  company_id: string | null;
  task_id: string | null;
  author_id: string;
  type: Note["type"];
  body: string;
  created_at: string;
}

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    companyId: row.company_id,
    taskId: row.task_id,
    authorId: row.author_id,
    type: row.type,
    body: row.body,
    createdAt: row.created_at,
  };
}

async function withAuthor(notes: Note[]): Promise<NoteWithAuthor[]> {
  if (notes.length === 0) return [];
  // Not a plain `profiles` select — `profiles_select` RLS only ever exposes self/your own direct
  // reports, which is too narrow here (e.g. reading a note authored by your Supervisor).
  const authorIds = notes.map((n) => n.authorId);
  const users = await resolveProfileDirectory(authorIds);
  return notes.map((note) => {
    const author = users.find((u) => u.id === note.authorId);
    if (!author) throw new Error(`Note ${note.id} references unknown author ${note.authorId}`);
    return { ...note, author };
  });
}

export const supabaseNotesProvider: NotesProvider = {
  async listNotesForTask(_viewer, taskId) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return withAuthor((data ?? []).map(toNote));
  },

  async listNotesForCompany(_viewer, companyId) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return withAuthor((data ?? []).map(toNote));
  },

  async createTaskNote(viewer, taskId, input: NoteInput) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("notes")
      .insert({ task_id: taskId, company_id: null, author_id: viewer.id, type: input.type, body: input.body })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const [hydrated] = await withAuthor([toNote(data)]);
    return hydrated;
  },

  async createCompanyNote(viewer, companyId, input: NoteInput) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("notes")
      .insert({ company_id: companyId, task_id: null, author_id: viewer.id, type: input.type, body: input.body })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const [hydrated] = await withAuthor([toNote(data)]);
    return hydrated;
  },
};
