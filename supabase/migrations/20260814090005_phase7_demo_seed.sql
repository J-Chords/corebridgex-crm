-- Phase 7 demo seed — representative development data for the core PSA chain, matching the
-- approved mock/demo business model. Fake company data only (already seeded in Foundation A/B —
-- this migration adds no new companies). No real client data, no passwords, no new Auth users.
-- Every real Supervisor/Employee identity is resolved dynamically by role (profiles.role,
-- ordered by created_at for determinism) — no id is ever hardcoded, so this file contains no
-- personal identifiers and stays valid regardless of which specific accounts exist.
--
-- Idempotent throughout: every insert is guarded by a NOT EXISTS check keyed to a natural
-- business key (department/activity name within its parent, workstream per company+service,
-- task per title+workstream), same idiom as the existing supabase/seed.sql.

-- ---------------------------------------------------------------------------
-- 1. Departments — Sparing Consulting only (the one brand with real Activity Catalog data in
--    the mock). EdgeNovelty/Bill Optimum/VeroTax/Croki Digital intentionally stay empty, exactly
--    like the mock — demonstrates the genuine "service has no catalog yet" case for real.
-- ---------------------------------------------------------------------------
insert into public.departments (brand_id, name, position, service_line_id)
select b.id, 'Human Resources', 0, sl.id
from public.brands b, public.service_lines sl
where b.name = 'Sparing Consulting' and sl.name = 'HR'
  and not exists (select 1 from public.departments d where d.brand_id = b.id and d.name = 'Human Resources');

insert into public.departments (brand_id, name, position, service_line_id)
select b.id, 'Payroll', 1, sl.id
from public.brands b, public.service_lines sl
where b.name = 'Sparing Consulting' and sl.name = 'Payroll'
  and not exists (select 1 from public.departments d where d.brand_id = b.id and d.name = 'Payroll');

insert into public.departments (brand_id, name, position, service_line_id)
select b.id, 'Accounting', 2, sl.id
from public.brands b, public.service_lines sl
where b.name = 'Sparing Consulting' and sl.name = 'Accounting'
  and not exists (select 1 from public.departments d where d.brand_id = b.id and d.name = 'Accounting');

-- ---------------------------------------------------------------------------
-- 2. Activities — a representative handful per department, not the mock's full 78.
-- ---------------------------------------------------------------------------
insert into public.activities (department_id, name, position, default_task_titles)
select d.id, a.name, a.position, a.titles
from public.departments d
join public.brands b on b.id = d.brand_id
cross join (values
  ('New Hire', 0, array['Collect I-9 and W-4', 'Set up payroll profile', 'Send welcome email and handbook']),
  ('Employee Offboarding', 1, array[]::text[])
) as a(name, position, titles)
where b.name = 'Sparing Consulting' and d.name = 'Human Resources'
  and not exists (select 1 from public.activities existing where existing.department_id = d.id and existing.name = a.name);

insert into public.activities (department_id, name, position, default_task_titles)
select d.id, a.name, a.position, a.titles
from public.departments d
join public.brands b on b.id = d.brand_id
cross join (values
  ('Payroll Processing', 0, array['Review submitted timesheets', 'Process payroll run', 'Distribute pay stubs']),
  ('Payroll Reconciliation', 1, array[]::text[])
) as a(name, position, titles)
where b.name = 'Sparing Consulting' and d.name = 'Payroll'
  and not exists (select 1 from public.activities existing where existing.department_id = d.id and existing.name = a.name);

insert into public.activities (department_id, name, position, default_task_titles)
select d.id, a.name, a.position, a.titles
from public.departments d
join public.brands b on b.id = d.brand_id
cross join (values
  ('Bank Reconciliation', 0, array[]::text[]),
  ('Month-End Close', 1, array[]::text[])
) as a(name, position, titles)
where b.name = 'Sparing Consulting' and d.name = 'Accounting'
  and not exists (select 1 from public.activities existing where existing.department_id = d.id and existing.name = a.name);

-- ---------------------------------------------------------------------------
-- 3. Workstreams — one Payroll + one Accounting for Alderleaf Manufacturing, one HR for Fenwick
--    Textiles (all Sparing/real-catalog), one IT/Digital for Junction Analytics (EdgeNovelty
--    brand, deliberately catalog-empty — demonstrates the "zero configured activities" state on
--    real data). Lead defaults to the one real development Supervisor.
-- ---------------------------------------------------------------------------
insert into public.workstreams (name, description, company_id, service_line_id, brand_id, lead_user_id, status, start_date, created_by)
select 'Payroll', 'Semi-monthly payroll runs and statutory filings.', c.id, sl.id, c.brand_id, sup.id, 'active', current_date, sup.id
from public.companies c, public.service_lines sl, (select id from public.profiles where role = 'supervisor' order by created_at limit 1) sup
where c.name = 'Alderleaf Manufacturing' and sl.name = 'Payroll'
  and not exists (select 1 from public.workstreams w where w.company_id = c.id and w.service_line_id = sl.id);

insert into public.workstreams (name, description, company_id, service_line_id, brand_id, lead_user_id, status, start_date, created_by)
select 'Accounting', 'Monthly close and reconciliation.', c.id, sl.id, c.brand_id, sup.id, 'active', current_date, sup.id
from public.companies c, public.service_lines sl, (select id from public.profiles where role = 'supervisor' order by created_at limit 1) sup
where c.name = 'Alderleaf Manufacturing' and sl.name = 'Accounting'
  and not exists (select 1 from public.workstreams w where w.company_id = c.id and w.service_line_id = sl.id);

insert into public.workstreams (name, description, company_id, service_line_id, brand_id, lead_user_id, status, start_date, created_by)
select 'HR', 'Ongoing HR support — onboarding and offboarding.', c.id, sl.id, c.brand_id, sup.id, 'active', current_date, sup.id
from public.companies c, public.service_lines sl, (select id from public.profiles where role = 'supervisor' order by created_at limit 1) sup
where c.name = 'Fenwick Textiles' and sl.name = 'HR'
  and not exists (select 1 from public.workstreams w where w.company_id = c.id and w.service_line_id = sl.id);

insert into public.workstreams (name, description, company_id, service_line_id, brand_id, lead_user_id, status, start_date, created_by)
select 'IT/Digital', 'Initial IT support discovery.', c.id, sl.id, c.brand_id, sup.id, 'active', current_date, sup.id
from public.companies c, public.service_lines sl, (select id from public.profiles where role = 'supervisor' order by created_at limit 1) sup
where c.name = 'Junction Analytics' and sl.name = 'IT/Digital'
  and not exists (select 1 from public.workstreams w where w.company_id = c.id and w.service_line_id = sl.id);

-- ---------------------------------------------------------------------------
-- 4. Workstream Activities — the real catalog workstreams each get their own real, matching
--    department's activities explicitly enabled (authoritative selection, not a fallback). The
--    Junction Analytics workstream gets none — its service genuinely has no catalog.
-- ---------------------------------------------------------------------------
insert into public.workstream_activities (workstream_id, activity_id)
select w.id, a.id
from public.workstreams w
join public.companies c on c.id = w.company_id
join public.departments d on d.service_line_id = w.service_line_id and d.brand_id = w.brand_id
join public.activities a on a.department_id = d.id
where c.name = 'Alderleaf Manufacturing' and w.name = 'Payroll'
  and not exists (select 1 from public.workstream_activities wa where wa.workstream_id = w.id and wa.activity_id = a.id);

insert into public.workstream_activities (workstream_id, activity_id)
select w.id, a.id
from public.workstreams w
join public.companies c on c.id = w.company_id
join public.departments d on d.service_line_id = w.service_line_id and d.brand_id = w.brand_id
join public.activities a on a.department_id = d.id
where c.name = 'Alderleaf Manufacturing' and w.name = 'Accounting'
  and not exists (select 1 from public.workstream_activities wa where wa.workstream_id = w.id and wa.activity_id = a.id);

insert into public.workstream_activities (workstream_id, activity_id)
select w.id, a.id
from public.workstreams w
join public.companies c on c.id = w.company_id
join public.departments d on d.service_line_id = w.service_line_id and d.brand_id = w.brand_id
join public.activities a on a.department_id = d.id
where c.name = 'Fenwick Textiles' and w.name = 'HR'
  and not exists (select 1 from public.workstream_activities wa where wa.workstream_id = w.id and wa.activity_id = a.id);

-- ---------------------------------------------------------------------------
-- 5. Tasks + assignees + checklist items — the first real development Employee (by created_at)
--    gets the Payroll work, the second gets the HR work, and the Supervisor picks up one
--    Accounting task themselves (their own operational work, per Phase 6's "Supervisor is also
--    an Employee" model). A mix of statuses so Activity-first ordering/My Day are demonstrable.
-- ---------------------------------------------------------------------------
insert into public.tasks (title, description, workstream_id, activity_id, status, priority, due_date, created_by)
select 'Process January payroll run', 'Semi-monthly run for hourly staff.', w.id, a.id, 'in-progress', 'high', current_date + 2, sup.id
from public.workstreams w
join public.companies c on c.id = w.company_id
join public.departments d on d.service_line_id = w.service_line_id and d.brand_id = w.brand_id
join public.activities a on a.department_id = d.id and a.name = 'Payroll Processing'
cross join (select id from public.profiles where role = 'supervisor' order by created_at limit 1) sup
where c.name = 'Alderleaf Manufacturing' and w.name = 'Payroll'
  and not exists (select 1 from public.tasks t where t.workstream_id = w.id and t.title = 'Process January payroll run');

insert into public.tasks (title, description, workstream_id, activity_id, status, priority, due_date, created_by)
select 'Reconcile payroll totals', 'Match run totals against GL before posting.', w.id, a.id, 'todo', 'medium', current_date + 5, sup.id
from public.workstreams w
join public.companies c on c.id = w.company_id
join public.departments d on d.service_line_id = w.service_line_id and d.brand_id = w.brand_id
join public.activities a on a.department_id = d.id and a.name = 'Payroll Reconciliation'
cross join (select id from public.profiles where role = 'supervisor' order by created_at limit 1) sup
where c.name = 'Alderleaf Manufacturing' and w.name = 'Payroll'
  and not exists (select 1 from public.tasks t where t.workstream_id = w.id and t.title = 'Reconcile payroll totals');

insert into public.tasks (title, description, workstream_id, activity_id, status, priority, due_date, created_by)
select 'January bank reconciliation', '', w.id, a.id, 'blocked', 'medium', current_date + 3, sup.id
from public.workstreams w
join public.companies c on c.id = w.company_id
join public.departments d on d.service_line_id = w.service_line_id and d.brand_id = w.brand_id
join public.activities a on a.department_id = d.id and a.name = 'Bank Reconciliation'
cross join (select id from public.profiles where role = 'supervisor' order by created_at limit 1) sup
where c.name = 'Alderleaf Manufacturing' and w.name = 'Accounting'
  and not exists (select 1 from public.tasks t where t.workstream_id = w.id and t.title = 'January bank reconciliation');

insert into public.tasks (title, description, workstream_id, activity_id, status, priority, due_date, created_by)
select 'New hire — warehouse associate', 'Onboard new starter joining next week.', w.id, a.id, 'todo', 'medium', current_date + 4, sup.id
from public.workstreams w
join public.companies c on c.id = w.company_id
join public.departments d on d.service_line_id = w.service_line_id and d.brand_id = w.brand_id
join public.activities a on a.department_id = d.id and a.name = 'New Hire'
cross join (select id from public.profiles where role = 'supervisor' order by created_at limit 1) sup
where c.name = 'Fenwick Textiles' and w.name = 'HR'
  and not exists (select 1 from public.tasks t where t.workstream_id = w.id and t.title = 'New hire — warehouse associate');

insert into public.tasks (title, description, workstream_id, activity_id, status, priority, due_date, created_by)
select 'IT discovery call notes', 'Write up findings from the kickoff call.', w.id, null, 'waiting-on-client', 'low', null, sup.id
from public.workstreams w
join public.companies c on c.id = w.company_id
cross join (select id from public.profiles where role = 'supervisor' order by created_at limit 1) sup
where c.name = 'Junction Analytics' and w.name = 'IT/Digital'
  and not exists (select 1 from public.tasks t where t.workstream_id = w.id and t.title = 'IT discovery call notes');

-- Assignees: first Employee -> Payroll tasks, second Employee -> HR task, Supervisor -> their own
-- Accounting task and the untagged IT/Digital task (their own operational work).
insert into public.task_assignees (task_id, user_id)
select t.id, emp.id
from public.tasks t
join public.workstreams w on w.id = t.workstream_id
join public.companies c on c.id = w.company_id
cross join (select id from public.profiles where role = 'employee' order by created_at limit 1) emp
where c.name = 'Alderleaf Manufacturing' and w.name = 'Payroll'
  and not exists (select 1 from public.task_assignees ta where ta.task_id = t.id and ta.user_id = emp.id);

insert into public.task_assignees (task_id, user_id)
select t.id, emp.id
from public.tasks t
join public.workstreams w on w.id = t.workstream_id
join public.companies c on c.id = w.company_id
cross join (select id from public.profiles where role = 'employee' order by created_at offset 1 limit 1) emp
where c.name = 'Fenwick Textiles' and w.name = 'HR'
  and not exists (select 1 from public.task_assignees ta where ta.task_id = t.id and ta.user_id = emp.id);

insert into public.task_assignees (task_id, user_id)
select t.id, sup.id
from public.tasks t
join public.workstreams w on w.id = t.workstream_id
join public.companies c on c.id = w.company_id
cross join (select id from public.profiles where role = 'supervisor' order by created_at limit 1) sup
where c.name = 'Alderleaf Manufacturing' and w.name = 'Accounting'
  and not exists (select 1 from public.task_assignees ta where ta.task_id = t.id and ta.user_id = sup.id);

insert into public.task_assignees (task_id, user_id)
select t.id, sup.id
from public.tasks t
join public.workstreams w on w.id = t.workstream_id
join public.companies c on c.id = w.company_id
cross join (select id from public.profiles where role = 'supervisor' order by created_at limit 1) sup
where c.name = 'Junction Analytics' and w.name = 'IT/Digital'
  and not exists (select 1 from public.task_assignees ta where ta.task_id = t.id and ta.user_id = sup.id);

-- Checklist items on the in-progress payroll task and the blocked reconciliation task.
insert into public.checklist_items (task_id, description, is_done, position)
select t.id, ci.description, ci.is_done, ci.position
from public.tasks t
join public.workstreams w on w.id = t.workstream_id
join public.companies c on c.id = w.company_id
cross join (values
  ('Review submitted timesheets', true, 0),
  ('Apply approved deductions', false, 1),
  ('Validate totals against last run', false, 2)
) as ci(description, is_done, position)
where c.name = 'Alderleaf Manufacturing' and w.name = 'Payroll' and t.title = 'Process January payroll run'
  and not exists (select 1 from public.checklist_items existing where existing.task_id = t.id and existing.description = ci.description);

insert into public.checklist_items (task_id, description, is_done, position)
select t.id, ci.description, ci.is_done, ci.position
from public.tasks t
join public.workstreams w on w.id = t.workstream_id
join public.companies c on c.id = w.company_id
cross join (values
  ('Request missing statement from bank', true, 0),
  ('Re-run reconciliation once received', false, 1)
) as ci(description, is_done, position)
where c.name = 'Alderleaf Manufacturing' and w.name = 'Accounting' and t.title = 'January bank reconciliation'
  and not exists (select 1 from public.checklist_items existing where existing.task_id = t.id and existing.description = ci.description);

-- ---------------------------------------------------------------------------
-- 6. user_companies — demo access so the real Supervisor/Employees can actually see the
--    companies their seeded work belongs to. Supervisor gets all three client companies
--    (oversees both employees' work); each Employee gets only the one company their own
--    seeded task belongs to, demonstrating real employee-scoped visibility.
-- ---------------------------------------------------------------------------
insert into public.user_companies (user_id, company_id)
select sup.id, c.id
from (select id from public.profiles where role = 'supervisor' order by created_at limit 1) sup
cross join public.companies c
where c.name in ('Alderleaf Manufacturing', 'Fenwick Textiles', 'Junction Analytics')
  and not exists (select 1 from public.user_companies uc where uc.user_id = sup.id and uc.company_id = c.id);

insert into public.user_companies (user_id, company_id)
select emp.id, c.id
from (select id from public.profiles where role = 'employee' order by created_at limit 1) emp
cross join public.companies c
where c.name = 'Alderleaf Manufacturing'
  and not exists (select 1 from public.user_companies uc where uc.user_id = emp.id and uc.company_id = c.id);

insert into public.user_companies (user_id, company_id)
select emp.id, c.id
from (select id from public.profiles where role = 'employee' order by created_at offset 1 limit 1) emp
cross join public.companies c
where c.name = 'Fenwick Textiles'
  and not exists (select 1 from public.user_companies uc where uc.user_id = emp.id and uc.company_id = c.id);
