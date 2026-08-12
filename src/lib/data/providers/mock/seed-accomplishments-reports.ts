import type { AccomplishmentsReport } from "../../types";

/**
 * A couple of illustrative example reports — one draft, one finalized — so the reports
 * list/detail pages have something to show on first load without generating one first.
 * Real reports are always produced by AccomplishmentsReportProvider.generateReport, never
 * hand-authored elsewhere; these two are the only exception, seeded once as demo data.
 */
export const seedAccomplishmentsReports: AccomplishmentsReport[] = [
  {
    id: "report-1",
    kind: "person",
    subjectId: "user-employee-1",
    subjectLabel: "Alicia Chen",
    rangeLabel: "this-week",
    rangeStart: "2026-07-20",
    rangeEnd: "2026-07-26",
    status: "finalized",
    brandSections: [
      {
        brandId: "brand-sparing",
        brandName: "Sparing Consulting",
        departments: [
          {
            departmentId: "dept-sparing-accounting",
            departmentName: "Accounting",
            activities: [
              {
                activityId: "activity-sparing-accounting-reconciliation",
                activityName: "Reconciliation",
                done: true,
                detail: "- Reconcile Q2 books (4.5h): Discussed Q2 variance with client, pending sign-off",
                sourceTaskIds: ["task-1"],
                companyLabel: "Alderleaf Manufacturing",
              },
            ],
          },
        ],
        other: {
          activityId: null,
          activityName: "Other (untagged)",
          done: false,
          detail: "",
          sourceTaskIds: [],
          companyLabel: "",
        },
        otherIncluded: false,
      },
    ],
    comments: [],
    history: [
      {
        id: "report-1-history-1",
        type: "finalized",
        actorId: "user-employee-1",
        actorName: "Alicia Chen",
        createdAt: "2026-07-27T09:15:00.000Z",
      },
    ],
    generatedById: "user-employee-1",
    generatedByName: "Alicia Chen",
    generatedAt: "2026-07-27T09:00:00.000Z",
    finalizedAt: "2026-07-27T09:15:00.000Z",
    deletedAt: null,
    createdAt: "2026-07-27T09:00:00.000Z",
    updatedAt: "2026-07-27T09:15:00.000Z",
  },
  {
    id: "report-2",
    kind: "client",
    subjectId: "company-1",
    subjectLabel: "Alderleaf Manufacturing",
    rangeLabel: "today",
    rangeStart: "2026-07-27",
    rangeEnd: "2026-07-27",
    status: "draft",
    brandSections: [
      {
        brandId: "brand-sparing",
        brandName: "Sparing Consulting",
        departments: [
          {
            departmentId: "dept-sparing-accounting",
            departmentName: "Accounting",
            activities: [
              {
                activityId: "activity-sparing-accounting-reconciliation",
                activityName: "Reconciliation",
                done: false,
                detail: "",
                sourceTaskIds: [],
                companyLabel: "",
              },
            ],
          },
        ],
        other: {
          activityId: null,
          activityName: "Other (untagged)",
          done: false,
          detail: "",
          sourceTaskIds: [],
          companyLabel: "",
        },
        otherIncluded: false,
      },
    ],
    comments: [],
    history: [],
    generatedById: "user-supervisor-1",
    generatedByName: "Priya Nair",
    generatedAt: "2026-07-27T09:20:00.000Z",
    finalizedAt: null,
    deletedAt: null,
    createdAt: "2026-07-27T09:20:00.000Z",
    updatedAt: "2026-07-27T09:20:00.000Z",
  },
];
