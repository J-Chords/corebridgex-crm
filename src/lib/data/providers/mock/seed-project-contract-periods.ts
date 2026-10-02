import type { ProjectContractPeriod } from "../../types";

/**
 * Phase 6A (CD-215) — fictional demo fixture data only, covering the scenarios QA needs without
 * mutating hosted. These are NOT a mathematically-generated backfill from `contractStartDate` —
 * every row here is deliberately handwritten to represent a specific, real-looking recorded period,
 * matching the locked "actual recorded business periods, never fabricated" rule that governs this
 * feature everywhere else (including the real hosted migration, which starts with zero rows).
 *
 * Scenarios covered:
 * - `project-company-1` (Alderleaf Manufacturing): a two-period chain — an expired full calendar
 *   year (2025), renewed into the current full calendar year (2026). Covers "current Jan 1–Dec 31
 *   period," "expired period," and "chain continuity."
 * - `project-company-2` (Brightwell Retail Group): one period, a genuine partial first year
 *   (2026-05-04 → 2026-12-31), no predecessor. Covers "initial partial-year current period."
 * - Every other seeded Project (company-3 through company-9, Internal) deliberately has NO recorded
 *   period — covers "Project with no recorded contract period."
 */
const period2025Id = "contract-period-company-1-2025";
const period2026Id = "contract-period-company-1-2026";

export const seedProjectContractPeriods: ProjectContractPeriod[] = [
  {
    id: period2025Id,
    projectId: "project-company-1",
    periodStart: "2025-01-01",
    periodEnd: "2025-12-31",
    createdAt: "2025-01-02T09:00:00.000Z",
    createdById: "user-superadmin-1",
    renewedFromPeriodId: null,
  },
  {
    id: period2026Id,
    projectId: "project-company-1",
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    createdAt: "2026-01-02T09:00:00.000Z",
    createdById: "user-superadmin-1",
    renewedFromPeriodId: period2025Id,
  },
  {
    id: "contract-period-company-2-2026",
    projectId: "project-company-2",
    periodStart: "2026-05-04",
    periodEnd: "2026-12-31",
    createdAt: "2026-05-05T09:00:00.000Z",
    createdById: "user-superadmin-1",
    renewedFromPeriodId: null,
  },
];
