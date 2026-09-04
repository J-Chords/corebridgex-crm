import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials as initials } from "@/lib/initials";

export interface PersonRef {
  id: string;
  fullName: string;
}

/**
 * Shared "avatar + first person's full name, +N for the rest" pattern — never bare, unexplained
 * initials alone when there's a name to show. A title tooltip always lists everyone, so overflow is
 * never truly hidden. Used by the Project list (Team/Team Leads columns) and the Project Overview
 * (Team panel) — one component, not two independently-drifting copies.
 */
export function PeopleInline({ people, emptyText = "—" }: { people: PersonRef[]; emptyText?: string }) {
  if (people.length === 0) return <span className="text-xs text-muted-foreground">{emptyText}</span>;
  const [first, ...rest] = people;
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={people.map((p) => p.fullName).join(", ")}>
      <Avatar size="sm" className="shrink-0 ring-2 ring-card">
        <AvatarFallback className="text-[0.6rem]">{initials(first.fullName)}</AvatarFallback>
      </Avatar>
      <span className="truncate text-xs text-muted-foreground">
        {first.fullName}
        {rest.length > 0 && ` +${rest.length}`}
      </span>
    </span>
  );
}
