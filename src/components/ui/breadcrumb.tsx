import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  /** Omit on the last/current item — it renders as plain text, never a link to itself. */
  href?: string;
}

/**
 * Plain "A > B > C" hierarchy trail — no codebase-wide breadcrumb component existed before Phase 1's
 * Template workspace (only an ad hoc, non-reusable "Company / Services" string on the Service detail
 * page). Represents ACTUAL navigation hierarchy only — never a decorative label for a screen that
 * isn't really nested under the prior segment.
 */
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden="true">&gt;</span>}
          {item.href ? (
            <Link href={item.href} className="hover:text-foreground hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
