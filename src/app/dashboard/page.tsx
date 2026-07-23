"use client";

import { useAuth } from "@/lib/auth/auth-context";
import { EmployeeDashboard } from "@/components/dashboard/employee-dashboard";
import { SupervisorDashboard } from "@/components/dashboard/supervisor-dashboard";
import { SuperadminDashboard } from "@/components/dashboard/superadmin-dashboard";

export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  switch (user.role) {
    case "superadmin":
      return <SuperadminDashboard user={user} />;
    case "supervisor":
      return <SupervisorDashboard user={user} />;
    case "employee":
      return <EmployeeDashboard user={user} />;
  }
}
