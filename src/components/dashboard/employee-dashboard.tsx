import { CheckSquare, Clock, Bell, Sun } from "lucide-react";
import type { User } from "@/lib/data/types";
import { PlaceholderCard } from "./placeholder-card";

export function EmployeeDashboard({ user }: { user: User }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome, {user.fullName}</h1>
        <p className="text-sm text-muted-foreground">
          Your day at a glance. Task tracking and time tracking arrive in Phase 1.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PlaceholderCard icon={Sun} title="My Day" comingIn="Phase 1" />
        <PlaceholderCard icon={CheckSquare} title="My Tasks" comingIn="Phase 1" />
        <PlaceholderCard icon={Clock} title="Time Tracked Today" comingIn="Phase 1" />
        <PlaceholderCard icon={Bell} title="Notifications" comingIn="Phase 1" />
      </div>
    </div>
  );
}
