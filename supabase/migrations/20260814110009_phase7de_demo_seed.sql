-- Phase 7D/7E demo seed — fake development data for Notes, Task Handoffs, Daily Updates,
-- Templates, Saved Views, Accomplishments Reports, Client Reports. Idempotent (NOT EXISTS guards
-- keyed to natural business keys), fake data only, no real client information, no Auth users, no
-- passwords. Every real Supervisor/Employee identity is resolved dynamically by role
-- (profiles.role, ordered by created_at) — no id is ever hardcoded here. Reuses the existing
-- Phase 7A-C companies/workstreams/tasks (Alderleaf Manufacturing/Fenwick Textiles/Junction
-- Analytics, Payroll/Accounting/HR/IT-Digital workstreams).

-- ---------------------------------------------------------------------------
-- 1. Notes — several, spanning both parent kinds, all 4 types, multiple authors/companies/tasks.
-- ---------------------------------------------------------------------------
insert into public.notes (company_id, task_id, author_id, type, body)
select c.id, null, sup.id, 'call', 'Called the client to confirm payroll cutoff dates for this cycle.'
from public.companies c, (select id from public.profiles where role = 'supervisor' order by created_at limit 1) sup
where c.name = 'Alderleaf Manufacturing'
  and not exists (select 1 from public.notes n where n.company_id = c.id and n.body = 'Called the client to confirm payroll cutoff dates for this cycle.');

insert into public.notes (company_id, task_id, author_id, type, body)
select c.id, null, emp.id, 'internal', 'Client mentioned they may add two new hourly staff next month — flagging for capacity planning.'
from public.companies c, (select id from public.profiles where role = 'employee' order by created_at limit 1) emp
where c.name = 'Alderleaf Manufacturing'
  and not exists (select 1 from public.notes n where n.company_id = c.id and n.body = 'Client mentioned they may add two new hourly staff next month — flagging for capacity planning.');

insert into public.notes (company_id, task_id, author_id, type, body)
select null, t.id, emp.id, 'meeting', 'Kickoff call with payroll lead — confirmed timesheet source and approval chain.'
from public.tasks t
join public.workstreams w on w.id = t.workstream_id
join public.companies c on c.id = w.company_id
cross join (select id from public.profiles where role = 'employee' order by created_at limit 1) emp
where c.name = 'Alderleaf Manufacturing' and t.title = 'Process January payroll run'
  and not exists (select 1 from public.notes n where n.task_id = t.id and n.body = 'Kickoff call with payroll lead — confirmed timesheet source and approval chain.');

insert into public.notes (company_id, task_id, author_id, type, body)
select null, t.id, sup.id, 'decision', 'Agreed to reconcile against last month''s totals rather than a fresh count, given the tight deadline.'
from public.tasks t
join public.workstreams w on w.id = t.workstream_id
join public.companies c on c.id = w.company_id
cross join (select id from public.profiles where role = 'supervisor' order by created_at limit 1) sup
where c.name = 'Alderleaf Manufacturing' and t.title = 'Reconcile payroll totals'
  and not exists (select 1 from public.notes n where n.task_id = t.id and n.body = 'Agreed to reconcile against last month''s totals rather than a fresh count, given the tight deadline.');

insert into public.notes (company_id, task_id, author_id, type, body)
select c.id, null, emp2.id, 'decision', 'Decided to run onboarding paperwork through the client''s own HR portal instead of email.'
from public.companies c, (select id from public.profiles where role = 'employee' order by created_at offset 1 limit 1) emp2
where c.name = 'Fenwick Textiles'
  and not exists (select 1 from public.notes n where n.company_id = c.id and n.body = 'Decided to run onboarding paperwork through the client''s own HR portal instead of email.');

insert into public.notes (company_id, task_id, author_id, type, body)
select null, t.id, emp2.id, 'call', 'Left voicemail for the new hire to schedule their first-day orientation.'
from public.tasks t
join public.workstreams w on w.id = t.workstream_id
join public.companies c on c.id = w.company_id
cross join (select id from public.profiles where role = 'employee' order by created_at offset 1 limit 1) emp2
where c.name = 'Fenwick Textiles' and t.title = 'New hire — warehouse associate'
  and not exists (select 1 from public.notes n where n.task_id = t.id and n.body = 'Left voicemail for the new hire to schedule their first-day orientation.');

-- ---------------------------------------------------------------------------
-- 2. Task Handoffs — one acknowledged, one pending, both from the Supervisor (who leads every
--    seeded workstream) to the Employee already assigned the underlying task.
-- ---------------------------------------------------------------------------
insert into public.task_handoffs (task_id, handed_by_id, handed_to_id, work_done, work_remaining, blockers, created_at, acknowledged_by_id, acknowledged_at)
select t.id, sup.id, emp.id,
  'Reviewed the submitted timesheets and flagged two exceptions for approval.',
  'Apply the approved deductions and validate totals against last run once approvals land.',
  null,
  now() - interval '1 day',
  emp.id, now() - interval '20 hours'
from public.tasks t
join public.workstreams w on w.id = t.workstream_id
join public.companies c on c.id = w.company_id
cross join (select id from public.profiles where role = 'supervisor' order by created_at limit 1) sup
cross join (select id from public.profiles where role = 'employee' order by created_at limit 1) emp
where c.name = 'Alderleaf Manufacturing' and t.title = 'Process January payroll run'
  and not exists (select 1 from public.task_handoffs h where h.task_id = t.id and h.work_done = 'Reviewed the submitted timesheets and flagged two exceptions for approval.');

insert into public.task_handoffs (task_id, handed_by_id, handed_to_id, work_done, work_remaining, blockers, created_at, acknowledged_by_id, acknowledged_at)
select t.id, sup.id, emp2.id,
  'Sent the onboarding packet and confirmed the start date with the hiring manager.',
  'Collect the signed I-9/W-4 once the new hire returns them and set up the payroll profile.',
  'Waiting on the client to confirm the new hire''s final department code.',
  now() - interval '2 hours',
  null, null
from public.tasks t
join public.workstreams w on w.id = t.workstream_id
join public.companies c on c.id = w.company_id
cross join (select id from public.profiles where role = 'supervisor' order by created_at limit 1) sup
cross join (select id from public.profiles where role = 'employee' order by created_at offset 1 limit 1) emp2
where c.name = 'Fenwick Textiles' and t.title = 'New hire — warehouse associate'
  and not exists (select 1 from public.task_handoffs h where h.task_id = t.id and h.work_done = 'Sent the onboarding packet and confirmed the start date with the hiring manager.');

-- ---------------------------------------------------------------------------
-- 3. Daily Updates — a confirmed update for the Supervisor and first Employee, a draft for the
--    second Employee, all dated yesterday (a live "today" row is created automatically the first
--    time each real person opens My Day, so seeding "today" itself would just be overwritten).
-- ---------------------------------------------------------------------------
insert into public.daily_updates (user_id, date, status, entries, generated_at, confirmed_at, updated_at)
select sup.id, (current_date - 1), 'confirmed',
  jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(), 'source', 'manual', 'sourceTaskId', null, 'sourceHandoffId', null,
    'companyId', c.id, 'companyLabel', c.name, 'activityId', null, 'activityLabel', null,
    'minutesLogged', 45, 'progressStatus', null, 'progressLabel', 'Manual entry',
    'details', 'Reviewed team capacity for the week and reassigned one task.'
  )),
  now() - interval '1 day', now() - interval '1 day' + interval '2 hours', now() - interval '1 day' + interval '2 hours'
from (select id from public.profiles where role = 'supervisor' order by created_at limit 1) sup, public.companies c
where c.name = 'Alderleaf Manufacturing'
  and not exists (select 1 from public.daily_updates du where du.user_id = sup.id and du.date = (current_date - 1));

insert into public.daily_updates (user_id, date, status, entries, generated_at, confirmed_at, updated_at)
select emp.id, (current_date - 1), 'confirmed',
  jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(), 'source', 'manual', 'sourceTaskId', null, 'sourceHandoffId', null,
    'companyId', c.id, 'companyLabel', c.name, 'activityId', null, 'activityLabel', null,
    'minutesLogged', 90, 'progressStatus', null, 'progressLabel', 'Manual entry',
    'details', 'Processed timesheet exceptions flagged by the supervisor.'
  )),
  now() - interval '1 day', now() - interval '1 day' + interval '3 hours', now() - interval '1 day' + interval '3 hours'
from (select id from public.profiles where role = 'employee' order by created_at limit 1) emp, public.companies c
where c.name = 'Alderleaf Manufacturing'
  and not exists (select 1 from public.daily_updates du where du.user_id = emp.id and du.date = (current_date - 1));

insert into public.daily_updates (user_id, date, status, entries, generated_at, updated_at)
select emp2.id, (current_date - 1), 'draft',
  jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(), 'source', 'manual', 'sourceTaskId', null, 'sourceHandoffId', null,
    'companyId', c.id, 'companyLabel', c.name, 'activityId', null, 'activityLabel', null,
    'minutesLogged', 30, 'progressStatus', null, 'progressLabel', 'Manual entry',
    'details', 'Started drafting the onboarding checklist for the new hire.'
  )),
  now() - interval '1 day', now() - interval '1 day'
from (select id from public.profiles where role = 'employee' order by created_at offset 1 limit 1) emp2, public.companies c
where c.name = 'Fenwick Textiles'
  and not exists (select 1 from public.daily_updates du where du.user_id = emp2.id and du.date = (current_date - 1));

-- ---------------------------------------------------------------------------
-- 4. Templates — one, tied to the real Payroll service line, with 2 template tasks and their
--    default checklist items.
-- ---------------------------------------------------------------------------
insert into public.templates (name, description, service_line_id, recurrence_frequency, created_by)
select 'Payroll Onboarding', 'Standard checklist for onboarding a new payroll client contact.', sl.id, null, sup.id
from public.service_lines sl, (select id from public.profiles where role = 'supervisor' order by created_at limit 1) sup
where sl.name = 'Payroll'
  and not exists (select 1 from public.templates existing where existing.name = 'Payroll Onboarding');

insert into public.template_tasks (template_id, title, description, default_owner_role, due_days_after_start, expected_minutes, position)
select tpl.id, 'Set up payroll profile', 'Create the client''s payroll profile and confirm pay schedule.', 'employee', 3, 60, 0
from public.templates tpl
where tpl.name = 'Payroll Onboarding'
  and not exists (select 1 from public.template_tasks tt where tt.template_id = tpl.id and tt.title = 'Set up payroll profile');

insert into public.template_tasks (template_id, title, description, default_owner_role, due_days_after_start, expected_minutes, position)
select tpl.id, 'Confirm direct deposit details', 'Verify bank details and run a test deposit if required.', 'employee', 5, 30, 1
from public.templates tpl
where tpl.name = 'Payroll Onboarding'
  and not exists (select 1 from public.template_tasks tt where tt.template_id = tpl.id and tt.title = 'Confirm direct deposit details');

insert into public.template_checklist_items (template_task_id, description, position)
select tt.id, ci.description, ci.position
from public.template_tasks tt
join public.templates tpl on tpl.id = tt.template_id
cross join (values ('Collect W-4', 0), ('Enter bank details', 1)) as ci(description, position)
where tpl.name = 'Payroll Onboarding' and tt.title = 'Set up payroll profile'
  and not exists (select 1 from public.template_checklist_items existing where existing.template_task_id = tt.id and existing.description = ci.description);

-- ---------------------------------------------------------------------------
-- 5. Saved Views — one each for the Supervisor and first Employee.
-- ---------------------------------------------------------------------------
insert into public.saved_views (user_id, name, filters)
select sup.id, 'My high-priority work', '{"search":"","companyId":"all","workstreamId":"all","status":"all","priority":"high","assigneeId":"all","groupBy":"company"}'::jsonb
from (select id from public.profiles where role = 'supervisor' order by created_at limit 1) sup
where not exists (select 1 from public.saved_views sv where sv.user_id = sup.id and sv.name = 'My high-priority work');

insert into public.saved_views (user_id, name, filters)
select emp.id, 'Waiting on client', '{"search":"","companyId":"all","workstreamId":"all","status":"waiting-on-client","priority":"all","assigneeId":"all","groupBy":"none"}'::jsonb
from (select id from public.profiles where role = 'employee' order by created_at limit 1) emp
where not exists (select 1 from public.saved_views sv where sv.user_id = emp.id and sv.name = 'Waiting on client');

-- ---------------------------------------------------------------------------
-- 6. Accomplishments Report — one finalized person report for the first Employee, referencing
--    the real Payroll Processing activity, plus one supervisor comment.
-- ---------------------------------------------------------------------------
insert into public.accomplishments_reports (kind, subject_user_id, subject_label, range_label, range_start, range_end, status, brand_sections, history, generated_by, generated_by_name, finalized_at)
select 'person', emp.id, emp.full_name, 'this-week', (current_date - 6), current_date, 'finalized',
  jsonb_build_array(jsonb_build_object(
    'brandId', b.id, 'brandName', b.name,
    'departments', jsonb_build_array(jsonb_build_object(
      'departmentId', d.id, 'departmentName', d.name,
      'activities', jsonb_build_array(jsonb_build_object(
        'activityId', a.id, 'activityName', a.name, 'done', true,
        'detail', 'Processed the semi-monthly payroll run for hourly staff, no exceptions outstanding.',
        'sourceTaskIds', jsonb_build_array(), 'companyLabel', 'Alderleaf Manufacturing'
      ))
    )),
    'other', jsonb_build_object('activityId', null, 'activityName', 'Other', 'done', false, 'detail', '', 'sourceTaskIds', jsonb_build_array(), 'companyLabel', ''),
    'otherIncluded', false
  )),
  jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'type', 'finalized', 'actorId', emp.id, 'actorName', emp.full_name, 'createdAt', now())),
  emp.id, emp.full_name, now()
from (select id, full_name from public.profiles where role = 'employee' order by created_at limit 1) emp
join public.brands b on b.name = 'Sparing Consulting'
join public.departments d on d.brand_id = b.id and d.name = 'Payroll'
join public.activities a on a.department_id = d.id and a.name = 'Payroll Processing'
where not exists (select 1 from public.accomplishments_reports r where r.subject_user_id = emp.id and r.range_label = 'this-week' and r.range_start = (current_date - 6));

insert into public.accomplishments_report_comments (report_id, author_id, author_name, body)
select r.id, sup.id, sup.full_name, 'Nice work clearing the exceptions ahead of the deadline.'
from public.accomplishments_reports r
join public.profiles emp on emp.id = r.subject_user_id
cross join (select id, full_name from public.profiles where role = 'supervisor' order by created_at limit 1) sup
where emp.role = 'employee' and r.range_label = 'this-week'
  and not exists (select 1 from public.accomplishments_report_comments c where c.report_id = r.id and c.body = 'Nice work clearing the exceptions ahead of the deadline.');

-- ---------------------------------------------------------------------------
-- 7. Client Report — one draft report for Alderleaf Manufacturing, generated by the Supervisor,
--    name-free line-item content (task title + duration only, per the locked business rule).
-- ---------------------------------------------------------------------------
insert into public.client_reports (company_id, company_label, brand_id, brand_label, range_label, range_start, range_end, status, departments, generated_by, generated_by_name)
select c.id, c.name, b.id, b.name, 'this-week', (current_date - 6), current_date, 'draft',
  jsonb_build_array(jsonb_build_object(
    'departmentId', d.id, 'departmentName', d.name,
    'activities', jsonb_build_array(jsonb_build_object(
      'activityId', a.id, 'activityName', a.name,
      'lineItems', jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(), 'date', current_date, 'minutes', 90,
        'details', 'Process January payroll run (1h 30m)', 'source', 'raw'
      ))
    ))
  )),
  sup.id, sup.full_name
from public.companies c
join public.brands b on b.id = c.brand_id
join public.departments d on d.brand_id = b.id and d.name = 'Payroll'
join public.activities a on a.department_id = d.id and a.name = 'Payroll Processing'
cross join (select id, full_name from public.profiles where role = 'supervisor' order by created_at limit 1) sup
where c.name = 'Alderleaf Manufacturing'
  and not exists (select 1 from public.client_reports r where r.company_id = c.id and r.range_label = 'this-week' and r.range_start = (current_date - 6));
