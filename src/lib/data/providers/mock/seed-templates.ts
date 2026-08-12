import type { Template } from "../../types";

export const seedTemplates: Template[] = [
  {
    id: "template-payroll-onboarding",
    name: "Payroll Client Onboarding",
    description: "Standard checklist for bringing a new payroll client fully live.",
    serviceLineId: "svc-payroll",
    recurrenceFrequency: null,
    recurrenceCustomIntervalDays: null,
    createdById: "user-superadmin-1",
    createdAt: "2026-01-15T09:00:00.000Z",
    updatedAt: "2026-01-15T09:00:00.000Z",
  },
  {
    id: "template-quarterly-tax",
    name: "Quarterly Tax Filing",
    description: "Recurring quarterly tax preparation and filing workflow.",
    serviceLineId: "svc-tax",
    recurrenceFrequency: "quarterly",
    recurrenceCustomIntervalDays: null,
    createdById: "user-superadmin-1",
    createdAt: "2026-01-15T09:00:00.000Z",
    updatedAt: "2026-01-15T09:00:00.000Z",
  },
  {
    id: "template-monthly-bookkeeping",
    name: "Monthly Bookkeeping",
    description: "Recurring monthly close workflow for bookkeeping clients.",
    serviceLineId: "svc-accounting",
    recurrenceFrequency: "monthly",
    recurrenceCustomIntervalDays: null,
    createdById: "user-superadmin-1",
    createdAt: "2026-01-15T09:00:00.000Z",
    updatedAt: "2026-01-15T09:00:00.000Z",
  },
];
