import type { SavedViewsProvider } from "../saved-views-provider";
import type { SavedView, User } from "../../types";
import { db } from "./mock-db";

function requireOwner(viewer: User, view: SavedView) {
  if (view.userId !== viewer.id) {
    throw new Error("You don't have access to this saved view.");
  }
}

export const mockSavedViewsProvider: SavedViewsProvider = {
  async listSavedViews(viewer) {
    return db.savedViews
      .filter((v) => v.userId === viewer.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async createSavedView(viewer, input) {
    const name = input.name.trim();
    if (!name) throw new Error("Give this view a name.");

    const now = new Date().toISOString();
    const view: SavedView = {
      id: crypto.randomUUID(),
      userId: viewer.id,
      name,
      filters: input.filters,
      createdAt: now,
      updatedAt: now,
    };
    db.savedViews = [...db.savedViews, view];
    return view;
  },

  async renameSavedView(viewer, id, name) {
    const existing = db.savedViews.find((v) => v.id === id);
    if (!existing) throw new Error("Saved view not found.");
    requireOwner(viewer, existing);

    const trimmed = name.trim();
    if (!trimmed) throw new Error("Give this view a name.");

    const updated: SavedView = { ...existing, name: trimmed, updatedAt: new Date().toISOString() };
    db.savedViews = db.savedViews.map((v) => (v.id === id ? updated : v));
    return updated;
  },

  async deleteSavedView(viewer, id) {
    const existing = db.savedViews.find((v) => v.id === id);
    if (!existing) throw new Error("Saved view not found.");
    requireOwner(viewer, existing);

    db.savedViews = db.savedViews.filter((v) => v.id !== id);
  },
};
