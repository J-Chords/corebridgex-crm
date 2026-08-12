import type { TemplatesProvider } from "../templates-provider";

const notImplemented = (): never => {
  throw new Error("supabaseTemplatesProvider is not implemented yet — use the mock provider.");
};

/** Real backend slot-in point — same shape as mockTemplatesProvider, no screen changes needed to swap. */
export const supabaseTemplatesProvider: TemplatesProvider = {
  listTemplates: notImplemented,
  getTemplate: notImplemented,
};
