export type ProjectStatus = "active" | "on-hold" | "completed" | "cancelled";

/**
 * The operational client engagement / annual contract layer between Company and Workstream.
 * UI term is always "Project" — never "Engagement" (that word was this app's own original,
 * later-retired name for what is now Workstream; reusing it here would resurrect a confusing
 * term for a different concept). A normal client Project represents one annual contract; the
 * Internal/Non-billable Company's Project has null contract dates (no annual-contract concept
 * applies to internal work) — see `INTERNAL_COMPANY_ID`.
 */
export interface Project {
  id: string;
  companyId: string;
  name: string;
  ownerId: string;
  status: ProjectStatus;
  /** Null when no reliable historical contract date exists — never fabricated. */
  contractStartDate: string | null;
  /** Forward-looking default (typically 12) for suggesting a renewal/end date on new/edited
   * Projects — never used to compute a historical contractEndDate that wasn't actually recorded. */
  contractMonths: number;
  /** Always stored, never derived — must support extensions and early terminations. Null when no
   * reliable historical renewal date exists. */
  contractEndDate: string | null;
  description: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

/** Join row: Project operational membership — the future access relationship, coexisting with
 * (not replacing) `user_companies` during the Phase 8 transition. */
export interface ProjectMember {
  projectId: string;
  userId: string;
}
