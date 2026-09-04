export type CompanyStatus = "prospect" | "active" | "dormant" | "churned";

export interface Company {
  id: string;
  name: string;
  status: CompanyStatus;
  /** Optional (Project Level consolidation) — a brand-new client may exist with no Brand chosen
   * yet; Brand is client/master data, never a required Project attribute. Genuinely required for
   * any Service (Workstream) created under this Company — `create_workstream`/`apply_template`
   * raise a clear, honest error rather than a raw constraint violation when it's still null. */
  brandId: string | null;
  primaryContactId: string | null;
  contractStartDate: string | null;
  renewalDate: string | null;
  /** Soft-delete flag — churned/removed companies are deactivated, never hard-deleted. */
  active: boolean;
  createdAt: string;
}
