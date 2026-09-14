"use client";

import { Suspense } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { EmployeeMyDay } from "@/components/my-day/employee-my-day";
import { SupervisorMyDay } from "@/components/my-day/supervisor-my-day";
import { SuperadminMyDay } from "@/components/my-day/superadmin-my-day";

function MyDayPageContent() {
  const { user } = useAuth();
  if (!user) return null;

  switch (user.role) {
    case "employee":
      return <EmployeeMyDay user={user} />;
    case "supervisor":
      return <SupervisorMyDay user={user} />;
    case "superadmin":
      return <SuperadminMyDay user={user} />;
  }
}

// `useSearchParams` (used by each role variant to seed its `?view=` tab from a deep link, e.g. the
// retired Planner route's redirect) requires a Suspense boundary above it.
export default function MyDayPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <MyDayPageContent />
    </Suspense>
  );
}
