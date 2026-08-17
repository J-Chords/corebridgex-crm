-- Phase 8A — extend resolve_profile_directory (20260814120000_profile_directory.sql) with two new
-- EXISTS branches so a Project's owner/member can be resolved the same safe way Task/Workstream/
-- Note/Handoff relations already are — pre-empting the exact "references unknown X" bug class the
-- Phase 7 final-acceptance hotfix had to fix reactively for Task creator / Workstream lead.
-- CREATE OR REPLACE keeps the function's identity/grants stable; both are re-asserted explicitly
-- anyway per this project's own established lesson (never trust an implicit/inherited grant).

create or replace function public.resolve_profile_directory(target_ids uuid[])
returns table (id uuid, full_name text, role text, supervisor_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.role, p.supervisor_id
  from public.profiles p
  where p.id = any(target_ids)
    and (
      p.id = auth.uid()
      or public.manages_user(p.id)
      or exists (
        select 1 from public.tasks t
        where public.can_access_task(t.id)
          and (t.created_by = p.id or t.status_changed_by = p.id)
      )
      or exists (
        select 1 from public.task_assignees ta
        where ta.user_id = p.id and public.can_access_task(ta.task_id)
      )
      or exists (
        select 1 from public.workstreams w
        where public.can_access_workstream(w.id) and w.lead_user_id = p.id
      )
      or exists (
        select 1 from public.workstream_members wm
        where wm.user_id = p.id and public.can_access_workstream(wm.workstream_id)
      )
      or exists (
        select 1 from public.notes n
        where n.author_id = p.id
          and (
            (n.task_id is not null and public.can_access_task(n.task_id))
            or (n.company_id is not null and public.can_access_company(n.company_id))
          )
      )
      or exists (
        select 1 from public.task_handoffs h
        where (h.handed_by_id = p.id or h.handed_to_id = p.id or h.acknowledged_by_id = p.id)
          and public.can_access_task(h.task_id)
      )
      or exists (
        select 1 from public.projects proj
        where proj.owner_id = p.id and public.can_access_project(proj.id)
      )
      or exists (
        select 1 from public.project_members pmem
        where pmem.user_id = p.id and public.can_access_project(pmem.project_id)
      )
    );
$$;

revoke execute on function public.resolve_profile_directory(uuid[]) from public, anon;
grant execute on function public.resolve_profile_directory(uuid[]) to authenticated, service_role;
