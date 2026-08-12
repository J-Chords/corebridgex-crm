import type { SavedView, SavedViewFilters, User } from "../types";

export interface SavedViewInput {
  name: string;
  filters: SavedViewFilters;
}

/**
 * Contract every provider (mock, Supabase, future AWS) must implement. Saved views are strictly
 * personal — every method scopes to the requesting viewer's own views only; there's no sharing
 * or team-views concept yet. No dedicated permission function is needed: "can see/rename/delete
 * this view" reduces to "is this viewer's own," enforced directly in each method.
 */
export interface SavedViewsProvider {
  listSavedViews(viewer: User): Promise<SavedView[]>;
  createSavedView(viewer: User, input: SavedViewInput): Promise<SavedView>;
  renameSavedView(viewer: User, id: string, name: string): Promise<SavedView>;
  deleteSavedView(viewer: User, id: string): Promise<void>;
}
