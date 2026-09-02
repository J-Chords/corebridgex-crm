-- Admin Foundation acceptance-hardening — the locked deactivation requirement explicitly names
-- "global Service staffing/personnel information" as something a deactivated user must not retain.
-- service_team_leads_select_all/service_employees_select_all were `using (true)` — open to any
-- authenticated user regardless of active status, on the (now corrected) assumption that staffing
-- rows were closer to a reference catalog than personnel data. They identify real people
-- (user_id) paired with a Service, which is personnel information, not a bare name catalog — so
-- they get the same is_current_user_active() gate as everything else.
--
-- service_lines itself (bare service NAMES, no personnel/relationship data — Accounting, Payroll,
-- etc.) remains `using (true)`, alongside brands/activities/departments/templates/template_tasks/
-- template_checklist_items — all pure name/definition catalogs with no user-identifying data,
-- which is the concrete architectural reason those stay readable regardless of active status.

drop policy if exists "service_team_leads_select_all" on public.service_team_leads;
create policy "service_team_leads_select_all" on public.service_team_leads
  for select using (public.is_current_user_active());

drop policy if exists "service_employees_select_all" on public.service_employees;
create policy "service_employees_select_all" on public.service_employees
  for select using (public.is_current_user_active());
