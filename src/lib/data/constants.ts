/**
 * The pseudo-company non-billable/internal work is logged against. Special-cased
 * in permissions.ts so it's always selectable by every active staff member,
 * without needing to be added to everyone's assignedCompanyIds.
 */
export const INTERNAL_COMPANY_ID = "company-internal";

/** The workstream all Internal/Non-billable work is logged against — always accessible, mirroring INTERNAL_COMPANY_ID. */
export const INTERNAL_WORKSTREAM_ID = "workstream-internal";

/** The pseudo-brand Internal/Non-billable work belongs to — not a real partner brand, excluded from per-brand breakdowns. */
export const INTERNAL_BRAND_ID = "brand-internal";
