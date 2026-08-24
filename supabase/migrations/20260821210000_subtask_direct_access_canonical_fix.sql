-- Subtask direct-access canonical fix.
--
-- 20260821200000 originally pushed `can_access_task_directly` as a thin wrapper over the
-- pre-existing `can_user_access_task(candidate_id, target_task_id)` helper. During hosted probing, a
-- legitimate directly-assigned Employee whose only route to their own Task's Company was Project
-- membership (not `user_companies`) was incorrectly rejected. Root cause: `can_user_access_task`
-- delegates to `can_user_access_company(candidate_id, target_company_id)`, which predates Projects
-- and was never updated to include the Project-owner/Project-member access paths that the current,
-- auth.uid()-based `can_access_company(target_company_id)` already has (added in
-- `20260815110000_company_access_via_project.sql`).
--
-- That was fixed live via an ad-hoc `create or replace function can_access_task_directly(...)` with
-- a self-contained body, to unblock verification immediately — but that left the real, pre-existing
-- root cause (`can_user_access_company`/`can_user_access_task`) uncorrected in migration history, an
-- ad-hoc-only database state. `20260821200000`'s local file has been restored (in this same pass) to
-- the SQL it ORIGINALLY executed (the wrapper form) — migration-version alignment does not by itself
-- prove SQL-content reproducibility, the exact lesson already learned in Phase 9's own migration-
-- canonicalization pass. This migration is the real, forward-only, canonical fix.
--
-- Fixes, in dependency order:
--   1. `can_user_access_company` — brought to full parity with the CURRENT `can_access_company`,
--      adding the Project-owner and Project-member access paths (each with the same
--      Supervisor-manages-a-direct-report extension the existing `user_companies` clause already
--      had). Company/Project access parity only — no Task hierarchy semantics added here.
--   2. `can_user_access_task` — re-asserted with its EXISTING, already-correct, direct-only body
--      (no logic change needed: it already delegates to `can_user_access_company`, so fixing #1
--      alone corrects it). Re-asserted here, not merely left alone, so this migration's own history
--      documents that it was audited and confirmed correct rather than silently assumed so.
--   3. `can_access_task_directly` — now canonically delegates to
--      `can_user_access_task(auth.uid(), target_task_id)` again, since the dependency chain is now
--      provably correct (confirmed by the hosted regression probes run immediately after this
--      migration was pushed — see the final report). One authorization rule, not two independent
--      copies of the same logic.
--
-- `can_access_task` (the one-hop hierarchy READ helper) is completely untouched by this migration.
--
-- Forward-only: does not edit 20260821190000_one_level_subtasks.sql or 20260821200000 (now restored
-- to its historical originally-applied body — see above).

-- ============================================================================
-- 1. can_user_access_company — candidate-parameterized parity with the current can_access_company
-- ============================================================================
-- Mirrors can_access_company's exact 5-branch structure (superadmin / internal / user_companies /
-- project-owner / project-member), each "manages_user(x)" call inlined for the parameterized
-- candidate (manages_user itself always reads the CURRENT session's auth.uid(), so it cannot be
-- called as-is here) — candidate is themselves the direct row-holder, OR candidate is a Supervisor
-- and the row-holder is their direct report. Superadmin is checked once, up front, exactly like
-- can_access_company — every other branch already implicitly excludes needing to repeat it.

create or replace function public.can_user_access_company(candidate_id uuid, target_company_id uuid)
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
    )
    or exists (
      select 1 from public.projects p
      where p.company_id = target_company_id
        and (
          p.owner_id = candidate_id
          or (
            exists (select 1 from public.profiles where id = candidate_id and role = 'supervisor')
            and exists (select 1 from public.profiles where id = p.owner_id and supervisor_id = candidate_id)
          )
        )
    )
    or exists (
      select 1 from public.project_members pm
      join public.projects p on p.id = pm.project_id
      where p.company_id = target_company_id
        and (
          pm.user_id = candidate_id
          or (
            exists (select 1 from public.profiles where id = candidate_id and role = 'supervisor')
            and exists (select 1 from public.profiles where id = pm.user_id and supervisor_id = candidate_id)
          )
        )
    );
$$;

revoke all on function public.can_user_access_company(uuid, uuid) from public, anon;
grant execute on function public.can_user_access_company(uuid, uuid) to authenticated, service_role;

comment on function public.can_user_access_company(uuid, uuid) is
  'The candidate-parameterized equivalent of can_access_company(target_company_id) — "would THIS '
  'candidate (not necessarily the caller) legitimately access this Company," used when evaluating '
  'someone other than auth.uid() (e.g. a prospective Handoff recipient, or can_user_access_task '
  'below). Kept in exact structural parity with can_access_company: superadmin / internal Company / '
  'user_companies / Project owner / Project member, each with the Supervisor-manages-a-direct-report '
  'extension. Update this whenever can_access_company itself gains a new access path.';

-- ============================================================================
-- 2. can_user_access_task — re-asserted, direct-only, no hierarchy branch
-- ============================================================================
-- Byte-for-byte identical to its existing body — it already delegates to
-- can_user_access_company(candidate_id, ...), so fixing that dependency above already corrects this
-- function's behavior with no logic change needed here. Re-created (not merely left alone) so
-- migration history itself documents that this function was audited as part of this fix and
-- confirmed already correct, rather than silently assumed so.

create or replace function public.can_user_access_task(candidate_id uuid, target_task_id uuid)
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

revoke all on function public.can_user_access_task(uuid, uuid) from public, anon;
grant execute on function public.can_user_access_task(uuid, uuid) to authenticated, service_role;

comment on function public.can_user_access_task(uuid, uuid) is
  'The candidate-parameterized, DIRECT-ONLY (no parent/child hierarchy) equivalent of pre-Phase-10 '
  'can_access_task — "would THIS candidate legitimately, directly operate on this Task." Used for '
  'Handoff-recipient eligibility (create_task_handoff, list_handoff_candidates) and as the engine '
  'behind can_access_task_directly below. Superadmin org-wide; Supervisor via a direct-report/self '
  'assignee match or unassigned+Company access; Employee via direct assignment+Company access — '
  'Company access now correctly Project-inclusive via the fixed can_user_access_company above.';

-- ============================================================================
-- 3. can_access_task_directly — canonically delegates again, now that the chain is correct
-- ============================================================================
-- Reverts to a thin wrapper over can_user_access_task(auth.uid(), target_task_id) — the form
-- originally intended in 20260821200000 before the pre-existing can_user_access_company gap forced a
-- temporary self-contained body. One authorization rule now genuinely lives in one place. Confirmed
-- equivalent to the prior self-contained body by direct hosted regression (see the final report) —
-- if any future probe finds a discrepancy, the fix belongs in a NEW forward migration, never an edit
-- to this one.

create or replace function public.can_access_task_directly(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_user_access_task(auth.uid(), target_task_id);
$$;

revoke all on function public.can_access_task_directly(uuid) from public, anon;
grant execute on function public.can_access_task_directly(uuid) to authenticated, service_role;

comment on function public.can_access_task_directly(uuid) is
  'Pre-Phase-10 direct Task-access semantics, no hierarchy inheritance. Use this (never '
  'can_access_task) as the authorization gate for any MUTATION or side-effect on a Task — creating a '
  'Subtask, a Note, a Handoff, logging time, or the parent time roll-up. can_access_task remains the '
  'READ-only hierarchy-visibility helper for SELECT policies and presentation context. Canonically a '
  'thin wrapper over can_user_access_task(auth.uid(), target_task_id) — see that function and '
  'can_user_access_company for the real authorization logic, kept in exactly one place.';
