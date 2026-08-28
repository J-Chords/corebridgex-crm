import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { identityColorForCompany } from "@/lib/data/identity-color";
import { getInitials } from "@/lib/initials";
import { cn } from "@/lib/utils";

interface CompanyProjectAvatarProps {
  /** The stable identity key — always the underlying Company id, never a Project id, so every
   * related Project (e.g. across annual renewals) resolves to the same color. */
  companyId: string;
  /** Initials source — the Company's own name (the stable client identity), even when rendered
   * next to a Project's own name. This never introduces a second "Client:"/"Company:" label —
   * it's a visual identity aid only, Project stays the sole UI identity. */
  companyName: string;
  size?: "sm" | "default" | "lg";
  /** True only for the one permanently-seeded Internal/Non-billable Company/Project — gets a
   * neutral/system treatment instead of one of the 3 customer identity colors, so it never reads
   * as an ordinary client. */
  isInternal?: boolean;
  className?: string;
}

/**
 * Phase 13B — the one shared Company/Project identity avatar. Deterministic (same `companyId`
 * always the same color, see `identityColorForCompany`), initials-only (no image upload in v1, no
 * new column/migration), and deliberately squircle-shaped (`rounded-lg`) rather than circular —
 * circular avatars stay reserved for real people (Team/Assignee avatars) so the two never look
 * interchangeable at a glance.
 */
export function CompanyProjectAvatar({ companyId, companyName, size = "default", isInternal, className }: CompanyProjectAvatarProps) {
  const { background, foreground } = isInternal
    ? { background: "var(--muted)", foreground: "var(--muted-foreground)" }
    : identityColorForCompany(companyId);
  return (
    <Avatar size={size} className={cn("rounded-lg after:rounded-lg", className)}>
      <AvatarFallback className="rounded-lg font-semibold" style={{ backgroundColor: background, color: foreground }}>
        {getInitials(companyName)}
      </AvatarFallback>
    </Avatar>
  );
}
