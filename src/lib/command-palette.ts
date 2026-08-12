import type { LucideIcon } from "lucide-react";

export type PaletteCategory = "companies" | "tasks" | "workstreams" | "reports" | "people" | "actions";

/** Render order for the "All" tab and the category-tab row (Actions last — it's navigational, not a data result). */
export const PALETTE_CATEGORY_ORDER: PaletteCategory[] = [
  "companies",
  "tasks",
  "workstreams",
  "reports",
  "people",
  "actions",
];

export const PALETTE_CATEGORY_LABELS: Record<PaletteCategory, string> = {
  companies: "Companies",
  tasks: "Tasks",
  workstreams: "Workstreams",
  reports: "Reports",
  people: "People",
  actions: "Actions",
};

/** How many of each category's matches show on the "All" tab before narrowing to that category's own tab shows the rest. */
export const ALL_TAB_CATEGORY_LIMIT = 5;

export interface PaletteResult {
  id: string;
  category: PaletteCategory;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  /** Navigates here on select. Mutually exclusive with `onSelect` — a result is either a link or a command. */
  href?: string;
  /** Runs a command (e.g. clicking an already-existing button) instead of navigating. */
  onSelect?: () => void;
}

/** Dead-simple, case-insensitive substring match on title/subtitle — same "no fuzzy matching, no ranking model" precedent as the Activity Catalog's keyword suggestion. */
export function matchesQuery(result: PaletteResult, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return result.title.toLowerCase().includes(q) || (result.subtitle?.toLowerCase().includes(q) ?? false);
}
