import type { ActivityCatalogProvider } from "../activity-catalog-provider";

const notImplemented = (): never => {
  throw new Error("supabaseActivityCatalogProvider is not implemented yet — use the mock provider.");
};

/** Real backend slot-in point — same shape as mockActivityCatalogProvider, no screen changes needed to swap. */
export const supabaseActivityCatalogProvider: ActivityCatalogProvider = {
  listDepartments: notImplemented,
};
