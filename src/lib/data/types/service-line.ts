export interface ServiceLine {
  id: string;
  name: string;
  /** Global catalog metadata (Service Level Phase B) — null description is a valid "not written yet" state. */
  description: string | null;
  /** Inactive Services stay referentially intact (historical Workstreams/Templates keep pointing at
   * them) but must not be offered as a new Project Service choice — see `listServiceLines` callers,
   * which filter to active-only for pickers, vs. the Admin catalog's own `listAll`, which shows both. */
  isActive: boolean;
  /** Null only for a Service that predates this column (seed/legacy data) — never fabricate a
   * creator for those; show a truthful "legacy — creator not recorded" state instead. */
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Join row: a company offering a given service line, with per-line custom fields (Phase 3). */
export interface CompanyServiceLine {
  companyId: string;
  serviceLineId: string;
  customFields: Record<string, unknown>;
}
