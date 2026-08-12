"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { EmployeeMyDay } from "@/components/my-day/employee-my-day";
import { SupervisorMyDay } from "@/components/my-day/supervisor-my-day";
import { SuperadminMyDay } from "@/components/my-day/superadmin-my-day";

export default function MyDayPage() {
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
