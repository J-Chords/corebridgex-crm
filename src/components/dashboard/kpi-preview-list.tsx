import Link from "next/link";
import { STAGGER_ITEM_CLASS, staggerDelay } from "@/lib/stagger";
import { cn } from "@/lib/utils";

export interface KpiPreviewItem {
  id: string;
  title: string;
  subtitle?: string;
  /** Omit for a non-navigable row (e.g. a name with no detail page to link to, like a staff list with no admin/users view yet). */
  href?: string;
}

interface KpiPreviewListProps {
  items: KpiPreviewItem[];
  emptyMessage: string;
}

/**
 * The small "quick glimpse" list shown inside an expanded KPI card — same row shape/hover convention
 * `UpcomingDeadlinesCard`'s rows already use, so a preview row looks identical to every other
 * clickable task/company row in the app. Deliberately just title + one-line subtitle, nothing more —
 * a peek, not a second copy of the destination page.
 */
export function KpiPreviewList({ items, emptyMessage }: KpiPreviewListProps) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="flex flex-col">
      {items.map((item, i) => {
        const content = (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover/row:underline">{item.title}</span>
            {item.subtitle && <span className="shrink-0 text-xs text-muted-foreground">{item.subtitle}</span>}
          </>
        );
        return (
          <li key={item.id}>
            {item.href ? (
              <Link
                href={item.href}
                className={cn(
                  "group/row -mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60 hover:no-underline",
                  STAGGER_ITEM_CLASS
                )}
                style={staggerDelay(i)}
              >
                {content}
              </Link>
            ) : (
              <div className={cn("-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5", STAGGER_ITEM_CLASS)} style={staggerDelay(i)}>
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
