-- Phase 7D, part 2 — Task Handoffs. Maps to src/lib/data/types/task-handoff.ts's `TaskHandoff`.
--
-- No status enum — "pending" vs "acknowledged" is derived purely from acknowledged_at being null,
-- matching the mock exactly. acknowledged_by_id, when set, must equal handed_to_id (only the
-- recipient can ever acknowledge).
--
-- Validating "can this candidate legitimately receive this handoff" requires evaluating
-- can_access_task-equivalent logic for a user who is NOT auth.uid() (the recipient, not the
-- caller) — none of the existing role/access helpers support that (they're all hardcoded to
-- auth.uid() by design, to prevent impersonation). This migration adds two new, purely additive
-- parameterized variants (can_user_access_company/can_user_access_task) that take an explicit
-- candidate_id instead of reading auth.uid() — used ONLY for this recipient-eligibility check,
-- never as a replacement for the auth.uid()-based helpers or for authorizing the calling user's
-- own actions.

create table public.task_handoffs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  handed_by_id uuid not null references public.profiles (id),
  handed_to_id uuid not null references public.profiles (id),
  work_done text not null,
  work_remaining text not null,
  blockers text null,
  created_at timestamptz not null default now(),
  acknowledged_by_id uuid null references public.profiles (id),
  acknowledged_at timestamptz null,
  constraint task_handoffs_ack_by_recipient check (acknowledged_by_id is null or acknowledged_by_id = handed_to_id)
);

create index task_handoffs_task_id_idx on public.task_handoffs (task_id);
create index task_handoffs_handed_to_id_idx on public.task_handoffs (handed_to_id);

-- ---------------------------------------------------------------------------
-- Parameterized access helpers (candidate_id explicit, not auth.uid()) — see header comment.
-- ---------------------------------------------------------------------------
create function public.can_user_access_company(candidate_id uuid, target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (select 1 from public.profiles where id = candidate_id and role = 'superadmin')
    or exists (select 1 from public.companies where id = target_company_id and is_internal)
    or exists (
      select 1 from public.user_companies uc
      where uc.company_id = target_company_id
        and (
          uc.user_id = candidate_id
          or (
            exists (select 1 from public.profiles where id = candidate_id and role = 'supervisor')
            and exists (select 1 from public.profiles where id = uc.user_id and supervisor_id = candidate_id)
          )
        )
    );
$$;

create function public.can_user_access_task(candidate_id uuid, target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (select 1 from public.profiles where id = candidate_id and role = 'superadmin')
    or (
      exists (select 1 from public.profiles where id = candidate_id and role = 'supervisor')
      and (
        exists (
          select 1 from public.task_assignees ta
          join public.profiles p on p.id = ta.user_id
          where ta.task_id = target_task_id and (p.id = candidate_id or p.supervisor_id = candidate_id)
        )
        or (
          not exists (select 1 from public.task_assignees ta where ta.task_id = target_task_id)
          and exists (
            select 1 from public.tasks t
            where t.id = target_task_id and public.can_user_access_company(candidate_id, t.company_id)
          )
        )
      )
    )
    or (
      exists (select 1 from public.task_assignees ta where ta.task_id = target_task_id and ta.user_id = candidate_id)
      and exists (
        select 1 from public.tasks t
        where t.id = target_task_id and public.can_user_access_company(candidate_id, t.company_id)
      )
    );
$$;

revoke execute on function public.can_user_access_company(uuid, uuid) from public, anon;
revoke execute on function public.can_user_access_task(uuid, uuid) from public, anon;
grant execute on function public.can_user_access_company(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_user_access_task(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS. SELECT mirrors can_access_task exactly (same gate as listHandoffsForTask). No direct
-- INSERT/UPDATE grant — creation validates the recipient (a cross-user check plain RLS can't
-- express cleanly) and acknowledgment + its own state transition both go through RPCs below,
-- keeping "handoff row + its notification" atomic per the create path.
-- ---------------------------------------------------------------------------
alter table public.task_handoffs enable row level security;

create policy "task_handoffs_select" on public.task_handoffs
  for select using (public.can_access_task(task_id));

grant select on public.task_handoffs to authenticated;
grant select, insert, update, delete on public.task_handoffs to service_role;

-- ---------------------------------------------------------------------------
-- list_handoff_candidates — mirrors usersWhoCanReceiveHandoff exactly: active users (excluding
-- the caller) who themselves independently satisfy can_access_task for this task. SECURITY
-- DEFINER because profiles_select's own RLS (self / superadmin / direct-report-of-supervisor)
-- would otherwise hide most legitimate candidates from most callers.
-- ---------------------------------------------------------------------------
create function public.list_handoff_candidates(target_task_id uuid)
returns table (id uuid, full_name text, email text, role text, active boolean, supervisor_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.email, p.role, p.active, p.supervisor_id, p.created_at
  from public.profiles p
  where public.can_access_task(target_task_id)
    and p.active
    and p.id <> auth.uid()
    and public.can_user_access_task(p.id, target_task_id);
$$;

-- create_task_handoff — validates recipient eligibility, inserts the handoff, and writes its
-- notification in one atomic call (mirrors createHandoff + notifyOfHandoff together).
create function public.create_task_handoff(
  target_task_id uuid,
  p_handed_to_id uuid,
  p_work_done text,
  p_work_remaining text,
  p_blockers text
)
returns public.task_handoffs
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_handoff public.task_handoffs;
  task_title text;
  actor_name text;
  now_ts timestamptz := now();
begin
  if not public.can_access_task(target_task_id) then
    raise exception 'You don''t have access to this task.';
  end if;
  if not (
    exists (select 1 from public.profiles where id = p_handed_to_id and active)
    and public.can_user_access_task(p_handed_to_id, target_task_id)
  ) then
    raise exception 'That person doesn''t have access to this task.';
  end if;

  insert into public.task_handoffs (task_id, handed_by_id, handed_to_id, work_done, work_remaining, blockers, created_at)
  values (target_task_id, auth.uid(), p_handed_to_id, p_work_done, p_work_remaining, p_blockers, now_ts)
  returning * into new_handoff;

  select title into task_title from public.tasks where id = target_task_id;
  select full_name into actor_name from public.profiles where id = auth.uid();

  insert into public.notifications (recipient_id, type, message, related_task_id, read, created_at)
  values (p_handed_to_id, 'task-handoff', format('%s handed off "%s" to you', actor_name, task_title), target_task_id, false, now_ts);

  return new_handoff;
end;
$$;

-- acknowledge_task_handoff — recipient-only, once. No notification fires on acknowledgment
-- (mirrors the mock exactly — only creation notifies).
create function public.acknowledge_task_handoff(target_handoff_id uuid)
returns public.task_handoffs
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.task_handoffs;
  updated public.task_handoffs;
begin
  select * into existing from public.task_handoffs where id = target_handoff_id;
  if not found then
    raise exception 'Handoff not found.';
  end if;
  if existing.handed_to_id <> auth.uid() or existing.acknowledged_at is not null then
    raise exception 'Only the recipient can acknowledge this handoff.';
  end if;

  update public.task_handoffs
  set acknowledged_by_id = auth.uid(), acknowledged_at = now()
  where id = target_handoff_id
  returning * into updated;
  return updated;
end;
$$;

revoke execute on function public.list_handoff_candidates(uuid) from public, anon;
revoke execute on function public.create_task_handoff(uuid, uuid, text, text, text) from public, anon;
revoke execute on function public.acknowledge_task_handoff(uuid) from public, anon;
grant execute on function public.list_handoff_candidates(uuid) to authenticated, service_role;
grant execute on function public.create_task_handoff(uuid, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.acknowledge_task_handoff(uuid) to authenticated, service_role;
