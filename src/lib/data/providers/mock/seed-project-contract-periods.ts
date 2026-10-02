import type { ProjectContractPeriod } from "../../types";

/**
 * Phase 6A/6B (CD-215/CD-216) — fictional demo fixture data only, covering the scenarios QA needs
 * without mutating hosted. These are NOT a mathematically-generated backfill from `contractStartDate`
 * — every row here is deliberately handwritten to represent a specific, real-looking recorded
 * period, matching the locked "actual recorded business periods, never fabricated" rule that governs
 * this feature everywhere else (including the real hosted migration, which starts with zero rows).
 *
 * Scenarios covered:
 * - `project-company-1` (Alderleaf Manufacturing, Active): a two-period chain — an expired full
 *   calendar year (2025), renewed into the current full calendar year (2026). Covers "current Jan
 *   1–Dec 31 period," "expired period," "chain continuity," and "a non-leaf period cannot be
 *   removed" (2025 has a successor; only 2026 is the removable leaf).
 * - `project-company-2` (Brightwell Retail Group, Active): one period, a genuine partial first year
 *   (2026-05-04 → 2026-12-31), no predecessor. Covers "initial partial-year current period" and
 *   "correct the sole root period's start."
 * - `project-company-3` through `project-company-9` and Internal deliberately have NO recorded
 *   period, EXCEPT company-4/5/6 below — covers "Project with no recorded contract period" and (for
 *   one of them) "Record Contract Period" on an Admin-eligible, still-active Project.
 * - `project-company-4` (Dunmore & Vance LLP, Active): a current full year (2026) already renewed
 *   early into 2027 — covers "current + Upcoming" (the 2027 row is Upcoming, not yet Current; 2026
 *   remains Current until its own `periodEnd`).
 * - `project-company-5` (Everline Foods, On Hold — see `seed-projects.ts`'s status override): one
 *   current period — covers "On Hold Project with a renewable leaf" (renewal-eligible lifecycle,
 *   Section K).
 * - `project-company-6` (Fenwick Textiles, Completed — see `seed-projects.ts`'s status override):
 *   one expired historical period — covers "Completed Project with history but renewal unavailable."
 */
const period2025Id = "contract-period-company-1-2025";
const period2026Id = "contract-period-company-1-2026";
const period2026UpcomingBaseId = "contract-period-company-4-2026";

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
  {
    id: period2026UpcomingBaseId,
    projectId: "project-company-4",
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    createdAt: "2026-01-03T09:00:00.000Z",
    createdById: "user-superadmin-1",
    renewedFromPeriodId: null,
  },
  {
    id: "contract-period-company-4-2027",
    projectId: "project-company-4",
    // Recorded early (October 2026), well before the 2026 period's own Dec 31 end — demonstrates
    // locked model section 9 ("an Admin may record next year's renewal in advance") and section M
    // ("the still-active period remains Current Contract until its period_end; the future row is
    // Upcoming").
    periodStart: "2027-01-01",
    periodEnd: "2027-12-31",
    createdAt: "2026-10-02T09:00:00.000Z",
    createdById: "user-superadmin-1",
    renewedFromPeriodId: period2026UpcomingBaseId,
  },
  {
    id: "contract-period-company-5-2026",
    projectId: "project-company-5",
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    createdAt: "2026-01-04T09:00:00.000Z",
    createdById: "user-superadmin-1",
    renewedFromPeriodId: null,
  },
  {
    id: "contract-period-company-6-2024",
    projectId: "project-company-6",
    periodStart: "2024-01-01",
    periodEnd: "2024-12-31",
    createdAt: "2024-01-05T09:00:00.000Z",
    createdById: "user-superadmin-1",
    renewedFromPeriodId: null,
  },
];
