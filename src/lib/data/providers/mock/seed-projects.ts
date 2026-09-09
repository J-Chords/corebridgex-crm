import type { Project } from "../../types";
import { INTERNAL_COMPANY_ID } from "../../constants";
import { seedCompanies } from "./seed-companies";
import { seedWorkstreams } from "./seed-workstreams";
import { seedUsers } from "./seed-users";
import { projectIdForCompany } from "./project-id-for-company";

/**
 * Deterministic backfill, mirroring the real hosted migration's own logic exactly
 * (20260815090001_projects_backfill.sql): one Project per Company (including Internal/
 * Non-billable), never fabricating a contract date the Company itself doesn't already have.
 *
 * - contractStartDate/contractEndDate copy company.contractStartDate/renewalDate verbatim (null
 *   stays null) — never computed as start + contractMonths, since that would assert a historical
 *   fact that was never actually recorded.
 * - Internal/Non-billable gets null contract dates unconditionally — internal work is not a
 *   one-year client contract.
 * - name is simply the Company's own name — Product Owner acceptance correction: Project IS the
 *   visible Client/Company identity, so the app must never generate a "{Company} {year}-{year}"
 *   label itself (a real year-suffixed name a person typed by hand is a different, untouched case).
 * - owner/createdBy resolve to whichever seeded Workstream already leads that Company (earliest
 *   by createdAt), falling back to the earliest-created Supervisor — never hardcoded.
 */
const earliestSupervisorId = seedUsers.find((u) => u.role === "supervisor")!.id;

function ownerFor(companyId: string): string {
  const companyWorkstreams = seedWorkstreams
    .filter((w) => w.companyId === companyId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return companyWorkstreams[0]?.leadUserId ?? earliestSupervisorId;
}

export const seedProjects: Project[] = seedCompanies.map((company) => {
  const isInternal = company.id === INTERNAL_COMPANY_ID;
  const owner = ownerFor(company.id);
  const contractStartDate = isInternal ? null : company.contractStartDate;
  const contractEndDate = isInternal ? null : company.renewalDate;

  return {
    id: projectIdForCompany(company.id),
    companyId: company.id,
    name: company.name,
    ownerId: owner,
    status: "active",
    contractStartDate,
    contractMonths: 12,
    contractEndDate,
    description: isInternal ? "Internal operational work — not an annual client contract." : null,
    completionDate: null,
    archivedAt: null,
    startDate: null,
    endDate: null,
    projectGroupId: null,
    tags: [],
    statusReason: null,
    statusChangedAt: null,
    statusChangedById: null,
    trashedAt: null,
    preTrashStatus: null,
    createdById: owner,
    createdAt: company.createdAt,
    updatedAt: company.createdAt,
  };
});
