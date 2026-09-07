-- Task Level Phase 1 — legacy status_reason compatibility correction.
--
-- Post-apply hosted audit of 20260908090000_task_status_model_phase1.sql found 2 real Tasks
-- (`7b18b47c-...` "IT discovery call notes", `599b9cc3-...` "Testing Task") sitting at
-- status = 'waiting' with status_reason IS NULL, both with status_changed_at IS NULL — i.e. never
-- touched by update_task_status, only by that migration's own bulk rename.
--
-- Root cause (confirmed via direct hosted read-back of the migration's own statement order, not
-- guessed): that migration's step 2 (`update tasks set status = case ... end`) necessarily ran
-- BEFORE step 3 (`create or replace function enforce_task_invariants`) installed the new
-- status_reason requirement — a plain rename UPDATE has no way to also invent a reason that was
-- never recorded, and Postgres triggers never retroactively re-validate rows written before they
-- existed. This is an inherent ordering artifact of turning on a brand-new NOT-NULL-shaped business
-- rule against pre-existing data, not an execution bug, and not something a second identical UPDATE
-- could fix — there is still no real reason text for either row. Fabricating one (e.g. "Waiting on
-- client") was explicitly rejected as untruthful.
--
-- Fix: enforce_task_invariants gains one additional, narrowly-scoped bypass — a write is allowed to
-- LEAVE an already-null status_reason null only when it is not the one creating or worsening that
-- gap: TG_OP = 'UPDATE', the status is not changing, and the reason was ALREADY null before this
-- write. This set can never grow going forward:
--   * A brand-new INSERT into 'waiting'/'blocked' still always requires a reason (TG_OP <> 'UPDATE'
--     fails the bypass outright).
--   * A transition INTO 'waiting'/'blocked' from any other status still always requires a reason
--     (old.status <> new.status fails the bypass).
--   * Clearing an EXISTING real reason while remaining 'waiting'/'blocked' still always raises
--     (old.status_reason was not null, so the bypass condition is false).
--   * Only a row that already carried this exact legacy gap, and stays exactly as it was, passes
--     through untouched — the moment anyone supplies a real reason or changes its status, it leaves
--     this set permanently and the ordinary rule applies again.
-- Byte-for-byte identical to the currently-hosted body (fresh read-back, not reconstructed from the
-- prior migration file) except for the one bypass line inside the status_reason block.

create or replace function public.enforce_task_invariants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  enabled_count int;
  parent public.tasks;
begin
  if TG_OP = 'UPDATE' and new.parent_task_id is distinct from old.parent_task_id then
    raise exception 'A Task''s parent cannot be changed after creation.';
  end if;

  if TG_OP = 'UPDATE' and exists (select 1 from public.tasks where parent_task_id = old.id) then
    if new.workstream_id is distinct from old.workstream_id then
      raise exception 'This Task has Subtasks — its Service/Workstream cannot be changed. Remove or reassign the Subtasks first.';
    end if;
    if new.activity_id is distinct from old.activity_id then
      raise exception 'This Task has Subtasks — its Activity cannot be changed. Remove or reassign the Subtasks first.';
    end if;
  end if;

  if new.parent_task_id is not null then
    if new.parent_task_id = new.id then
      raise exception 'A Task cannot be its own parent.';
    end if;

    select * into parent from public.tasks where id = new.parent_task_id;
    if not found then
      raise exception 'Parent Task % not found.', new.parent_task_id;
    end if;

    if parent.parent_task_id is not null then
      raise exception 'Cannot nest a Subtask under another Subtask — one level of nesting only.';
    end if;

    if new.workstream_id is distinct from parent.workstream_id then
      raise exception 'A Subtask must belong to the same Service/Workstream as its parent Task.';
    end if;
    if new.activity_id is distinct from parent.activity_id then
      raise exception 'A Subtask must carry the same Activity as its parent Task.';
    end if;
  end if;

  select w.company_id into new.company_id from public.workstreams w where w.id = new.workstream_id;
  if new.company_id is null then
    raise exception 'Workstream % not found.', new.workstream_id;
  end if;

  if new.parent_task_id is not null and new.company_id is distinct from parent.company_id then
    raise exception 'A Subtask must belong to the same Company as its parent Task.';
  end if;

  -- Task Level Phase 1 — status_reason lifecycle: required exactly when Waiting/Blocked, force-
  -- cleared the moment status is anything else. Applies uniformly to every write path (create_task,
  -- create_subtask, update_task_status, toggle_checklist_item's own auto-transition, and the general
  -- updateTask path) since this trigger fires on every INSERT/UPDATE regardless of which RPC/table-
  -- write performs it — never duplicated per-RPC.
  if new.status in ('waiting', 'blocked') then
    if new.status_reason is null or btrim(new.status_reason) = '' then
      -- Legacy compatibility bypass (added 20260908120000) — see this migration's own header for the
      -- full root-cause writeup. Only a row that already had this exact gap, and is not having its
      -- status or reason changed, passes through; every other path above still raises.
      if TG_OP = 'UPDATE' and old.status = new.status and (old.status_reason is null or btrim(old.status_reason) = '') then
        null;
      else
        raise exception 'A reason is required while this Task is % — describe what it''s waiting on or blocked by.', new.status;
      end if;
    end if;
  else
    new.status_reason := null;
  end if;

  -- Task Level Phase 1 — an inactive Activity may never be NEWLY selected (create, or an edit that
  -- actually changes activity_id); an already-selected inactive Activity on an existing Task stays
  -- fully valid until the caller deliberately picks a different one (TG_OP = 'UPDATE' with an
  -- unchanged activity_id never re-checks is_active).
  if new.activity_id is not null and (TG_OP = 'INSERT' or new.activity_id is distinct from old.activity_id) then
    if not exists (select 1 from public.activities where id = new.activity_id and is_active) then
      raise exception 'That activity is inactive and cannot be newly selected for a Task.';
    end if;
  end if;

  if new.activity_id is null then
    return new;
  end if;
  select count(*) into enabled_count from public.workstream_activities wa where wa.workstream_id = new.workstream_id;
  if enabled_count = 0 then
    return new;
  end if;
  if not exists (
    select 1 from public.workstream_activities wa
    where wa.workstream_id = new.workstream_id and wa.activity_id = new.activity_id
  ) then
    raise exception 'That activity isn''t enabled for this workstream.';
  end if;
  return new;
end;
$$;
