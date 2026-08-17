-- Phase 7 final-acceptance hotfix (Part 1) — "Task <id> references unknown creator <id>" /
-- "Workstream <id> references unknown lead <id>".
--
-- ROOT CAUSE (confirmed read-only, no identifiers printed): the referenced profile rows exist and
-- are active. They are hidden from the current viewer by `profiles_select`'s own RLS policy
-- (`id = auth.uid() OR is_superadmin() OR (is_supervisor() AND supervisor_id = auth.uid())`) — a
-- strictly "self, or my own direct reports" shape with no "upward" (my supervisor) or "lateral"
-- (a co-assignee, a task's creator who isn't my manager) visibility at all. Every seeded Task's
-- creator and every seeded Workstream's lead is the Supervisor; an Employee viewer legitimately
-- can access those Tasks/Workstreams (via their own assignment) but can never SELECT the
-- Supervisor's own profiles row directly, so `hydrate()`'s `users.find(...)` correctly finds
-- nothing and throws. This is a schema/RLS gap, not a provider bug — the provider was already
-- asking for the right ids.
--
-- FIX: a narrow, additive SECURITY DEFINER RPC — never a broadening of `profiles_select` itself,
-- which would also widen the sensitive columns (email/active/supervisor_id/created_at) exposed by
-- the existing blanket `grant select on profiles to authenticated` for every newly-visible row.
-- `resolve_profile_directory` returns ONLY the fields any UI actually reads off a Task/Workstream/
-- Note/Handoff's related-person objects (confirmed by codebase search: id, full_name, role,
-- supervisor_id — never email/active/created_at) for a requested set of ids, and ONLY for ids the
-- caller has a legitimate reason to resolve: themselves, anyone they manage (unchanged from
-- today), or anyone who co-occurs with them as a creator/status-changer/assignee on a Task they
-- can access, a lead/member on a Workstream they can access, an author on a Note they can access,
-- or a participant on a Task Handoff they can access. This is centralized so Tasks, Workstreams,
-- Notes, and Task Handoffs all resolve through the same function rather than four separate
-- ad-hoc widenings.
--
-- Time Entries were also inspected (Part 1, "check all real providers") and found NOT to have
-- this gap: `time_entries_select`'s own visibility (`user_id = auth.uid() or manages_user(user_id)`)
-- is already exactly as narrow as `profiles_select` — any time-entry row a viewer can see already
-- has a resolvable profile behind it, by construction. No change needed there.

create function public.resolve_profile_directory(target_ids uuid[])
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
    );
$$;

revoke execute on function public.resolve_profile_directory(uuid[]) from public, anon;
grant execute on function public.resolve_profile_directory(uuid[]) to authenticated, service_role;
