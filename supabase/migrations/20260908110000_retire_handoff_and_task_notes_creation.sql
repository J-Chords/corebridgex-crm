-- Task Level Phase 1, Sections 11-14 — retire NEW Handoff creation and NEW Task Notes authoring.
--
-- Handoff: hosted read-back (performed before this migration) confirmed create_task_handoff and
-- list_handoff_candidates ALREADY use the narrow can_access_task_directly gate, not the broader
-- can_access_task some earlier notes suggested — so there is no authorization bug to fix here (per
-- the explicit instruction: "Do NOT create a security migration to fix something already fixed").
-- Since new Handoff creation is being retired anyway, the correct move is simply to revoke EXECUTE
-- on both RPCs from `authenticated`, closing the capability at the server, not just hiding the UI.
-- acknowledge_task_handoff is deliberately left grantable — hosted data has 1 real pending historical
-- Handoff (of 3 total), and its recipient should still be able to acknowledge it. No table/row is
-- touched; every historical task_handoffs record remains fully intact and readable.
--
-- Task Notes: notes_insert's own WITH CHECK already OR's two independent branches — a task_id branch
-- and a company_id branch — so the task_id branch can be dropped cleanly without touching Company
-- Notes creation at all. notes_select (history reads, for both Task and Company Notes) is completely
-- untouched.

revoke execute on function public.create_task_handoff(uuid, uuid, text, text, text) from authenticated;
revoke execute on function public.list_handoff_candidates(uuid) from authenticated;

drop policy "notes_insert" on public.notes;

create policy "notes_insert" on public.notes
  for insert
  with check (
    author_id = auth.uid()
    and task_id is null
    and company_id is not null
    and public.can_access_company(company_id)
  );
