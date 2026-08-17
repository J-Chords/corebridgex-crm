-- Phase 7, part 4/4 — Time Entries + Corrections. Maps to src/lib/data/types/time-entry.ts.
--
-- Every mutation goes through a SECURITY DEFINER RPC below, never a direct table INSERT/UPDATE
-- from `authenticated` — the one-active-timer-per-user rule, the pause/resume chain, and the
-- Todo -> In Progress side effect are all genuinely sequential/stateful operations best kept
-- atomic and server-side, mirroring how Foundation A's admin_set_* RPCs are the only sanctioned
-- way to touch profiles.role/active/supervisor_id. Plain SELECT is still a normal RLS-gated
-- table read.

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz null,
  duration_minutes int null,
  notes text null,
  billable boolean not null default true,
  paused_for_resume boolean not null default false,
  continues_from_entry_id uuid null references public.time_entries (id) on delete set null,
  -- A still-running entry (duration_minutes is null) can never have an end_time. The reverse
  -- isn't required — a manual "duration-only" entry legitimately has duration_minutes set with
  -- end_time left null (no specific clock range), per ManualTimeEntryInput's own doc comment.
  constraint time_entries_running_has_no_end check (duration_minutes is not null or end_time is null)
);

create index time_entries_task_id_idx on public.time_entries (task_id);
create index time_entries_user_id_idx on public.time_entries (user_id);
-- Enforces "one running (duration_minutes is null) entry per user" at the database level, not
-- just in RPC logic — a partial unique index is the standard Postgres pattern for this.
create unique index time_entries_one_running_per_user
  on public.time_entries (user_id) where (duration_minutes is null);

comment on table public.time_entries is
  'Mutated only via start_timer/stop_timer/pause_timer/resume_timer/create_manual_time_entry/correct_time_entry RPCs — never a direct client INSERT/UPDATE.';

create table public.time_entry_corrections (
  id uuid primary key default gen_random_uuid(),
  time_entry_id uuid not null references public.time_entries (id) on delete cascade,
  employee_user_id uuid not null references public.profiles (id),
  previous_duration_minutes int not null,
  corrected_duration_minutes int not null,
  reason text not null,
  corrected_by uuid not null references public.profiles (id),
  corrected_by_name text not null,
  corrected_at timestamptz not null default now()
);

create index time_entry_corrections_time_entry_id_idx on public.time_entry_corrections (time_entry_id);

-- ---------------------------------------------------------------------------
-- Access helpers.
-- ---------------------------------------------------------------------------
create function public.can_log_time_on_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.task_assignees ta where ta.task_id = target_task_id and ta.user_id = auth.uid()
  );
$$;

-- Mirrors canCorrectTimeEntry: never self-service (for anyone, including superadmin), never for
-- an employee viewer, superadmin unconditionally, supervisor only for a direct report.
create function public.can_correct_time_entry(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    not public.is_employee()
    and auth.uid() <> target_user_id
    and (public.is_superadmin() or public.manages_user(target_user_id));
$$;

grant execute on function public.can_log_time_on_task(uuid) to authenticated;
grant execute on function public.can_correct_time_entry(uuid) to authenticated;
grant execute on function public.can_log_time_on_task(uuid) to service_role;
grant execute on function public.can_correct_time_entry(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RLS. SELECT mirrors canViewTimeForUser (self, or anyone you manage). No INSERT/UPDATE grant
-- to authenticated on either table — see the table comment above.
-- ---------------------------------------------------------------------------
alter table public.time_entries enable row level security;

create policy "time_entries_select" on public.time_entries
  for select using (user_id = auth.uid() or public.manages_user(user_id));

grant select on public.time_entries to authenticated;
grant select, insert, update, delete on public.time_entries to service_role;

alter table public.time_entry_corrections enable row level security;

create policy "time_entry_corrections_select" on public.time_entry_corrections
  for select using (
    exists (
      select 1 from public.time_entries te
      where te.id = time_entry_id and (te.user_id = auth.uid() or public.manages_user(te.user_id))
    )
  );

grant select on public.time_entry_corrections to authenticated;
grant select, insert, update, delete on public.time_entry_corrections to service_role;

-- ---------------------------------------------------------------------------
-- start_timer — auto-pauses any other running entry for this user, starts a fresh one, and (the
-- Boss Feedback Implementation A.3 lifecycle rule) flips a Todo task to In Progress. Routed
-- through update_task_status so statusChangedAt/statusChangedBy and its notification stay
-- consistent with any other status change — never a raw tasks mutation.
-- ---------------------------------------------------------------------------
create function public.start_timer(target_task_id uuid)
returns public.time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_entry public.time_entries;
  target_company_id uuid;
  target_status text;
  internal_company_id uuid;
begin
  if not public.can_access_task(target_task_id) then
    raise exception 'You don''t have access to this task.';
  end if;
  if not public.can_log_time_on_task(target_task_id) then
    raise exception 'You don''t have permission to log time on this task.';
  end if;

  select company_id, status into target_company_id, target_status from public.tasks where id = target_task_id;
  select id into internal_company_id from public.companies where is_internal limit 1;

  update public.time_entries
  set end_time = now(),
      duration_minutes = greatest(1, round(extract(epoch from (now() - start_time)) / 60)::int),
      paused_for_resume = true
  where user_id = auth.uid() and duration_minutes is null;

  insert into public.time_entries (task_id, user_id, start_time, billable)
  values (target_task_id, auth.uid(), now(), target_company_id is distinct from internal_company_id)
  returning * into new_entry;

  if target_status = 'todo' then
    perform public.update_task_status(target_task_id, 'in-progress');
  end if;

  return new_entry;
end;
$$;

-- stop_timer / pause_timer — ownership of the running entry is sufficient; deliberately does NOT
-- re-check current task assignment (per the locked rule — only start/resume/manual do).
create function public.stop_timer(target_entry_id uuid)
returns public.time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry public.time_entries;
  updated public.time_entries;
begin
  select * into entry from public.time_entries where id = target_entry_id;
  if not found then raise exception 'Time entry not found.'; end if;
  if entry.user_id <> auth.uid() then raise exception 'You can only stop your own timer.'; end if;
  if entry.duration_minutes is not null then raise exception 'This timer isn''t running.'; end if;

  update public.time_entries
  set end_time = now(),
      duration_minutes = greatest(1, round(extract(epoch from (now() - entry.start_time)) / 60)::int),
      paused_for_resume = false
  where id = target_entry_id
  returning * into updated;
  return updated;
end;
$$;

create function public.pause_timer(target_entry_id uuid)
returns public.time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry public.time_entries;
  updated public.time_entries;
begin
  select * into entry from public.time_entries where id = target_entry_id;
  if not found then raise exception 'Time entry not found.'; end if;
  if entry.user_id <> auth.uid() then raise exception 'You can only pause your own timer.'; end if;
  if entry.duration_minutes is not null then raise exception 'This timer isn''t running.'; end if;

  update public.time_entries
  set end_time = now(),
      duration_minutes = greatest(1, round(extract(epoch from (now() - entry.start_time)) / 60)::int),
      paused_for_resume = true
  where id = target_entry_id
  returning * into updated;
  return updated;
end;
$$;

-- resume_timer — re-checks task assignment (per the locked rule), auto-pauses any other running
-- entry, then starts a fresh entry chained to the paused one via continues_from_entry_id.
create function public.resume_timer(paused_entry_id uuid)
returns public.time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  paused public.time_entries;
  new_entry public.time_entries;
begin
  select * into paused from public.time_entries where id = paused_entry_id;
  if not found then raise exception 'Time entry not found.'; end if;
  if paused.user_id <> auth.uid() then raise exception 'You can only resume your own timer.'; end if;
  if not paused.paused_for_resume then raise exception 'This entry isn''t paused.'; end if;
  if not public.can_access_task(paused.task_id) then raise exception 'You don''t have access to this task.'; end if;
  if not public.can_log_time_on_task(paused.task_id) then raise exception 'You don''t have permission to log time on this task.'; end if;

  update public.time_entries
  set end_time = now(),
      duration_minutes = greatest(1, round(extract(epoch from (now() - start_time)) / 60)::int),
      paused_for_resume = true
  where user_id = auth.uid() and duration_minutes is null;

  insert into public.time_entries (task_id, user_id, start_time, billable, continues_from_entry_id)
  values (paused.task_id, auth.uid(), now(), paused.billable, paused.id)
  returning * into new_entry;
  return new_entry;
end;
$$;

create function public.create_manual_time_entry(
  target_task_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_duration_minutes int,
  p_notes text,
  p_billable boolean
)
returns public.time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_entry public.time_entries;
begin
  if not public.can_access_task(target_task_id) then
    raise exception 'You don''t have access to this task.';
  end if;
  if not public.can_log_time_on_task(target_task_id) then
    raise exception 'You don''t have permission to log time on this task.';
  end if;

  insert into public.time_entries (task_id, user_id, start_time, end_time, duration_minutes, notes, billable)
  values (target_task_id, auth.uid(), p_start_time, p_end_time, p_duration_minutes, p_notes, p_billable)
  returning * into new_entry;
  return new_entry;
end;
$$;

-- correct_time_entry — append-only correction, Phase 3.36 rules preserved exactly: never
-- self-service, never on a still-running entry, positive duration, non-blank reason required.
create function public.correct_time_entry(target_entry_id uuid, corrected_duration_minutes int, reason text)
returns public.time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry public.time_entries;
  updated public.time_entries;
  rounded int;
  trimmed_reason text;
begin
  select * into entry from public.time_entries where id = target_entry_id;
  if not found then raise exception 'Time entry not found.'; end if;
  if not public.can_correct_time_entry(entry.user_id) then
    raise exception 'You don''t have permission to correct this time entry.';
  end if;
  if entry.duration_minutes is null then
    raise exception 'A running time entry can''t be corrected — stop or pause it first.';
  end if;
  rounded := round(corrected_duration_minutes);
  if rounded is null or rounded <= 0 then
    raise exception 'Corrected duration must be greater than zero.';
  end if;
  trimmed_reason := trim(reason);
  if trimmed_reason = '' then
    raise exception 'A reason is required.';
  end if;

  insert into public.time_entry_corrections
    (time_entry_id, employee_user_id, previous_duration_minutes, corrected_duration_minutes, reason, corrected_by, corrected_by_name, corrected_at)
  select target_entry_id, entry.user_id, entry.duration_minutes, rounded, trimmed_reason, auth.uid(), p.full_name, now()
  from public.profiles p where p.id = auth.uid();

  update public.time_entries set duration_minutes = rounded where id = target_entry_id returning * into updated;
  return updated;
end;
$$;

grant execute on function public.start_timer(uuid) to authenticated;
grant execute on function public.stop_timer(uuid) to authenticated;
grant execute on function public.pause_timer(uuid) to authenticated;
grant execute on function public.resume_timer(uuid) to authenticated;
grant execute on function public.create_manual_time_entry(uuid, timestamptz, timestamptz, int, text, boolean) to authenticated;
grant execute on function public.correct_time_entry(uuid, int, text) to authenticated;

grant execute on function public.start_timer(uuid) to service_role;
grant execute on function public.stop_timer(uuid) to service_role;
grant execute on function public.pause_timer(uuid) to service_role;
grant execute on function public.resume_timer(uuid) to service_role;
grant execute on function public.create_manual_time_entry(uuid, timestamptz, timestamptz, int, text, boolean) to service_role;
grant execute on function public.correct_time_entry(uuid, int, text) to service_role;

-- No further ALTER DEFAULT PRIVILEGES needed here — Foundation C's hardening (role postgres,
-- schema public) already applies to every object created since, including everything in this
-- Phase 7 migration set, which is exactly why every table/function above has an explicit grant.
