-- Phase 7, part 2/4 — Activity Catalog + per-Workstream selected Activities.
-- Maps to src/lib/data/types/activity-catalog.ts (Department, Activity) and workstream.ts's
-- WorkstreamActivity join. Department is preserved internally exactly as the current
-- provider/UI still requires it (Brand -> Department -> Activity), each Department optionally
-- mapped 1:1 to a service_line — the same mechanism the mock catalog already uses to narrow a
-- Task's Activity picker to one Workstream's own service.

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  position int not null default 0,
  service_line_id uuid null references public.service_lines (id)
);

create index departments_brand_id_idx on public.departments (brand_id);
create index departments_service_line_id_idx on public.departments (service_line_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments (id) on delete cascade,
  name text not null,
  position int not null default 0,
  default_task_titles text[] not null default '{}'
);

create index activities_department_id_idx on public.activities (department_id);

-- ---------------------------------------------------------------------------
-- Per-Workstream selected Activity subset. Authoritative and explicit — a Workstream with zero
-- rows here has zero configured Activities, full stop (Boss Feedback Implementation A.1). No
-- "zero rows -> whole Service catalog" fallback exists at the database layer either; that
-- semantic lives only in the read-side hook (useWorkstreamActivities), which this schema doesn't
-- need to know about.
-- ---------------------------------------------------------------------------
create table public.workstream_activities (
  workstream_id uuid not null references public.workstreams (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  primary key (workstream_id, activity_id)
);

create index workstream_activities_activity_id_idx on public.workstream_activities (activity_id);

-- Every selected Activity must belong to a department mapped to the Workstream's own service —
-- mirrors mock-workstreams-provider.ts's requireActivitiesBelongToService, enforced here so a
-- direct database write can't silently violate it either.
create function public.enforce_workstream_activity_service_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workstream_service_line_id uuid;
  activity_service_line_id uuid;
begin
  select w.service_line_id into workstream_service_line_id from public.workstreams w where w.id = new.workstream_id;
  select d.service_line_id into activity_service_line_id
    from public.activities a
    join public.departments d on d.id = a.department_id
    where a.id = new.activity_id;
  if workstream_service_line_id is null or activity_service_line_id is distinct from workstream_service_line_id then
    raise exception 'Activity % does not belong to this workstream''s service.', new.activity_id;
  end if;
  return new;
end;
$$;

create trigger workstream_activities_enforce_service
  before insert on public.workstream_activities
  for each row execute function public.enforce_workstream_activity_service_match();

-- ---------------------------------------------------------------------------
-- RLS. Departments/Activities are ungated reference data, same treatment as brands/service_lines
-- (mock's own listDepartments doc comment: "ungated reference/lookup data"). workstream_activities
-- follows the same read/write shape as workstream_members.
-- ---------------------------------------------------------------------------
alter table public.departments enable row level security;
alter table public.activities enable row level security;
alter table public.workstream_activities enable row level security;

create policy "departments_select_all" on public.departments for select using (true);
create policy "activities_select_all" on public.activities for select using (true);

grant select on public.departments to authenticated;
grant select on public.activities to authenticated;
grant select, insert, update, delete on public.departments to service_role;
grant select, insert, update, delete on public.activities to service_role;

create policy "workstream_activities_select" on public.workstream_activities
  for select using (public.can_access_workstream(workstream_id));

create policy "workstream_activities_write" on public.workstream_activities
  for all
  using ((public.is_supervisor() or public.is_superadmin()) and public.can_access_workstream(workstream_id))
  with check ((public.is_supervisor() or public.is_superadmin()) and public.can_access_workstream(workstream_id));

grant select, insert, delete on public.workstream_activities to authenticated;
grant select, insert, update, delete on public.workstream_activities to service_role;
