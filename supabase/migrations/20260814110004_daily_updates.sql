-- Phase 7D, part 5 — Daily Updates. Maps to src/lib/data/types/daily-update.ts's `DailyUpdate`/
-- `DailyUpdateEntry`.
--
-- One row per (user_id, date) — the mock only upheld this via find-or-create lookup logic; here
-- it's a real UNIQUE constraint, closing that gap the same way this project has closed other
-- mock-only invariants at the DB level (e.g. one running timer per user).
--
-- The entry-computation/merge logic itself (computeFreshEntries/mergeEntries in the mock) stays
-- in the TypeScript provider layer, matching this project's established flat-fetch-then-JS-join
-- convention — it's pure JS logic over already-real Tasks/TimeEntries/TaskHandoffs data, and
-- reimplementing it a second time in PL/pgSQL would just be two places to keep in sync. SQL's job
-- here is a single safe primitive: "create this draft if absent, overwrite its entries if still
-- draft, never touch it once confirmed" — everything else (what the fresh entries should
-- contain, how to merge them with the prior draft's edited `details`) is computed by the provider
-- before calling it.
--
-- entries is jsonb: an array of DailyUpdateEntry-shaped objects (source/sourceTaskId/
-- sourceHandoffId/companyId/companyLabel/activityId/activityLabel/minutesLogged/progressStatus/
-- progressLabel/details) — camelCase keys, matching the app's own type, so the provider layer can
-- round-trip it without a translation step.

create table public.daily_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  status text not null check (status in ('draft', 'confirmed')) default 'draft',
  entries jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  confirmed_at timestamptz null,
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create index daily_updates_user_id_idx on public.daily_updates (user_id);
create index daily_updates_date_idx on public.daily_updates (date);

-- ---------------------------------------------------------------------------
-- RLS. SELECT mirrors canViewDailyUpdate exactly — which reduces precisely to manages_user(user_id)
-- (self, direct-report-of-supervisor, or superadmin; an employee viewing anyone else already
-- returns false from manages_user with no extra case to special-case). No direct INSERT/UPDATE
-- grant — every mutation (auto-create, entry edits, confirm, reopen) is stateful/sequential
-- enough to route through the RPCs below, same rationale as time_entries/notifications.
-- ---------------------------------------------------------------------------
alter table public.daily_updates enable row level security;

create policy "daily_updates_select" on public.daily_updates
  for select using (public.manages_user(user_id));

grant select on public.daily_updates to authenticated;
grant select, insert, update, delete on public.daily_updates to service_role;

-- upsert_my_daily_update_draft — the auto-create-or-refresh primitive. Called by the provider
-- with a fully-computed entries array (already merged with whatever the prior draft held, per
-- the header comment). Never touches a confirmed row.
create function public.upsert_my_daily_update_draft(target_date date, p_entries jsonb)
returns public.daily_updates
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.daily_updates;
  result public.daily_updates;
begin
  select * into existing from public.daily_updates where user_id = auth.uid() and date = target_date;

  if found and existing.status = 'confirmed' then
    return existing;
  end if;

  if found then
    update public.daily_updates
    set entries = p_entries, updated_at = now()
    where id = existing.id
    returning * into result;
    return result;
  end if;

  insert into public.daily_updates (user_id, date, status, entries)
  values (auth.uid(), target_date, 'draft', p_entries)
  returning * into result;
  return result;
end;
$$;

-- confirm_my_daily_update — owner + draft only (mirrors canEditDailyUpdate's confirm path).
create function public.confirm_my_daily_update(target_update_id uuid)
returns public.daily_updates
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.daily_updates;
  result public.daily_updates;
begin
  select * into existing from public.daily_updates where id = target_update_id;
  if not found then
    raise exception 'Daily update not found.';
  end if;
  if existing.user_id <> auth.uid() or existing.status <> 'draft' then
    raise exception 'Only the owner can confirm their daily update, and only while it''s still a draft.';
  end if;

  update public.daily_updates
  set status = 'confirmed', confirmed_at = now(), updated_at = now()
  where id = target_update_id
  returning * into result;
  return result;
end;
$$;

-- reopen_my_daily_update — owner + confirmed only, regardless of role (mirrors
-- canReopenDailyUpdate: never a manager-on-behalf-of action).
create function public.reopen_my_daily_update(target_update_id uuid)
returns public.daily_updates
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.daily_updates;
  result public.daily_updates;
begin
  select * into existing from public.daily_updates where id = target_update_id;
  if not found then
    raise exception 'Daily update not found.';
  end if;
  if existing.user_id <> auth.uid() or existing.status <> 'confirmed' then
    raise exception 'Only the owner can reopen their daily update, and only while it''s confirmed.';
  end if;

  update public.daily_updates
  set status = 'draft', confirmed_at = null, updated_at = now()
  where id = target_update_id
  returning * into result;
  return result;
end;
$$;

revoke execute on function public.upsert_my_daily_update_draft(date, jsonb) from public, anon;
revoke execute on function public.confirm_my_daily_update(uuid) from public, anon;
revoke execute on function public.reopen_my_daily_update(uuid) from public, anon;
grant execute on function public.upsert_my_daily_update_draft(date, jsonb) to authenticated, service_role;
grant execute on function public.confirm_my_daily_update(uuid) to authenticated, service_role;
grant execute on function public.reopen_my_daily_update(uuid) to authenticated, service_role;
