import type { SavedViewsProvider } from "../saved-views-provider";

const notImplemented = (): never => {
  throw new Error("supabaseSavedViewsProvider is not implemented yet — use the mock provider.");
};

/** Real backend slot-in point — same shape as mockSavedViewsProvider, no screen changes needed to swap. */
export const supabaseSavedViewsProvider: SavedViewsProvider = {
  listSavedViews: notImplemented,
  createSavedView: notImplemented,
  renameSavedView: notImplemented,
  deleteSavedView: notImplemented,
};
