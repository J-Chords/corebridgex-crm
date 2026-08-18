-- Phase 8B — extends can_access_company with two new branches so the Project workspace can read
-- its own Company's minimal identity context (name/brand — never contacts/admin metadata, which
-- the UI layer simply never requests for Employee/Supervisor) even for someone whose only
-- relationship to that Company is Project membership, not a `user_companies` row.
--
-- Without this, an Employee who is a legitimate Project member (via the new project_members
-- relationship) but has no corresponding user_companies row would be blocked from reading even
-- the Company's own name when opening "+ Add Service" — the exact same "co-occurrence" gap class
-- already fixed twice this phase for Task/Workstream/Note/Handoff/Project relation hydration.
--
-- CREATE OR REPLACE keeps the function's identity/grants stable; both are re-asserted explicitly
-- per this project's own established lesson (never trust an implicit/inherited grant).

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
    );
$$;

revoke execute on function public.can_access_company(uuid) from public, anon;
grant execute on function public.can_access_company(uuid) to authenticated, service_role;
