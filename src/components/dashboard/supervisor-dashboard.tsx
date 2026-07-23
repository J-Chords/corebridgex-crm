import { CheckSquare, Clock, Bell, Sun, Users, BarChart3 } from "lucide-react";
import type { User } from "@/lib/data/types";
import { PlaceholderCard } from "./placeholder-card";

export function SupervisorDashboard({ user }: { user: User }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {user.fullName}</h1>
        <p className="text-sm text-muted-foreground">
          Your team&apos;s work, plus everything on your own plate.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Your work
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PlaceholderCard icon={Sun} title="My Day" comingIn="Phase 1" />
          <PlaceholderCard icon={CheckSquare} title="My Tasks" comingIn="Phase 1" />
          <PlaceholderCard icon={Clock} title="Time Tracked Today" comingIn="Phase 1" />
          <PlaceholderCard icon={Bell} title="Notifications" comingIn="Phase 1" />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Team oversight
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <PlaceholderCard icon={Users} title="My Team" comingIn="Phase 1" />
          <PlaceholderCard icon={CheckSquare} title="Team Tasks & Progress" comingIn="Phase 1" />
          <PlaceholderCard icon={BarChart3} title="Team Reports" comingIn="Phase 2" />
        </div>
      </div>
    </div>
  );
}
