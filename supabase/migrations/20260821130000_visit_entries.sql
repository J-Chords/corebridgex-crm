-- Phase 9F — Daily Visit Hours. A dedicated model for hours an Employee/Supervisor physically
-- visits a Client Project and performs visit-related work — deliberately NOT modeled as a fake Task
-- or a fake Time Entry (Section 20's own locked instruction), since visit time and tracked Task time
-- are two structurally distinct kinds of hours whose sum (Total Week Hours + Daily Visit Hours =
-- Grand Total) must never silently double-count the same minutes.
--
-- Mutated only via create_visit_entry/update_visit_entry/delete_visit_entry RPCs — never a direct
-- client INSERT/UPDATE/DELETE — same convention as public.time_entries
-- (20260814090003_time_entries.sql), and for the same reason: the anti-double-counting overlap
-- check (against both the same user's Time Entries AND their other Visit Entries) has to be
-- enforced somewhere no client can route around, and a SECURITY DEFINER RPC is that boundary.
--
-- Forward-only; does not edit any already-applied migration.

create table public.visit_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  project_id uuid not null references public.projects (id),
  -- The user's own intended local calendar visit date — derived server-side from start_at AT TIME
  -- ZONE timezone at creation time, never independently editable (it would let the stored date and
  -- the actual timestamps disagree).
  visit_date date not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  -- Calculated from the timestamps, never freely invented by browser text (Section 21's own locked
  -- instruction) — a generated column makes this structurally guaranteed, not merely convention.
  duration_minutes integer generated always as (
    greatest(0, round(extract(epoch from (end_at - start_at)) / 60))::integer
  ) stored,
  agenda text not null,
  -- The IANA zone the visiting user was in when they logged it — stored for audit/schedule-safe
  -- reinterpretation, same rationale as the Phase 9D weekly-evidence RPC's own p_timezone parameter.
  timezone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visit_entries_start_before_end check (start_at < end_at),
  constraint visit_entries_agenda_not_blank check (length(trim(agenda)) > 0),
  -- Catches an accidental 20+ hour entry (Section 21's own explicit example) without being so tight
  -- it rejects a genuinely long on-site day; 16h is generous for a single visit while still clearly
  -- bounded.
  constraint visit_entries_max_duration check (end_at - start_at <= interval '16 hours')
);

create index visit_entries_user_id_idx on public.visit_entries (user_id);
create index visit_entries_project_id_idx on public.visit_entries (project_id);
create index visit_entries_project_date_idx on public.visit_entries (project_id, visit_date);

comment on table public.visit_entries is
  'Mutated only via create_visit_entry/update_visit_entry/delete_visit_entry RPCs — never a direct client INSERT/UPDATE/DELETE.';

-- ---------------------------------------------------------------------------
-- Overlap enforcement — the real anti-double-counting boundary (Section 22, "server-side
-- enforcement is REQUIRED... do not rely on a UI warning alone"). Checks real timestamp interval
-- overlap (`tstzrange` intersection) against: (a) the SAME user's other Visit Entries, and (b) the
-- SAME user's Time Entries — a still-running Time Entry (end_time is null) is treated as occupying
-- through "now" for this check, since it genuinely is still occupying the person's time. Never
-- mutates or deletes the conflicting Time Entry — the caller is told to correct one source
-- themselves (Section 22's own locked instruction).
-- ---------------------------------------------------------------------------
create function public.visit_entry_overlaps(
  p_user_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_visit_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.visit_entries v
      where v.user_id = p_user_id
        and (p_exclude_visit_id is null or v.id <> p_exclude_visit_id)
        and tstzrange(v.start_at, v.end_at) && tstzrange(p_start, p_end)
    )
    or exists (
      select 1 from public.time_entries te
      where te.user_id = p_user_id
        and tstzrange(te.start_time, coalesce(te.end_time, now())) && tstzrange(p_start, p_end)
    );
$$;

revoke execute on function public.visit_entry_overlaps(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.visit_entry_overlaps(uuid, timestamptz, timestamptz, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS. SELECT mirrors time_entries_select's own shape (self, or anyone you manage) — a Supervisor
-- may view direct-report Visit Entries for team reporting (Section 23), Superadmin sees everyone.
-- No INSERT/UPDATE/DELETE grant to authenticated — see the table comment above.
-- ---------------------------------------------------------------------------
alter table public.visit_entries enable row level security;

create policy "visit_entries_select" on public.visit_entries
  for select using (user_id = auth.uid() or public.manages_user(user_id));

grant select on public.visit_entries to authenticated;
grant select, insert, update, delete on public.visit_entries to service_role;

-- ---------------------------------------------------------------------------
-- RPCs.
-- ---------------------------------------------------------------------------

-- create_visit_entry — self-service only (auth.uid() is always the row's own user_id; there is no
-- "log a Visit on someone else's behalf" input, unlike create_manual_time_entry has no such branch
-- either). Requires real Project access AND a non-internal Client Project (Section 21: "must be
-- non-internal Client Project" — Internal/Non-billable work has no client site to visit).
create function public.create_visit_entry(
  p_project_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_agenda text,
  p_timezone text
)
returns public.visit_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_internal boolean;
  v_local_start date;
  v_local_end date;
  new_entry public.visit_entries;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;
  if not public.can_access_project(p_project_id) then
    raise exception 'You do not have access to log a Visit for that Project.';
  end if;
  select c.is_internal into v_is_internal
  from public.projects p join public.companies c on c.id = p.company_id
  where p.id = p_project_id;
  if v_is_internal then
    raise exception 'Visit Hours can only be logged against a Client Project, not Internal/Non-billable work.';
  end if;
  if p_start_at >= p_end_at then
    raise exception 'Start time must be before end time.';
  end if;
  if p_end_at - p_start_at > interval '16 hours' then
    raise exception 'A single Visit Entry cannot exceed 16 hours — check the times.';
  end if;
  if length(trim(coalesce(p_agenda, ''))) = 0 then
    raise exception 'Agenda is required.';
  end if;
  begin
    perform now() at time zone p_timezone;
  exception when others then
    raise exception 'Invalid timezone.';
  end;

  v_local_start := (p_start_at at time zone p_timezone)::date;
  v_local_end := (p_end_at at time zone p_timezone)::date;
  if v_local_start <> v_local_end then
    raise exception 'A Visit Entry cannot cross midnight — split it into two entries.';
  end if;

  if public.visit_entry_overlaps(auth.uid(), p_start_at, p_end_at, null) then
    raise exception 'This overlaps an existing Time Entry or Visit Entry — correct one of them first.';
  end if;

  insert into public.visit_entries (user_id, project_id, visit_date, start_at, end_at, agenda, timezone)
  values (auth.uid(), p_project_id, v_local_start, p_start_at, p_end_at, trim(p_agenda), p_timezone)
  returning * into new_entry;
  return new_entry;
end;
$$;

-- update_visit_entry — owner-only (Section 23: Employee/Supervisor "create/edit/delete OWN Visit
-- Entries"), Project/timezone are immutable once created (re-picking a different Project or
-- timezone is a new entry, not an edit) — only the times and agenda may change, re-validated with
-- the exact same rules as creation, overlap check excluding the entry's own current row.
create function public.update_visit_entry(
  target_entry_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_agenda text
)
returns public.visit_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.visit_entries;
  v_local_start date;
  v_local_end date;
  result public.visit_entries;
begin
  select * into existing from public.visit_entries where id = target_entry_id;
  if not found then raise exception 'Visit Entry not found.'; end if;
  if existing.user_id <> auth.uid() then
    raise exception 'Only the Visit Entry''s own owner can edit it.';
  end if;
  if p_start_at >= p_end_at then
    raise exception 'Start time must be before end time.';
  end if;
  if p_end_at - p_start_at > interval '16 hours' then
    raise exception 'A single Visit Entry cannot exceed 16 hours — check the times.';
  end if;
  if length(trim(coalesce(p_agenda, ''))) = 0 then
    raise exception 'Agenda is required.';
  end if;

  v_local_start := (p_start_at at time zone existing.timezone)::date;
  v_local_end := (p_end_at at time zone existing.timezone)::date;
  if v_local_start <> v_local_end then
    raise exception 'A Visit Entry cannot cross midnight — split it into two entries.';
  end if;

  if public.visit_entry_overlaps(auth.uid(), p_start_at, p_end_at, target_entry_id) then
    raise exception 'This overlaps an existing Time Entry or Visit Entry — correct one of them first.';
  end if;

  update public.visit_entries
  set start_at = p_start_at, end_at = p_end_at, agenda = trim(p_agenda), visit_date = v_local_start, updated_at = now()
  where id = target_entry_id
  returning * into result;
  return result;
end;
$$;

-- delete_visit_entry — owner OR Superadmin (Section 23: "Superadmin: org-wide administrative
-- visibility, may correct/delete if current admin pattern supports it"). A Supervisor may NEVER
-- silently delete another Employee's Visit Entry, even a direct report's — own-workflow only,
-- exactly like Employee (Section 23's own explicit "do not make Supervisor own workflow
-- manager-only," read together with "may NOT silently edit/delete another Employee's Visit Entry").
create function public.delete_visit_entry(target_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.visit_entries;
begin
  select * into existing from public.visit_entries where id = target_entry_id;
  if not found then raise exception 'Visit Entry not found.'; end if;
  if existing.user_id <> auth.uid() and not public.is_superadmin() then
    raise exception 'Only the Visit Entry''s own owner, or a superadmin, can delete it.';
  end if;
  delete from public.visit_entries where id = target_entry_id;
end;
$$;

revoke execute on function public.create_visit_entry(uuid, timestamptz, timestamptz, text, text) from public, anon;
revoke execute on function public.update_visit_entry(uuid, timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.delete_visit_entry(uuid) from public, anon;
grant execute on function public.create_visit_entry(uuid, timestamptz, timestamptz, text, text) to authenticated, service_role;
grant execute on function public.update_visit_entry(uuid, timestamptz, timestamptz, text) to authenticated, service_role;
grant execute on function public.delete_visit_entry(uuid) to authenticated, service_role;
