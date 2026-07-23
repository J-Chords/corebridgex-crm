import { Building2, Users, ListChecks, UserPlus, FileBarChart } from "lucide-react";
import type { User } from "@/lib/data/types";
import { PlaceholderCard } from "./placeholder-card";
import { StatCard } from "@/components/ui/stat-card";

const ORG_COUNTS = [
  { label: "Clients", icon: Building2 },
  { label: "Staff", icon: Users },
  { label: "Tasks", icon: ListChecks },
];

export function SuperadminDashboard({ user }: { user: User }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {user.fullName}</h1>
        <p className="text-sm text-muted-foreground">
          Org-wide visibility across every client, team, and brand.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {ORG_COUNTS.map(({ label, icon }) => (
          <StatCard key={label} label={label} value="—" icon={icon} caption="Live in Phase 1" />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <PlaceholderCard icon={UserPlus} title="Manage & Invite Accounts" comingIn="Phase 1" />
        <PlaceholderCard icon={ListChecks} title="Org-wide Task Status" comingIn="Phase 1" />
        <PlaceholderCard icon={FileBarChart} title="All Reports (every role)" comingIn="Phase 2" />
      </div>
    </div>
  );
}
