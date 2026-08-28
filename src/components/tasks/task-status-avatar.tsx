import { STATUS_COLOR_VAR, STATUS_META } from "@/components/tasks/task-status-badge";
import type { TaskStatus } from "@/lib/data/types";
import { cn } from "@/lib/utils";

/**
 * "Prepare VAT Return" → "PV" (first letter of each of the first two words). "Monthly Payroll" →
 * "MP". A single-word title ("Audit") gets one letter ("A"), not a padded two — a single real
 * initial reads better than repeating/duplicating a letter. Punctuation-only or empty titles
 * resolve to "" (the caller — always a real, already-validated Task title in practice — never
 * needs to handle that specially; the create-form's own live preview is the only place a genuinely
 * empty title can reach this, and it just renders a blank badge until one exists).
 */
export function taskAvatarInitials(title: string): string {
  const words = title
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-zA-Z0-9]/.test(w));
  if (words.length === 0) return "";
  const firstLetter = (word: string) => word.match(/[a-zA-Z0-9]/)?.[0] ?? "";
  const initials = words.length === 1 ? firstLetter(words[0]) : firstLetter(words[0]) + firstLetter(words[1]);
  return initials.toUpperCase();
}

interface TaskStatusAvatarProps {
  title: string;
  status: TaskStatus;
  size?: "sm" | "default";
  className?: string;
}

/**
 * Phase 13B final polish — every Task's own visual identity: title-derived initials (never stored,
 * always recomputed) colored by its CURRENT `status` via the same canonical `STATUS_COLOR_VAR`
 * every other status-tinted element in the app already reads from — so a status change repaints
 * this immediately, with no separate/stale color state. Deliberately `rounded-md` (a compact
 * badge, not `rounded-lg`/squircle like `CompanyProjectAvatar`, and not `rounded-full` like a
 * person `Avatar`) so all three identity concepts — Task / Project·Company / Person — stay visually
 * distinct at a glance, never confusable as "another person avatar."
 */
export function TaskStatusAvatar({ title, status, size = "default", className }: TaskStatusAvatarProps) {
  const color = STATUS_COLOR_VAR[status];
  const label = STATUS_META[status].label;
  const initials = taskAvatarInitials(title);
  return (
    <span
      role="img"
      aria-label={`${title} — ${label}`}
      title={`${title} — ${label}`}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md font-semibold tabular-nums",
        size === "sm" ? "size-6 text-[10px]" : "size-7 text-xs",
        className
      )}
      style={{
        backgroundColor: `color-mix(in oklch, ${color} 28%, var(--card))`,
        color: `color-mix(in oklch, ${color} 85%, var(--foreground))`,
        border: `1px solid color-mix(in oklch, ${color} 55%, transparent)`,
      }}
    >
      {initials}
    </span>
  );
}
