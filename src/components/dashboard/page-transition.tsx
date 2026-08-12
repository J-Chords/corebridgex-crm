"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Subtle fade + slight upward slide on every route change. Keyed by the full pathname so React
 * remounts the wrapper on any navigation — including between two instances of the same dynamic
 * route template (e.g. one task detail to another) — guaranteeing the enter animation replays
 * every time, not just on top-level route changes.
 *
 * Uses tw-animate-css's animate-in utilities (already a project dependency, same ones the
 * dialog/select popups already use) rather than a bespoke keyframe — a plain `ease-out` instead of
 * the app's springy `ease-spring` since this should read as calm polish, not a bounce. The global
 * `prefers-reduced-motion` override in globals.css already collapses this to near-zero duration
 * for users who need that, with no extra handling required here.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="min-w-0 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out">
      {children}
    </div>
  );
}
