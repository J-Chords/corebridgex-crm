import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { identityColorForServiceLine } from "@/lib/data/identity-color";
import { getInitials } from "@/lib/initials";
import { cn } from "@/lib/utils";

interface ServiceAvatarProps {
  /** Stable identity key — the Service's global Service Line id where it has one, so every
   * Project's instance of the same catalog Service (e.g. "Accounting") always resolves to the
   * same color; pass the Workstream's own id instead for a custom/ad-hoc Service with no Service
   * Line. Never the Project Service Lead's user id — this avatar represents the Service, not a
   * person. */
  serviceKey: string;
  /** Initials source — the Service's own display name (`workstreamDisplayHeading`), never the
   * lead's name. */
  serviceName: string;
  size?: "sm" | "default" | "lg";
  className?: string;
}

/**
 * The one shared Service identity avatar — used identically on the Project Services list row and
 * the Service Detail page header, so a given Service always reads as the same visual entity on
 * both surfaces. Deterministic (same `serviceKey` always the same color, see
 * `identityColorForServiceLine`), initials-only (no new column/migration), and squircle-shaped
 * (`rounded-lg`) like `CompanyProjectAvatar` — never circular, so it's never mistaken for the
 * Service Lead's own person avatar elsewhere on the same row/page.
 */
export function ServiceAvatar({ serviceKey, serviceName, size = "default", className }: ServiceAvatarProps) {
  const { background, foreground } = identityColorForServiceLine(serviceKey);
  return (
    <Avatar size={size} className={cn("rounded-lg after:rounded-lg", className)}>
      <AvatarFallback className="rounded-lg font-semibold" style={{ backgroundColor: background, color: foreground }}>
        {getInitials(serviceName)}
      </AvatarFallback>
    </Avatar>
  );
}
