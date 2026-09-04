-- Project Level Part 19/20 — configurable Trash retention setting ONLY. Permanent-purge dependency
-- audit (live, before writing this migration) found several FKs into `projects` are `ON DELETE NO
-- ACTION` (`documents.project_id`, `workstreams.project_id`, `client_reports.project_id`,
-- `visit_entries.project_id`, `client_report_schedules.project_id`) — a real Project with any
-- Workstream/Document/Client Report/Visit Entry/Client Report Schedule (i.e. nearly every non-empty
-- Project) CANNOT currently be physically deleted at all; the delete would fail outright on the
-- first such FK. Changing those to CASCADE is a much larger, separately-destructive schema change
-- (Workstreams alone cascade further into Tasks/Time Entries/Notes/etc.) — explicitly out of scope
-- for a Project-level retention *setting*. Per the explicit instruction, automatic physical purge
-- stays DISABLED; no `purge_expired_trashed_projects()` function is written at all in this pass,
-- since writing a destructive function body that can never safely run risks future misuse more than
-- it helps. Only the configurable setting + "eligible for purge" calculation are implemented.

create table public.project_trash_settings (
  id boolean primary key default true,
  -- null = automatic purge disabled (the default) — never invents a locked business retention
  -- period. A positive integer is the Admin's own explicit choice.
  retention_days integer null check (retention_days is null or retention_days > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  constraint project_trash_settings_singleton check (id)
);

insert into public.project_trash_settings (id, retention_days) values (true, null);

alter table public.project_trash_settings enable row level security;
create policy "project_trash_settings_select" on public.project_trash_settings
  for select using (public.is_current_user_active());
create policy "project_trash_settings_write_admin" on public.project_trash_settings
  for all using (public.is_superadmin()) with check (public.is_superadmin());
grant select on public.project_trash_settings to authenticated;
grant update on public.project_trash_settings to authenticated, service_role;

create or replace function public.set_project_trash_retention(p_retention_days integer)
 returns project_trash_settings
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  updated public.project_trash_settings;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can configure Trash retention.';
  end if;
  if p_retention_days is not null and p_retention_days <= 0 then
    raise exception 'Retention days must be a positive number, or null to disable automatic purge.';
  end if;
  update public.project_trash_settings
  set retention_days = p_retention_days, updated_at = now(), updated_by = auth.uid()
  where id = true
  returning * into updated;
  return updated;
end;
$function$;

revoke all on function public.set_project_trash_retention(integer) from public, anon;
grant execute on function public.set_project_trash_retention(integer) to authenticated, service_role;
