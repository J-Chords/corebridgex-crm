-- Foundation migration set, part 2/4.
--
-- Maps to src/lib/data/types/user.ts's `User` (id, fullName, email, role, active, supervisorId,
-- createdAt — assignedCompanyIds is intentionally NOT here, see user_companies in
-- 20260813130859_companies.sql). Role is exactly the three current values, per
-- src/lib/data/types/role.ts — no old role names revived.
--
-- CRITICAL, verified-current behavior this migration preserves (do not broaden):
--   - src/lib/data/permissions.ts's canEditOwnProfile() is superadmin-only, and
--     mock-auth-provider.ts's updateProfile() always writes to the CALLER's own row only — so
--     today, only a superadmin can edit their OWN name/email; a supervisor/employee cannot edit
--     even their own profile. Nothing here changes that.
--   - role / supervisor_id / active are authorization-sensitive and must never be ordinary
--     client-editable columns — they're excluded from every GRANT below and only reachable via
--     the SECURITY DEFINER admin_* functions at the bottom of this file, each gated on
--     is_superadmin() internally.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null unique,
  role text not null default 'employee' check (role in ('superadmin', 'supervisor', 'employee')),
  active boolean not null default true,
  supervisor_id uuid null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint profiles_no_self_supervisor check (supervisor_id is null or supervisor_id <> id)
);

create index profiles_supervisor_id_idx on public.profiles (supervisor_id);

comment on table public.profiles is
  'Application profile for an auth.users row. role/supervisor_id/active are authorization-sensitive — never grant ordinary UPDATE on them; use the admin_* functions below.';

-- ---------------------------------------------------------------------------
-- Invite-only onboarding: auth.users gets a row via Supabase Auth's admin invite
-- (server-side, service-role key, never in this migration or in browser code) — this trigger
-- then creates a minimal matching profile automatically. Defaults to 'employee'/active — a
-- superadmin assigns the real role/supervisor afterward via admin_set_user_role/
-- admin_set_supervisor, never through this trigger.
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    'employee',
    true
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Role/relationship helpers — SECURITY DEFINER because a supervisor's "who do I manage" check
-- has to read OTHER people's profiles rows regardless of what RLS would otherwise let the
-- caller see directly; without this they'd recurse into the very policy they're evaluating.
-- All STABLE (same result within one statement) and query only by auth.uid(), never a
-- caller-supplied "act as" id, so they can't be used to impersonate another user's permissions.
-- ---------------------------------------------------------------------------
create function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'superadmin'
  );
$$;

create function public.is_supervisor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'supervisor'
  );
$$;

create function public.is_employee()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'employee'
  );
$$;

-- Mirrors permissions.ts's managesUser(manager, target): self, or superadmin, or the
-- supervisor of target_id's own direct report.
create function public.manages_user(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth.uid() = target_id
    or public.is_superadmin()
    or (
      public.is_supervisor()
      and exists (
        select 1 from public.profiles
        where id = target_id and supervisor_id = auth.uid()
      )
    );
$$;

grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.is_supervisor() to authenticated;
grant execute on function public.is_employee() to authenticated;
grant execute on function public.manages_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS — mirrors canViewTimeForUser/managesUser's visibility shape (self, direct reports,
-- superadmin) for SELECT; UPDATE is deliberately narrower than that, per the current-behavior
-- note above.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles_select" on public.profiles
  for select
  using (
    id = auth.uid()
    or public.is_superadmin()
    or (public.is_supervisor() and supervisor_id = auth.uid())
  );

-- Matches today exactly: only a superadmin, only on their own row. Column-level GRANT below
-- (not this policy) is what actually keeps role/supervisor_id/active out of reach — a USING/
-- WITH CHECK clause can restrict which ROWS are touched, never which COLUMNS.
create policy "profiles_update_self_superadmin" on public.profiles
  for update
  using (id = auth.uid() and public.is_superadmin())
  with check (id = auth.uid() and public.is_superadmin());

grant select on public.profiles to authenticated;
-- Column-level grant: full_name/email only. role/supervisor_id/active/id/created_at are never
-- reachable through an ordinary UPDATE, by any role, regardless of RLS policy — only through
-- the SECURITY DEFINER functions below (which are themselves gated on is_superadmin()).
grant update (full_name, email) on public.profiles to authenticated;
-- No INSERT/DELETE grant — rows are created only by the trigger above and never hard-deleted
-- (matches the current app: User has no delete path, only the active flag).

-- ---------------------------------------------------------------------------
-- Admin RPCs — the only sanctioned way to change role/supervisor_id/active. Each independently
-- re-checks is_superadmin() (never trust that only a superadmin could have been granted
-- EXECUTE — grant broadly, gate internally, the standard SECURITY DEFINER RPC pattern).
-- ---------------------------------------------------------------------------
create function public.admin_set_user_role(target_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin can change a user''s role.';
  end if;
  if new_role not in ('superadmin', 'supervisor', 'employee') then
    raise exception 'Invalid role: %', new_role;
  end if;
  update public.profiles set role = new_role where id = target_id;
  if not found then
    raise exception 'Profile % not found.', target_id;
  end if;
end;
$$;

create function public.admin_set_supervisor(target_id uuid, new_supervisor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin can change a user''s supervisor.';
  end if;
  if target_id = new_supervisor_id then
    raise exception 'A user cannot supervise themselves.';
  end if;
  update public.profiles set supervisor_id = new_supervisor_id where id = target_id;
  if not found then
    raise exception 'Profile % not found.', target_id;
  end if;
end;
$$;

create function public.admin_set_active(target_id uuid, new_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin can activate or deactivate a user.';
  end if;
  update public.profiles set active = new_active where id = target_id;
  if not found then
    raise exception 'Profile % not found.', target_id;
  end if;
end;
$$;

grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.admin_set_supervisor(uuid, uuid) to authenticated;
grant execute on function public.admin_set_active(uuid, boolean) to authenticated;
