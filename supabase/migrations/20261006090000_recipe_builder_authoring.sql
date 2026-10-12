-- CD-218 — Reusable Template authoring: the first-ever authoring path for System-B's reusable
-- Task/Checklist bundle (`templates`/`template_tasks`/`template_checklist_items`). Until now these
-- three tables were genuinely "seed-only" (see `src/lib/data/types/template.ts`'s own doc comment)
-- — hosted grants prove it: `authenticated` has SELECT only, INSERT/UPDATE/DELETE exist only for
-- `service_role`. This migration adds exactly three narrow, Admin-only SECURITY DEFINER RPCs and
-- one lifecycle column; it does not touch System A (confirmed absent, not revived), does not
-- rename any table/column, and does not create a parallel schema — System B stays authoritative,
-- exactly as CD-217 locked it.
--
-- USER-FACING TERM: "Reusable Template" (authored from inside a parent Template's own detail page,
-- `/dashboard/admin/templates/[id]` — never a separate top-level surface; the parent's
-- `service_line_id` is always supplied by that page's own context, never chosen in the builder).
-- INTERNAL IDENTIFIERS STAY "template*" throughout this file, deliberately — only the
-- product-facing word changed.

-- ---------------------------------------------------------------------------------------------
-- 1. Lifecycle column — the smallest schema addition for V1 (Active/Inactive only, no new enum).
--    DEFAULT true backfills every existing row as active with no destructive/fabricated history.
-- ---------------------------------------------------------------------------------------------
alter table public.templates
  add column is_active boolean not null default true;

-- ---------------------------------------------------------------------------------------------
-- 2. admin_create_template_bundle — one atomic "author a new Reusable Template" RPC. A single plpgsql
--    function body is one transaction: any raised exception (bad name, bad Service, bad
--    recurrence, a blank Task title, a negative offset/estimate, a blank Checklist item) aborts
--    the whole call and leaves zero rows behind — the same atomicity guarantee this project's own
--    `apply_template`/`create_client_project` already rely on, not a new mechanism.
--
--    p_tasks shape (jsonb array, order is canonical — positions are always normalized 0..N-1 from
--    array order, never trusted from a client-supplied position field):
--      [{ "title": text, "description": text|null, "defaultOwnerRole": "superadmin"|"supervisor"|
--         "employee"|null, "dueDaysAfterStart": int|null, "expectedMinutes": int|null,
--         "checklistItems": [{ "description": text }, ...] }, ...]
--    (An "id" key is accepted and ignored here — the identical payload shape is shared with
--    admin_update_template_bundle below, where "id" reconciles retained rows; passing one to
--    create is simply meaningless, not an error, since there is nothing yet to retain.)
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_create_template_bundle(
  p_name text,
  p_description text,
  p_service_line_id uuid,
  p_recurrence_frequency text,
  p_recurrence_custom_interval_days int,
  p_tasks jsonb
)
returns public.templates
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_name text;
  v_description text;
  v_recurrence_frequency text;
  v_recurrence_custom_interval_days int;
  v_template public.templates;
  v_task jsonb;
  v_task_idx int;
  v_task_title text;
  v_task_description text;
  v_due_days int;
  v_expected_minutes int;
  v_owner_role text;
  v_new_task_id uuid;
  v_checklist jsonb;
  v_ci_idx int;
  v_ci_description text;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can create a Reusable Template.';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'Reusable Template name is required.';
  end if;
  v_description := nullif(btrim(coalesce(p_description, '')), '');

  if not exists (select 1 from public.service_lines where id = p_service_line_id and is_active) then
    raise exception 'A valid, active Service is required for a Reusable Template.';
  end if;

  if p_recurrence_frequency is not null
     and p_recurrence_frequency not in ('weekly', 'monthly', 'quarterly', 'yearly', 'custom') then
    raise exception 'Invalid recurrence frequency.';
  end if;
  v_recurrence_frequency := p_recurrence_frequency;
  if v_recurrence_frequency = 'custom' then
    if p_recurrence_custom_interval_days is null or p_recurrence_custom_interval_days <= 0 then
      raise exception 'Custom recurrence requires a positive interval in days.';
    end if;
    v_recurrence_custom_interval_days := p_recurrence_custom_interval_days;
  else
    -- Non-custom (or no) recurrence never persists a meaningless custom interval, regardless of
    -- what the payload happened to carry.
    v_recurrence_custom_interval_days := null;
  end if;

  insert into public.templates (
    name, description, service_line_id, recurrence_frequency, recurrence_custom_interval_days,
    created_by, is_active
  )
  values (
    v_name, v_description, p_service_line_id, v_recurrence_frequency, v_recurrence_custom_interval_days,
    auth.uid(), true
  )
  returning * into v_template;

  for v_task, v_task_idx in
    select value, (ordinality - 1)::int from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) with ordinality
  loop
    v_task_title := btrim(coalesce(v_task ->> 'title', ''));
    if v_task_title = '' then
      raise exception 'Every Task requires a title.';
    end if;
    v_task_description := coalesce(v_task ->> 'description', '');

    v_due_days := nullif(v_task ->> 'dueDaysAfterStart', '')::int;
    if v_due_days is not null and v_due_days < 0 then
      raise exception 'Due offset must be zero or a positive number of days.';
    end if;

    v_expected_minutes := nullif(v_task ->> 'expectedMinutes', '')::int;
    if v_expected_minutes is not null and v_expected_minutes < 0 then
      raise exception 'Estimated time must be zero or a positive number of minutes.';
    end if;

    v_owner_role := nullif(v_task ->> 'defaultOwnerRole', '');
    if v_owner_role is not null and v_owner_role not in ('superadmin', 'supervisor', 'employee') then
      raise exception 'Invalid suggested owner role.';
    end if;

    insert into public.template_tasks (
      template_id, title, description, default_owner_role, due_days_after_start, expected_minutes, position
    )
    values (
      v_template.id, v_task_title, v_task_description, v_owner_role, v_due_days, v_expected_minutes, v_task_idx
    )
    returning id into v_new_task_id;

    for v_checklist, v_ci_idx in
      select value, (ordinality - 1)::int
      from jsonb_array_elements(coalesce(v_task -> 'checklistItems', '[]'::jsonb)) with ordinality
    loop
      v_ci_description := btrim(coalesce(v_checklist ->> 'description', ''));
      if v_ci_description = '' then
        raise exception 'A Checklist item cannot be blank.';
      end if;
      insert into public.template_checklist_items (template_task_id, description, position)
      values (v_new_task_id, v_ci_description, v_ci_idx);
    end loop;
  end loop;

  return v_template;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- 3. admin_update_template_bundle — reconciles rather than recreates. tasks.template_id is a real
--    historical lineage pointer (ON DELETE SET NULL, unchanged by this migration) — blindly
--    deleting and re-inserting every Template Task on every edit would needlessly null out that
--    lineage for every already-materialized real Task tied to an unmodified Task. Instead:
--    a payload Task/Checklist item carrying an "id" that genuinely belongs to this Reusable
--    Template is UPDATEd in place (id preserved); one with no "id" (or null) is INSERTed fresh; any
--    existing row whose id is absent from the final payload is DELETEd. Every supplied id is
--    verified to belong to the correct parent (this Reusable Template / this kept Task) before
--    being trusted — a caller can never reach into another Reusable Template's Task by id.
--    Positions are always renormalized from
--    array order. One function body, one transaction: any validation failure rolls back the
--    entire edit, same guarantee as the create bundle above.
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_update_template_bundle(
  p_template_id uuid,
  p_name text,
  p_description text,
  p_service_line_id uuid,
  p_recurrence_frequency text,
  p_recurrence_custom_interval_days int,
  p_tasks jsonb
)
returns public.templates
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_name text;
  v_description text;
  v_recurrence_frequency text;
  v_recurrence_custom_interval_days int;
  v_template public.templates;
  v_task jsonb;
  v_task_idx int;
  v_task_id uuid;
  v_task_row_id uuid;
  v_task_title text;
  v_task_description text;
  v_due_days int;
  v_expected_minutes int;
  v_owner_role text;
  v_kept_task_ids uuid[] := '{}';
  v_kept_ci_ids uuid[] := '{}';
  v_checklist jsonb;
  v_ci_idx int;
  v_ci_id uuid;
  v_ci_description text;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can edit a Reusable Template.';
  end if;

  select * into v_template from public.templates where id = p_template_id;
  if not found then
    raise exception 'Reusable Template % not found.', p_template_id;
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'Reusable Template name is required.';
  end if;
  v_description := nullif(btrim(coalesce(p_description, '')), '');

  if not exists (select 1 from public.service_lines where id = p_service_line_id and is_active) then
    raise exception 'A valid, active Service is required for a Reusable Template.';
  end if;

  if p_recurrence_frequency is not null
     and p_recurrence_frequency not in ('weekly', 'monthly', 'quarterly', 'yearly', 'custom') then
    raise exception 'Invalid recurrence frequency.';
  end if;
  v_recurrence_frequency := p_recurrence_frequency;
  if v_recurrence_frequency = 'custom' then
    if p_recurrence_custom_interval_days is null or p_recurrence_custom_interval_days <= 0 then
      raise exception 'Custom recurrence requires a positive interval in days.';
    end if;
    v_recurrence_custom_interval_days := p_recurrence_custom_interval_days;
  else
    v_recurrence_custom_interval_days := null;
  end if;

  update public.templates
  set name = v_name,
      description = v_description,
      service_line_id = p_service_line_id,
      recurrence_frequency = v_recurrence_frequency,
      recurrence_custom_interval_days = v_recurrence_custom_interval_days,
      updated_at = now()
  where id = p_template_id
  returning * into v_template;

  for v_task, v_task_idx in
    select value, (ordinality - 1)::int from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) with ordinality
  loop
    v_task_title := btrim(coalesce(v_task ->> 'title', ''));
    if v_task_title = '' then
      raise exception 'Every Task requires a title.';
    end if;
    v_task_description := coalesce(v_task ->> 'description', '');

    v_due_days := nullif(v_task ->> 'dueDaysAfterStart', '')::int;
    if v_due_days is not null and v_due_days < 0 then
      raise exception 'Due offset must be zero or a positive number of days.';
    end if;

    v_expected_minutes := nullif(v_task ->> 'expectedMinutes', '')::int;
    if v_expected_minutes is not null and v_expected_minutes < 0 then
      raise exception 'Estimated time must be zero or a positive number of minutes.';
    end if;

    v_owner_role := nullif(v_task ->> 'defaultOwnerRole', '');
    if v_owner_role is not null and v_owner_role not in ('superadmin', 'supervisor', 'employee') then
      raise exception 'Invalid suggested owner role.';
    end if;

    v_task_id := nullif(v_task ->> 'id', '')::uuid;

    if v_task_id is not null then
      if not exists (select 1 from public.template_tasks where id = v_task_id and template_id = p_template_id) then
        raise exception 'Task % does not belong to this Reusable Template.', v_task_id;
      end if;
      update public.template_tasks
      set title = v_task_title,
          description = v_task_description,
          default_owner_role = v_owner_role,
          due_days_after_start = v_due_days,
          expected_minutes = v_expected_minutes,
          position = v_task_idx
      where id = v_task_id;
      v_task_row_id := v_task_id;
    else
      insert into public.template_tasks (
        template_id, title, description, default_owner_role, due_days_after_start, expected_minutes, position
      )
      values (
        p_template_id, v_task_title, v_task_description, v_owner_role, v_due_days, v_expected_minutes, v_task_idx
      )
      returning id into v_task_row_id;
    end if;

    v_kept_task_ids := array_append(v_kept_task_ids, v_task_row_id);

    for v_checklist, v_ci_idx in
      select value, (ordinality - 1)::int
      from jsonb_array_elements(coalesce(v_task -> 'checklistItems', '[]'::jsonb)) with ordinality
    loop
      v_ci_description := btrim(coalesce(v_checklist ->> 'description', ''));
      if v_ci_description = '' then
        raise exception 'A Checklist item cannot be blank.';
      end if;
      v_ci_id := nullif(v_checklist ->> 'id', '')::uuid;

      if v_ci_id is not null then
        if not exists (
          select 1 from public.template_checklist_items where id = v_ci_id and template_task_id = v_task_row_id
        ) then
          raise exception 'Checklist item % does not belong to this Task.', v_ci_id;
        end if;
        update public.template_checklist_items
        set description = v_ci_description, position = v_ci_idx
        where id = v_ci_id;
      else
        insert into public.template_checklist_items (template_task_id, description, position)
        values (v_task_row_id, v_ci_description, v_ci_idx)
        returning id into v_ci_id;
      end if;

      v_kept_ci_ids := array_append(v_kept_ci_ids, v_ci_id);
    end loop;
  end loop;

  -- A Task dropped from the payload is deleted outright — its own Checklist Items cascade with it
  -- (on delete cascade, unchanged). A real historical Task that was materialized from it is never
  -- touched; its own tasks.template_id simply becomes null (on delete set null, unchanged) — exactly
  -- the existing, already-proven-safe FK behavior, not something this migration changes.
  delete from public.template_tasks
  where template_id = p_template_id
    and id <> all (v_kept_task_ids);

  -- A Checklist item dropped from a RETAINED Task (items under a just-deleted Task are already
  -- gone via the cascade above, so this only needs to catch items removed from a kept Task).
  delete from public.template_checklist_items
  where template_task_id = any (v_kept_task_ids)
    and id <> all (v_kept_ci_ids);

  return v_template;
end;
$function$;

-- ---------------------------------------------------------------------------------------------
-- 4. admin_set_template_active — Deactivate/Reactivate. No hard-delete RPC exists in V1 (locked
--    product decision) — deactivating stops a Reusable Template being offered for new application while
--    preserving it, its Tasks/Checklist Items, and every already-materialized real Task's lineage,
--    exactly like the existing Service Line catalog's own Active/Inactive pattern this mirrors.
-- ---------------------------------------------------------------------------------------------
create or replace function public.admin_set_template_active(p_id uuid, p_is_active boolean)
returns public.templates
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.templates;
begin
  if not public.is_superadmin() then
    raise exception 'Only an admin can activate or deactivate a Reusable Template.';
  end if;

  update public.templates
  set is_active = p_is_active, updated_at = now()
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Reusable Template not found.';
  end if;

  return v_row;
end;
$function$;

revoke all on function public.admin_create_template_bundle(text, text, uuid, text, int, jsonb) from public, anon;
revoke all on function public.admin_update_template_bundle(uuid, text, text, uuid, text, int, jsonb) from public, anon;
revoke all on function public.admin_set_template_active(uuid, boolean) from public, anon;
grant execute on function public.admin_create_template_bundle(text, text, uuid, text, int, jsonb) to authenticated, service_role;
grant execute on function public.admin_update_template_bundle(uuid, text, text, uuid, text, int, jsonb) to authenticated, service_role;
grant execute on function public.admin_set_template_active(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 5. Inactive-Reusable-Template application guard — the two live System-B application RPCs each
--    gain exactly one check (a Reusable Template must be active to be newly applied/merged), inserted alongside their
--    existing Template-validity checks. Every other line of both functions — authorization, merge
--    semantics, create semantics, Task materialization, recurrence handling, return shape,
--    SECURITY DEFINER/search_path hardening, grants — is preserved byte-for-byte, re-verified
--    against the live hosted bodies immediately before writing this file. Does not reopen or
--    otherwise touch CD-217's own correction (the materialize_template_tasks status fix and the
--    apply_service_template_to_project merge-path authorization guard it added).
-- ---------------------------------------------------------------------------------------------
create or replace function public.apply_template(target_template_id uuid, p_company_id uuid, p_name text, p_lead_user_id uuid, p_team_user_ids uuid[], p_start_date date)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  new_workstream_id uuid;
  tmpl record;
  company_brand_id uuid;
begin
  if not (public.is_supervisor() or public.is_superadmin()) then
    raise exception 'Only a supervisor or superadmin can apply a template.';
  end if;

  select * into tmpl from public.templates where id = target_template_id;
  if not found then
    raise exception 'Template % not found.', target_template_id;
  end if;
  if not tmpl.is_active then
    raise exception 'This Reusable Template is inactive and can no longer be applied to new work.';
  end if;

  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Company % not found.', p_company_id;
  end if;
  select brand_id into company_brand_id from public.companies where id = p_company_id;
  if company_brand_id is null then
    raise exception 'This client has no Brand set yet — add a Brand to this client before applying a Template.';
  end if;

  insert into public.workstreams (
    name, description, company_id, service_line_id, brand_id, lead_user_id, status,
    start_date, recurrence_frequency, recurrence_anchor_date, recurrence_custom_interval_days, created_by
  )
  values (
    p_name, tmpl.description, p_company_id, tmpl.service_line_id, company_brand_id, p_lead_user_id, 'active',
    p_start_date,
    tmpl.recurrence_frequency,
    case when tmpl.recurrence_frequency is not null then p_start_date else null end,
    tmpl.recurrence_custom_interval_days,
    auth.uid()
  )
  returning id into new_workstream_id;

  insert into public.workstream_members (workstream_id, user_id)
  select new_workstream_id, u from unnest(p_team_user_ids) as u;

  perform public.materialize_template_tasks(target_template_id, new_workstream_id, p_start_date);

  return new_workstream_id;
end;
$function$;

create or replace function public.apply_service_template_to_project(
  p_template_id uuid,
  p_project_id uuid,
  p_lead_user_id uuid,
  p_team_user_ids uuid[],
  p_start_date date,
  p_activity_ids uuid[]
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  tmpl record;
  existing_workstream_id uuid;
  new_ws public.workstreams;
  merged_count int;
begin
  select * into tmpl from public.templates where id = p_template_id;
  if not found then
    raise exception 'Service Template % not found.', p_template_id;
  end if;
  if tmpl.service_line_id is null then
    raise exception 'This Service Template has no Service Line configured and cannot be applied to a Project.';
  end if;
  if not tmpl.is_active then
    raise exception 'This Reusable Template is inactive and can no longer be applied to new work.';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Project % not found.', p_project_id;
  end if;

  if not public.can_manage_project(p_project_id) then
    raise exception 'You don''t have permission to add a Service to that project.';
  end if;

  select id into existing_workstream_id
  from public.workstreams
  where project_id = p_project_id and service_line_id = tmpl.service_line_id
  limit 1;

  if existing_workstream_id is not null then
    -- Already present — never a duplicate Workstream/Tasks/checklists. Merge only the missing
    -- selected Activities; everything else about the existing Service (assignments, dates, Tasks,
    -- time, Comments, Documents) is left exactly as it is.
    insert into public.workstream_activities (workstream_id, activity_id)
    select existing_workstream_id, aid from unnest(coalesce(p_activity_ids, '{}')) as aid
    on conflict do nothing;
    get diagnostics merged_count = row_count;
    return jsonb_build_object(
      'status', 'merged',
      'workstreamId', existing_workstream_id,
      'serviceLineId', tmpl.service_line_id,
      'activitiesMerged', merged_count
    );
  end if;

  new_ws := public.create_workstream(
    tmpl.name, tmpl.description, null, p_project_id, tmpl.service_line_id, p_lead_user_id,
    coalesce(p_team_user_ids, '{}'), coalesce(p_activity_ids, '{}'), 'active', p_start_date, null,
    tmpl.recurrence_frequency,
    case when tmpl.recurrence_frequency is not null then p_start_date else null end,
    tmpl.recurrence_custom_interval_days,
    null
  );

  perform public.materialize_template_tasks(p_template_id, new_ws.id, p_start_date);

  return jsonb_build_object('status', 'created', 'workstreamId', new_ws.id, 'serviceLineId', tmpl.service_line_id);
end;
$function$;

revoke all on function public.apply_template(uuid, uuid, text, uuid, uuid[], date) from public, anon;
revoke all on function public.apply_service_template_to_project(uuid, uuid, uuid, uuid[], date, uuid[]) from public, anon;
grant execute on function public.apply_template(uuid, uuid, text, uuid, uuid[], date) to authenticated, service_role;
grant execute on function public.apply_service_template_to_project(uuid, uuid, uuid, uuid[], date, uuid[]) to authenticated, service_role;
