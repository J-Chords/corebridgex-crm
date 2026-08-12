"use client";

import { useCompanies, useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Superadmin only. Real counts from data already tracked — no dead links to pages that don't exist yet (in-app brand/service-line/user management are all later phases; see docs/route-map.md). */
export function WorkspaceSection() {
  const { brands, serviceLines, assignableStaff } = useCompanyLookups();
  const { companies } = useCompanies();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Partner brands</CardTitle>
          <CardDescription>
            {plural(brands.length, "brand")} configured, across {plural(companies.length, "client")}. Full
            in-app brand management is a later phase.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {brands.map((b) => (
            <Badge key={b.id} variant="neutral">
              {b.name}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Service lines</CardTitle>
          <CardDescription>
            {plural(serviceLines.length, "service line")} defined across all brands. Full in-app service-line
            management is a later phase.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {serviceLines.map((sl) => (
            <Badge key={sl.id} variant="neutral">
              {sl.name}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User management</CardTitle>
          <CardDescription>
            {plural(assignableStaff.length, "active staff member")} today. A dedicated invite/manage-accounts
            page (`/dashboard/admin/users`) is planned but not built yet.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
