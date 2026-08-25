import type { User } from "@/lib/data/types";
import { canManageTasks } from "@/lib/data/permissions";

export interface NavShortcut {
  /** The letter pressed after "g". */
  key: string;
  href: string;
  label: string;
  /** Omit to show for every role — mirrors `AppSidebar`'s own nav items/gates exactly, so a shortcut is never offered for a page a role can't really use. */
  isVisible?: (user: User) => boolean;
}

export const NAV_SHORTCUTS: NavShortcut[] = [
  { key: "d", href: "/dashboard", label: "Dashboard" },
  { key: "m", href: "/dashboard/my-day", label: "My Day" },
  { key: "c", href: "/dashboard/companies", label: "Companies" },
  { key: "t", href: "/dashboard/tasks", label: "Tasks", isVisible: canManageTasks },
  { key: "r", href: "/dashboard/reports/client", label: "Reports" },
];

export interface ActionShortcut {
  key: string;
  label: string;
  description: string;
}

/** Each of these is a thin convenience over something already clickable on the current page — never a second way to do something the UI itself can't already do. */
export const ACTION_SHORTCUTS: ActionShortcut[] = [
  { key: "/", label: "Focus search", description: "Jumps to this page's search field, if it has one" },
  { key: "n", label: "New task", description: "Opens this page's new-task dialog, if it has one" },
  { key: "?", label: "Show shortcuts", description: "Opens this help overlay" },
];

/** My Day only — 1 through 5 switch the status bucket, in the same left-to-right order the buckets render in. */
export const MY_DAY_BUCKET_KEYS = ["1", "2", "3", "4", "5"] as const;
