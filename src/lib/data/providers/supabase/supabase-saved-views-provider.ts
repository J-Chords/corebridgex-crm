import type { SavedViewsProvider, SavedViewInput } from "../saved-views-provider";
import type { SavedView, SavedViewFilters } from "../../types";
import { createClient } from "@/lib/supabase/client";

/**
 * Real Supabase Saved Views provider (Phase 7D). Strictly owner-scoped — RLS
 * (`saved_views_select`/`_insert`/`_update`/`_delete`) is a pure `user_id = auth.uid()` check on
 * every policy, matching the mock's `requireOwner` exactly. `filters` is stored as jsonb but is
 * always the exact `SavedViewFilters` shape — no translation needed round-tripping it.
 */

interface SavedViewRow {
  id: string;
  user_id: string;
  name: string;
  filters: SavedViewFilters;
  created_at: string;
  updated_at: string;
}

function toSavedView(row: SavedViewRow): SavedView {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    filters: row.filters,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const supabaseSavedViewsProvider: SavedViewsProvider = {
  async listSavedViews(viewer) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("saved_views")
      .select("*")
      .eq("user_id", viewer.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toSavedView);
  },

  async createSavedView(viewer, input: SavedViewInput) {
    const name = input.name.trim();
    if (!name) throw new Error("Give this view a name.");
    const supabase = createClient();
    const { data, error } = await supabase
      .from("saved_views")
      .insert({ user_id: viewer.id, name, filters: input.filters })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return toSavedView(data);
  },

  async renameSavedView(viewer, id, name) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Give this view a name.");
    const supabase = createClient();
    const { data, error } = await supabase
      .from("saved_views")
      .update({ name: trimmed })
      .eq("id", id)
      .eq("user_id", viewer.id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Saved view not found.");
    return toSavedView(data);
  },

  async deleteSavedView(viewer, id) {
    const supabase = createClient();
    const { error } = await supabase.from("saved_views").delete().eq("id", id).eq("user_id", viewer.id);
    if (error) throw new Error(error.message);
  },
};
