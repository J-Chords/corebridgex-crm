import type { Department } from "../../types";

/**
 * Each brand owns its own departments independently — these five belong to
 * Sparing Consulting only, not shared/inherited by the other partner brands.
 * EdgeNovelty, Bill Optimum, VeroTax Advisory, and Croki Digital start with
 * zero departments — ready to be populated later, not defaulted from this list.
 *
 * Each department maps 1:1 to the service line of the same name (see seed-service-lines.ts) — this
 * is what lets a workstream's own service line narrow the activity picker down to just this one
 * department's activities instead of Sparing's whole five-department catalog.
 */
export const seedDepartments: Department[] = [
  { id: "dept-sparing-hr", brandId: "brand-sparing", name: "Human Resources", position: 0, serviceLineId: "svc-hr" },
  { id: "dept-sparing-payroll", brandId: "brand-sparing", name: "Payroll", position: 1, serviceLineId: "svc-payroll" },
  { id: "dept-sparing-accounting", brandId: "brand-sparing", name: "Accounting", position: 2, serviceLineId: "svc-accounting" },
  { id: "dept-sparing-compliance", brandId: "brand-sparing", name: "Compliance", position: 3, serviceLineId: "svc-compliance" },
  { id: "dept-sparing-file-management", brandId: "brand-sparing", name: "File Management", position: 4, serviceLineId: "svc-file-management" },
];
