-- Phase 4 (CD-208 follow-on) — Project staffing foundation: Additional Team Leads, Project-owner
-- normalization, and incremental Project-staffing RPCs.
--
-- Product Owner decision (locked): `projects.owner_id` remains the Project's Primary Team Lead
-- (unchanged, Admin-only to reassign). A Project may additionally have 0..many "Additional Team
-- Leads" via a dedicated relation (`project_team_leads`), each with the exact same normal
-- Project-management authority as the Primary TL — the sole exception being `owner_id` itself,
-- which stays Admin-only to change. Deliberately NOT layered onto `project_members`/`project_role`
-- (which stay descriptive-data-only, never authorization-bearing) — see docs/domain-model.md.
--
-- Eligibility is enforced at the database level via a trigger (not just the RPC/UI layer): an
-- Additional Team Lead must be an active Supervisor, and must not already be the Project's own
-- `owner_id` (a Primary TL can never simultaneously hold an Additional-TL row on their own Project
-- — this is what makes "an Additional TL can never remove themselves, and the Primary TL can never
-- be removed through the Additional-TL path" structurally true, not just a runtime check).

-- ---------------------------------------------------------------------------
-- 1. project_team_leads — the dedicated Additional Team Lead relation.
-- ---------------------------------------------------------------------------
create table public.project_team_leads (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  primary key (project_id, user_id)
);

create index project_team_leads_user_id_idx on public.project_team_leads (user_id);

comment on table public.project_team_leads is
  'Phase 4 — a Project''s Additional Team Lead(s). Each row grants the exact same normal Project-management authority as projects.owner_id (the Primary Team Lead) via can_manage_project, except changing owner_id itself, which stays Admin-only. Independent of project_members — a user may hold either, both, or neither.';

create or replace function public.enforce_project_team_lead_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.projects;
  v_profile public.profiles;
begin
  select * into v_project from public.projects where id = new.project_id;
  if v_project is null then
    raise exception 'Project not found.';
  end if;
  if new.user_id = v_project.owner_id then
    raise exception 'This user is already the Primary Team Lead — they cannot also be an Additional Team Lead.';
  end if;

  select * into v_profile from public.profiles where id = new.user_id;
  if v_profile is null or not v_profile.active or v_profile.role <> 'supervisor' then
    raise exception 'Only an active Team Lead can be added as an Additional Team Lead.';
  end if;

  return new;
end;
$$;

create trigger project_team_leads_eligibility_trigger
  before insert on public.project_team_leads
  for each row execute function public.enforce_project_team_lead_eligibility();

revoke execute on function public.enforce_project_team_lead_eligibility() from public, anon, authenticated, service_role;

alter table public.project_team_leads enable row level security;

-- Read visibility mirrors project_members_select exactly (can_access_project, the broader READ
-- boundary, never status-gated — a non-Active Project stays staffing-READABLE, only writes are
-- blocked). Write policies are DEFENSE IN DEPTH alongside the RPCs below (section 6/18 — Team Lead
-- staffing changes go through narrow SECURITY DEFINER RPCs, never direct-table RLS as the primary
-- mutation path): each mirrors can_manage_project so a direct-table write can never reach further
-- than the RPCs already allow, AND independently re-checks the Project is Active (the RPCs already
-- enforce this themselves, but a direct table write must never become an alternate path around it —
-- no exception for Admin, matching workstream_activities_write's own established precedent). Self-
-- removal denial (an Additional TL cannot remove themselves) is expressed directly in the DELETE
-- policy: user_id <> auth.uid() — this is a real restriction only for a plain Additional TL
-- target-removing-themselves, since the Primary TL (owner) can never hold a row here (the
-- eligibility trigger above forbids it) and Admin (superadmin role) is never eligible either (role
-- must be 'supervisor').
create policy "project_team_leads_select" on public.project_team_leads
  for select using (public.can_access_project(project_id));

create policy "project_team_leads_insert" on public.project_team_leads
  for insert with check (
    public.can_manage_project(project_id)
    and exists (select 1 from public.projects p where p.id = project_id and p.status = 'active')
  );

create policy "project_team_leads_delete" on public.project_team_leads
  for delete using (
    public.can_manage_project(project_id)
    and user_id <> auth.uid()
    and exists (select 1 from public.projects p where p.id = project_id and p.status = 'active')
  );

grant select, insert, delete on public.project_team_leads to authenticated;
grant select, insert, update, delete on public.project_team_leads to service_role;

-- ---------------------------------------------------------------------------
-- 2. can_manage_project — widened from "Admin OR Supervisor who is literally owner_id" to also
--    include "Supervisor who appears in project_team_leads for this Project." Every existing
--    caller (apply_project_templates, update_project_record, create_workstream, the
--    workstreams_insert/workstream_activities_write RLS policies) picks up this widened definition
--    automatically via this one function replacement — none of them need to change.
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_project(target_project_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select
    public.is_superadmin()
    or (
      public.is_supervisor()
      and (
        exists (
          select 1 from public.projects p
          where p.id = target_project_id and p.owner_id = auth.uid()
        )
        or exists (
          select 1 from public.project_team_leads ptl
          where ptl.project_id = target_project_id and ptl.user_id = auth.uid()
        )
      )
    );
$$;

comment on function public.can_manage_project(uuid) is
  'Phase 3/4 (CD-208) Project-management (write) boundary. Admin always; a Supervisor when they are literally this Project''s owner_id (Primary Team Lead) OR appear in project_team_leads (Additional Team Lead, Phase 4) — both get the exact same authority, except owner_id itself stays Admin-only to change. Direct-report visibility, project_members rows, projectRole, global Template staffing (service_team_leads/service_employees), and workstream.lead_user_id ("Project Template Lead") all grant no Project-management authority here — see docs/authorization.md.';

-- ---------------------------------------------------------------------------
-- 3. can_access_project — READ visibility widened so an Additional Team Lead (and a Supervisor who
--    manages one) gets the same Company-derived read parity a Primary TL/Member already has. Still
--    strictly broader than can_manage_project, never a substitute for it.
-- ---------------------------------------------------------------------------
create or replace function public.can_access_project(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_superadmin()
    or exists (
      select 1 from public.projects p
      join public.companies c on c.id = p.company_id
      where p.id = target_project_id and c.is_internal
    )
    or exists (
      select 1 from public.projects p
      where p.id = target_project_id and public.manages_user(p.owner_id)
    )
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = target_project_id and public.manages_user(pm.user_id)
    )
    or exists (
      select 1 from public.project_team_leads ptl
      where ptl.project_id = target_project_id and public.manages_user(ptl.user_id)
    );
$$;

revoke execute on function public.can_access_project(uuid) from public, anon;
grant execute on function public.can_access_project(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. can_access_company — Additional Team Lead relationships now grant the same Company-derived
--    visibility owner_id/project_members already do (Phase 4 audit section 4.4), so an Additional
--    TL isn't silently blocked from Company data their own managed Project needs.
-- ---------------------------------------------------------------------------
create or replace function public.can_access_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_superadmin()
    or exists (
      select 1 from public.companies where id = target_company_id and is_internal
    )
    or exists (
      select 1 from public.user_companies uc
      where uc.company_id = target_company_id
        and (
          uc.user_id = auth.uid()
          or public.manages_user(uc.user_id)
        )
    )
    or exists (
      select 1 from public.projects p
      where p.company_id = target_company_id
        and (p.owner_id = auth.uid() or public.manages_user(p.owner_id))
    )
    or exists (
      select 1 from public.project_members pm
      join public.projects p on p.id = pm.project_id
      where p.company_id = target_company_id
        and (pm.user_id = auth.uid() or public.manages_user(pm.user_id))
    )
    or exists (
      select 1 from public.project_team_leads ptl
      join public.projects p on p.id = ptl.project_id
      where p.company_id = target_company_id
        and (ptl.user_id = auth.uid() or public.manages_user(ptl.user_id))
    );
$$;

revoke execute on function public.can_access_company(uuid) from public, anon;
grant execute on function public.can_access_company(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. can_access_workstream — a Primary/Additional Project Team Lead can now read a Workstream under
--    a Project they manage, even when they're not personally its lead/team (Phase 4 audit section
--    4.5). READ only — never a substitute for the Workstream-activities/staffing mutation checks,
--    which stay on can_manage_project directly.
-- ---------------------------------------------------------------------------
create or replace function public.can_access_workstream(target_workstream_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_superadmin()
    or exists (
      select 1 from public.workstreams w
      join public.companies c on c.id = w.company_id
      where w.id = target_workstream_id and c.is_internal
    )
    or exists (
      select 1 from public.workstreams w
      where w.id = target_workstream_id
        and w.project_id is not null
        and public.can_manage_project(w.project_id)
    )
    or exists (
      select 1 from public.workstreams w
      where w.id = target_workstream_id and public.manages_user(w.lead_user_id)
    )
    or exists (
      select 1 from public.workstream_members m
      where m.workstream_id = target_workstream_id and public.manages_user(m.user_id)
    );
$$;

grant execute on function public.can_access_workstream(uuid) to authenticated;
grant execute on function public.can_access_workstream(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. update_project_record — Primary TL / owner_id normalization. When Admin changes owner_id to
--    someone who already held an Additional-TL row on this Project, that row is now redundant
--    (Primary TL authority subsumes it) and is removed atomically in the same call. The PREVIOUS
--    owner is never auto-converted to Additional TL — they simply lose Project-management authority
--    unless separately re-added. Every other line is unchanged from the currently-applied
--    definition (20260924130000).
-- ---------------------------------------------------------------------------
create or replace function public.update_project_record(
  p_project_id uuid,
  p_name text,
  p_owner_id uuid,
  p_contract_start_date date,
  p_contract_months integer,
  p_contract_end_date date,
  p_description text,
  p_project_group_id uuid,
  p_tags text[],
  p_partner_brand_id uuid
)
returns public.projects
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
  v_row public.projects;
  v_new_owner_id uuid;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'You do not have permission to edit this project.';
  end if;

  v_is_admin := public.is_superadmin();

  select owner_id into v_new_owner_id from public.projects where id = p_project_id;
  if v_new_owner_id is null then
    raise exception 'Project not found.';
  end if;
  if p_project_group_id is not null and not exists (select 1 from public.project_groups where id = p_project_group_id) then
    raise exception 'Project Group not found.';
  end if;

  if v_is_admin then
    v_new_owner_id := coalesce(p_owner_id, v_new_owner_id);
  end if;

  update public.projects p set
    name = case when v_is_admin then trim(coalesce(nullif(p_name, ''), p.name)) else p.name end,
    owner_id = v_new_owner_id,
    partner_brand_id = case when v_is_admin then p_partner_brand_id else p.partner_brand_id end,
    contract_start_date = p_contract_start_date,
    contract_months = coalesce(p_contract_months, p.contract_months),
    contract_end_date = p_contract_end_date,
    description = p_description,
    project_group_id = p_project_group_id,
    tags = coalesce(p_tags, p.tags),
    updated_at = now()
  where p.id = p_project_id
  returning * into v_row;

  -- Phase 4 — Primary TL normalization: a redundant Additional-TL row for the new owner is removed
  -- atomically in the same transaction as the owner change itself.
  if v_is_admin and v_row.owner_id is not null then
    delete from public.project_team_leads where project_id = p_project_id and user_id = v_row.owner_id;
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Incremental Project staffing RPCs — narrow, SECURITY DEFINER, used by both Admin and an
--    authorized Project Team Lead (Primary or Additional). Deliberately separate from the existing
--    bulk memberUserIds replace inside create_project/update_project_record's own member handling
--    (unaffected, stays Admin-only) — these are the narrow, TL-usable single add/remove actions. All
--    require the Project to be Active, mirroring create_workstream/apply_project_templates' own
--    lifecycle guard exactly.
-- ---------------------------------------------------------------------------
create or replace function public.add_project_team_lead(p_project_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'You do not have permission to manage this project''s staffing.';
  end if;
  select status into v_status from public.projects where id = p_project_id;
  if v_status is null then
    raise exception 'Project not found.';
  end if;
  if v_status <> 'active' then
    raise exception '%', case v_status
      when 'archived' then 'This client is archived. Reactivate the client to add new work.'
      when 'on-hold' then 'This project is on hold. Return it to Active to add new work.'
      when 'completed' then 'This project is completed. Return it to Active to add new work.'
      when 'cancelled' then 'This project is canceled. Return it to Active to add new work.'
      when 'trash' then 'This project is in Trash — restore it first.'
      else 'This project must be Active to add new work.'
    end;
  end if;

  insert into public.project_team_leads (project_id, user_id, created_by)
  values (p_project_id, p_user_id, auth.uid())
  on conflict (project_id, user_id) do nothing;
end;
$$;

create or replace function public.remove_project_team_lead(p_project_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'You do not have permission to manage this project''s staffing.';
  end if;
  select status into v_status from public.projects where id = p_project_id;
  if v_status is null then
    raise exception 'Project not found.';
  end if;
  if v_status <> 'active' then
    raise exception '%', case v_status
      when 'archived' then 'This client is archived. Reactivate the client to add new work.'
      when 'on-hold' then 'This project is on hold. Return it to Active to add new work.'
      when 'completed' then 'This project is completed. Return it to Active to add new work.'
      when 'cancelled' then 'This project is canceled. Return it to Active to add new work.'
      when 'trash' then 'This project is in Trash — restore it first.'
      else 'This project must be Active to add new work.'
    end;
  end if;
  if not exists (select 1 from public.project_team_leads where project_id = p_project_id and user_id = p_user_id) then
    raise exception 'That user is not an Additional Team Lead on this project.';
  end if;
  -- An Additional TL may remove another Additional TL, but never themselves — Admin and the
  -- Primary TL have no such restriction. (The Primary TL can never hold a project_team_leads row on
  -- their own Project at all, per the eligibility trigger, so this only ever fires for a plain
  -- Additional TL targeting their own row.)
  if public.is_supervisor() and not public.is_superadmin() and p_user_id = auth.uid()
     and not exists (select 1 from public.projects where id = p_project_id and owner_id = auth.uid())
  then
    raise exception 'You can''t remove yourself as an Additional Team Lead.';
  end if;

  delete from public.project_team_leads where project_id = p_project_id and user_id = p_user_id;
end;
$$;

create or replace function public.add_project_member(p_project_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_role text;
  v_active boolean;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'You do not have permission to manage this project''s staffing.';
  end if;
  select status into v_status from public.projects where id = p_project_id;
  if v_status is null then
    raise exception 'Project not found.';
  end if;
  if v_status <> 'active' then
    raise exception '%', case v_status
      when 'archived' then 'This client is archived. Reactivate the client to add new work.'
      when 'on-hold' then 'This project is on hold. Return it to Active to add new work.'
      when 'completed' then 'This project is completed. Return it to Active to add new work.'
      when 'cancelled' then 'This project is canceled. Return it to Active to add new work.'
      when 'trash' then 'This project is in Trash — restore it first.'
      else 'This project must be Active to add new work.'
    end;
  end if;

  select role, active into v_role, v_active from public.profiles where id = p_user_id;
  if v_role is null or not v_active or v_role not in ('employee', 'supervisor') then
    raise exception 'Only an active Employee or Team Lead can be added as a Project Member.';
  end if;

  insert into public.project_members (project_id, user_id)
  values (p_project_id, p_user_id)
  on conflict (project_id, user_id) do nothing;
end;
$$;

create or replace function public.remove_project_member(p_project_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'You do not have permission to manage this project''s staffing.';
  end if;
  select status into v_status from public.projects where id = p_project_id;
  if v_status is null then
    raise exception 'Project not found.';
  end if;
  if v_status <> 'active' then
    raise exception '%', case v_status
      when 'archived' then 'This client is archived. Reactivate the client to add new work.'
      when 'on-hold' then 'This project is on hold. Return it to Active to add new work.'
      when 'completed' then 'This project is completed. Return it to Active to add new work.'
      when 'cancelled' then 'This project is canceled. Return it to Active to add new work.'
      when 'trash' then 'This project is in Trash — restore it first.'
      else 'This project must be Active to add new work.'
    end;
  end if;

  -- Removes only the project_members row — any Primary/Additional Team Lead authority the same
  -- person holds is entirely unaffected.
  delete from public.project_members where project_id = p_project_id and user_id = p_user_id;
end;
$$;

revoke all on function public.add_project_team_lead(uuid, uuid) from public, anon;
grant execute on function public.add_project_team_lead(uuid, uuid) to authenticated, service_role;
revoke all on function public.remove_project_team_lead(uuid, uuid) from public, anon;
grant execute on function public.remove_project_team_lead(uuid, uuid) to authenticated, service_role;
revoke all on function public.add_project_member(uuid, uuid) from public, anon;
grant execute on function public.add_project_member(uuid, uuid) to authenticated, service_role;
revoke all on function public.remove_project_member(uuid, uuid) from public, anon;
grant execute on function public.remove_project_member(uuid, uuid) to authenticated, service_role;
