-- Phase 8B final hardening pass — expand the real Activity Catalog from the mock source of truth
-- (src/lib/data/providers/mock/seed-activities.ts, seed-departments.ts, seed-service-lines.ts).
--
-- Current real state before this migration: only 3 of Sparing Consulting's 5 mock departments
-- exist (Human Resources, Payroll, Accounting — 2 demo activities each); Compliance and File
-- Management don't exist in the real schema at all yet. Tax, IT/Digital, and Consulting have no
-- mock departments/activities to mirror at all (the mock's own seed-departments.ts only ever
-- populated 5 of the 8 seed-service-lines.ts entries) — nothing invented for those three here.
--
-- Idempotent and additive only:
--   - Departments: inserted only if a department with that exact name doesn't already exist for
--     Sparing Consulting (there is no DB-level unique constraint on (brand_id, name), so this guard
--     is the only thing preventing a re-run from duplicating them).
--   - Activities: matched CASE-INSENSITIVELY by name within each department before inserting — the
--     existing real "Payroll Processing" is recognized as the same activity as the mock's "Payroll
--     processing" and is left untouched, not duplicated. The existing real "Employee Offboarding",
--     "Payroll Reconciliation", "Bank Reconciliation", and "Month-End Close" have no equivalent in
--     the mock catalog at all — they are pre-existing, real, and are NOT touched or removed; the
--     mock's own activities are simply added alongside them. New activities are appended after each
--     department's current max `position`, in the mock's own listed order.
--   - workstream_activities (the actual per-Service selected subset) is never touched by this
--     migration — every existing Workstream's selections are completely unaffected, and zero rows
--     still means zero selected Activities. Nothing new is auto-attached to any existing Workstream.
--
-- Department creation runs as its own statement, before the activities insert below — a
-- data-modifying CTE's own INSERT is never visible to a sibling CTE's read of the same table
-- within that same statement (Postgres evaluates every WITH-clause branch against the snapshot at
-- the start of the statement), so the two must be genuinely separate statements for the activities
-- insert to see the newly-created departments.

insert into public.departments (brand_id, name, position, service_line_id)
select b.id, nd.department_name, nd.dept_position, sl.id
from (
  values
    ('Compliance', 3, 'Compliance'),
    ('File Management', 4, 'File Management')
) as nd(department_name, dept_position, service_line_name)
join public.brands b on b.name = 'Sparing Consulting'
join public.service_lines sl on sl.name = nd.service_line_name
where not exists (
  select 1 from public.departments d where d.brand_id = b.id and d.name = nd.department_name
);

with mock_activities(department_name, activity_name, default_task_titles, list_position) as (
  values
    -- Human Resources
    ('Human Resources', 'New Hire', array['Collect I-9 and W-4','Set up payroll profile','Send welcome email and handbook'], 0),
    ('Human Resources', 'Employee Handbook policy update', array[]::text[], 1),
    ('Human Resources', 'Employee Handbook acknowledgement', array[]::text[], 2),
    ('Human Resources', 'Employee access', array[]::text[], 3),
    ('Human Resources', 'Benefits', array[]::text[], 4),
    ('Human Resources', 'Benefits onboarding', array[]::text[], 5),
    ('Human Resources', 'Employee list cleanup', array[]::text[], 6),
    ('Human Resources', 'Resignation letters', array[]::text[], 7),
    ('Human Resources', 'Job description', array[]::text[], 8),
    ('Human Resources', 'Job posting', array[]::text[], 9),
    ('Human Resources', 'I-9 audit', array[]::text[], 10),
    ('Human Resources', 'W-4 updates', array[]::text[], 11),
    ('Human Resources', 'Employee request', array[]::text[], 12),
    ('Human Resources', 'Paid time off requests', array[]::text[], 13),
    ('Human Resources', 'Sick leave requests', array[]::text[], 14),
    ('Human Resources', 'Contractors', array[]::text[], 15),
    ('Human Resources', 'Other', array[]::text[], 16),
    -- Payroll
    ('Payroll', 'Payroll processing', array['Review submitted timesheets','Process payroll run','Distribute pay stubs'], 0),
    ('Payroll', 'Forever payroll notes', array[]::text[], 1),
    ('Payroll', 'Department', array[]::text[], 2),
    ('Payroll', 'Timesheets', array[]::text[], 3),
    ('Payroll', 'GLI', array[]::text[], 4),
    ('Payroll', 'Overtime tracker', array[]::text[], 5),
    ('Payroll', 'Invoices', array[]::text[], 6),
    ('Payroll', 'Employee loans/advances/misc.', array[]::text[], 7),
    ('Payroll', 'Mileage', array[]::text[], 8),
    ('Payroll', 'Reimbursements', array[]::text[], 9),
    ('Payroll', 'Earnings', array[]::text[], 10),
    ('Payroll', 'Deductions', array[]::text[], 11),
    ('Payroll', 'Special Payrolls', array[]::text[], 12),
    ('Payroll', 'Manual checks', array[]::text[], 13),
    ('Payroll', 'Payroll corrections', array[]::text[], 14),
    ('Payroll', 'Direct deposit', array[]::text[], 15),
    ('Payroll', 'Jurisdiction', array[]::text[], 16),
    ('Payroll', 'Other', array[]::text[], 17),
    -- Accounting
    ('Accounting', 'Receipts', array[]::text[], 0),
    ('Accounting', 'Payment requests', array[]::text[], 1),
    ('Accounting', 'Check printing', array[]::text[], 2),
    ('Accounting', 'Loan/mortgage documentation', array[]::text[], 3),
    ('Accounting', 'Pre-paid accounts', array[]::text[], 4),
    ('Accounting', 'Bank statements', array['Download monthly statement','Reconcile against ledger','File reconciliation report'], 5),
    ('Accounting', 'Chart of accounts', array[]::text[], 6),
    ('Accounting', 'Tax credits', array[]::text[], 7),
    ('Accounting', 'Fixed asset management', array[]::text[], 8),
    ('Accounting', 'Tax estimation', array[]::text[], 9),
    ('Accounting', 'New accounts (credit cards/bank etc)', array[]::text[], 10),
    ('Accounting', 'Tax payments', array[]::text[], 11),
    ('Accounting', 'Deadlines', array[]::text[], 12),
    ('Accounting', 'Extensions', array[]::text[], 13),
    ('Accounting', 'Transaction categorization', array[]::text[], 14),
    ('Accounting', 'Reconciliation', array[]::text[], 15),
    ('Accounting', 'Transaction inquiry', array[]::text[], 16),
    ('Accounting', 'Month end review/adjustments', array[]::text[], 17),
    ('Accounting', 'Financial statements', array[]::text[], 18),
    ('Accounting', 'Other', array[]::text[], 19),
    -- Compliance
    ('Compliance', 'Agency notices and resolutions', array[]::text[], 0),
    ('Compliance', 'Worker''s compensation', array[]::text[], 1),
    ('Compliance', 'Retirement', array[]::text[], 2),
    ('Compliance', 'Overtime', array[]::text[], 3),
    ('Compliance', 'Good standing', array[]::text[], 4),
    ('Compliance', 'Clean hands', array[]::text[], 5),
    ('Compliance', 'Minimum wage', array[]::text[], 6),
    ('Compliance', 'FLSA', array[]::text[], 7),
    ('Compliance', 'Paid time off', array[]::text[], 8),
    ('Compliance', 'Labor law posters', array['Verify current posters are displayed','Order replacement posters','Confirm state-specific requirements'], 9),
    ('Compliance', 'ACA', array[]::text[], 10),
    ('Compliance', 'POA updates', array[]::text[], 11),
    ('Compliance', 'Other', array[]::text[], 12),
    -- File Management
    ('File Management', 'Payroll binder', array[]::text[], 0),
    ('File Management', 'Agency notices and resolutions binder', array[]::text[], 1),
    ('File Management', 'Monthly accounting binder', array[]::text[], 2),
    ('File Management', 'Quarterly accounting binder', array[]::text[], 3),
    ('File Management', 'Monthly payment request binder', array[]::text[], 4),
    ('File Management', 'Benefit policy and notices binder', array[]::text[], 5),
    ('File Management', 'Payroll quarterly and annual filings binder', array[]::text[], 6),
    ('File Management', 'Employee folders', array['Create new employee folder','File signed onboarding documents','Audit folder for completeness'], 7),
    ('File Management', 'Contractor folders', array[]::text[], 8),
    ('File Management', 'Other', array[]::text[], 9)
),
resolved as (
  select d.id as department_id, ma.activity_name, ma.default_task_titles, ma.list_position
  from mock_activities ma
  join public.departments d
    on d.name = ma.department_name
    and d.brand_id = (select id from public.brands where name = 'Sparing Consulting')
),
to_insert as (
  select
    r.department_id,
    r.activity_name,
    r.default_task_titles,
    (select coalesce(max(a.position), -1) from public.activities a where a.department_id = r.department_id)
      + row_number() over (partition by r.department_id order by r.list_position) as new_position
  from resolved r
  where not exists (
    select 1 from public.activities a
    where a.department_id = r.department_id and lower(a.name) = lower(r.activity_name)
  )
)
insert into public.activities (department_id, name, position, default_task_titles)
select department_id, activity_name, new_position, default_task_titles from to_insert;
