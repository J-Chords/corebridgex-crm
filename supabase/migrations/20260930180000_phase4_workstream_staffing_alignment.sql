-- Phase 4 (CD-208 follow-on) — Workstream/Project Service staffing alignment.
--
-- Closes the second of the two gaps the Phase-4 audit found (the first, canConfigureWorkstreamActivities's
-- app-layer/mock parity, is an application-layer-only fix, no migration needed): the
-- workstream_members_write RLS policy still authorized Supervisor writes via the pre-Phase-3 model
-- (any Supervisor who manages the Workstream's lead or an existing team member, regardless of
-- Project ownership) instead of the owner-based can_manage_project boundary. Also adds
-- update_workstream_staffing, the narrow RPC for changing a Project Service's Lead/Team — Primary
-- and Additional Project Team Leads get this exact same capability now that can_manage_project
-- covers both (Phase-4's foundation migration, applied just before this one). create_workstream
-- itself needs NO change here — its Supervisor branch already calls can_manage_project directly
-- (Phase 3's own authorization-hardening migration), so it picked up the Phase-4 widening
-- automatically the moment can_manage_project was redefined.
--
-- workstreams.lead_user_id stays exactly one Lead per Workstream — this migration introduces no
-- Additional Workstream Leads, and does not touch the create_workstream/update_workstream_staffing
-- target-eligibility rule (self or an active direct report for a Team Lead caller; Admin's existing
-- broad valid-active-profile behavior, via manages_user's own superadmin short-circuit).

-- ---------------------------------------------------------------------------
-- 1. workstream_members_write RLS — was: is_superadmin() OR (is_supervisor() AND
--    manages_user(w.lead_user_id) AND can_access_project(w.project_id)) (20260814090000, never
--    touched by Phase 3). Replaced with can_manage_project(w.project_id), requiring the Workstream
--    to have a Project the caller actually manages (Primary or Additional TL), PLUS the same
--    Project-must-be-Active lifecycle guard workstream_activities_write already carries (applied to
--    the whole predicate, no Admin exception — a direct table write must never become an alternate
--    path around the Active-only rule the RPCs also enforce). A Workstream with no Project at all
--    can only be staffed by Superadmin (there's no Project-TL concept to fall back to for a legacy
--    Company-only Workstream), and is exempt from the Active-guard (no Project to check).
-- ---------------------------------------------------------------------------
drop policy "workstream_members_write" on public.workstream_members;

create policy "workstream_members_write" on public.workstream_members
  for all
  using (
    (
      public.is_superadmin()
      or exists (
        select 1 from public.workstreams w
        where w.id = workstream_id
          and w.project_id is not null
          and public.can_manage_project(w.project_id)
      )
    )
    and not exists (
      select 1 from public.workstreams w
      join public.projects p on p.id = w.project_id
      where w.id = workstream_members.workstream_id and p.status is distinct from 'active'
    )
  )
  with check (
    (
      public.is_superadmin()
      or exists (
        select 1 from public.workstreams w
        where w.id = workstream_id
          and w.project_id is not null
          and public.can_manage_project(w.project_id)
      )
    )
    and not exists (
      select 1 from public.workstreams w
      join public.projects p on p.id = w.project_id
      where w.id = workstream_members.workstream_id and p.status is distinct from 'active'
    )
  );

comment on policy "workstream_members_write" on public.workstream_members is
  'Phase 4 (CD-208) — narrowed from the pre-Phase-3 manages_user(lead)+can_access_project shape to the owner-based can_manage_project boundary, matching workstream_activities_write''s own Phase-3 hardening. Read visibility (workstream_members_select) is unaffected and stays broader.';

-- ---------------------------------------------------------------------------
-- 2. update_workstream_staffing — the narrow "change this Service's Lead and/or Team" RPC,
--    deliberately separate from update_workstream (which stays Admin-only/Superadmin, full edit —
--    no hosted RPC exists for update_workstream itself, direct-table write gated by
--    workstreams_update RLS, untouched). Authorization: Admin, or can_manage_project on the
--    Workstream's own Project. Target eligibility for a Team Lead caller is unchanged from
--    create_workstream's own rule (self or an active direct report, for both Lead and Team); Admin
--    keeps manages_user's own superadmin short-circuit (unconditional). Project must be Active.
-- ---------------------------------------------------------------------------
create or replace function public.update_workstream_staffing(
  p_workstream_id uuid,
  p_lead_user_id uuid,
  p_team_user_ids uuid[]
)
returns public.workstreams
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ws public.workstreams;
  v_project_status text;
  v_allowed boolean;
begin
  select * into v_ws from public.workstreams where id = p_workstream_id;
  if v_ws is null then
    raise exception 'Template not found.';
  end if;

  v_allowed := public.is_superadmin()
    or (v_ws.project_id is not null and public.can_manage_project(v_ws.project_id));
  if not v_allowed then
    raise exception 'You do not have permission to manage this template''s staffing.';
  end if;

  if v_ws.project_id is not null then
    select status into v_project_status from public.projects where id = v_ws.project_id;
    if v_project_status is distinct from 'active' then
      raise exception '%', case v_project_status
        when 'archived' then 'This client is archived. Reactivate the client to add new work.'
        when 'on-hold' then 'This project is on hold. Return it to Active to add new work.'
        when 'completed' then 'This project is completed. Return it to Active to add new work.'
        when 'cancelled' then 'This project is canceled. Return it to Active to add new work.'
        when 'trash' then 'This project is in Trash — restore it first.'
        else 'This project must be Active to add new work.'
      end;
    end if;
  end if;

  if not exists (select 1 from public.profiles where id = p_lead_user_id and active) then
    raise exception 'Lead user not found or inactive.';
  end if;
  if not public.manages_user(p_lead_user_id) then
    raise exception 'You can only assign yourself or one of your own direct reports as Project Template Lead.';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_team_user_ids, '{}')) as u
    where not exists (select 1 from public.profiles where id = u and active)
       or not public.manages_user(u)
  ) then
    raise exception 'One of the selected team members is outside your team.';
  end if;

  update public.workstreams
  set lead_user_id = p_lead_user_id, updated_at = now()
  where id = p_workstream_id
  returning * into v_ws;

  delete from public.workstream_members where workstream_id = p_workstream_id;
  if coalesce(array_length(p_team_user_ids, 1), 0) > 0 then
    insert into public.workstream_members (workstream_id, user_id)
    select p_workstream_id, u from unnest(p_team_user_ids) as u;
  end if;

  return v_ws;
end;
$$;

revoke all on function public.update_workstream_staffing(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.update_workstream_staffing(uuid, uuid, uuid[]) to authenticated, service_role;
