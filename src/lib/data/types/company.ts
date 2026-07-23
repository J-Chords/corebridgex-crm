export type CompanyStatus = "prospect" | "active" | "dormant" | "churned";

export interface Company {
  id: string;
  name: string;
  status: CompanyStatus;
  brandId: string;
  primaryContactId: string | null;
  contractStartDate: string | null;
  renewalDate: string | null;
  /** Soft-delete flag — churned/removed companies are deactivated, never hard-deleted. */
  active: boolean;
  createdAt: string;
}
