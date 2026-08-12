import type { CSSProperties } from "react";

/** Per-item delay step for a staggered entrance cascade, in ms — large enough that each item's arrival is clearly visible as its own beat, not a simultaneous flash. */
const STEP_MS = 80;

/** Cap on how many items actually stagger (0-indexed) — long lists/grids settle after this many instead of dragging the cascade out. Combined with STEP_MS/duration below, the capped tail still finishes well under a second. */
const MAX_STAGGERED_ITEMS = 4;

/** Tailwind/tw-animate-css classes for a staggered fade + slight rise entrance. Pair with `staggerDelay(index)` for the per-item delay. `duration-500` gives the motion itself room to read as a gentle glide rather than a snap; `fill-mode-backwards` keeps the item invisible during its delay instead of flashing at full opacity first. */
export const STAGGER_ITEM_CLASS = "animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-500 ease-out";

/** Inline style carrying an item's entrance delay, capped so item N+ all fire together rather than trailing out indefinitely. */
export function staggerDelay(index: number): CSSProperties {
  return { animationDelay: `${Math.min(index, MAX_STAGGERED_ITEMS) * STEP_MS}ms` };
}
