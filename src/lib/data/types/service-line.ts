export interface ServiceLine {
  id: string;
  name: string;
}

/** Join row: a company offering a given service line, with per-line custom fields (Phase 3). */
export interface CompanyServiceLine {
  companyId: string;
  serviceLineId: string;
  customFields: Record<string, unknown>;
}
