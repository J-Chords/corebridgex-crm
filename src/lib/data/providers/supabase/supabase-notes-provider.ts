import type { NotesProvider } from "../notes-provider";

const notImplemented = (): never => {
  throw new Error("supabaseNotesProvider is not implemented yet — use the mock provider.");
};

/** Real backend slot-in point — same shape as mockNotesProvider, no screen changes needed to swap. */
export const supabaseNotesProvider: NotesProvider = {
  listNotesForTask: notImplemented,
  listNotesForCompany: notImplemented,
  createTaskNote: notImplemented,
  createCompanyNote: notImplemented,
};
