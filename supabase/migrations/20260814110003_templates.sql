-- Phase 7D, part 4 — Templates. Maps to src/lib/data/types/template.ts's `Template`/`TemplateTask`/
-- `TemplateChecklistItem`.
--
-- Reference library, not role-scoped — mock-templates-provider.ts has no permission check at all
-- (listTemplates/getTemplate take `viewer` only for interface consistency); "who can apply a
-- template" is gated purely on the consumer side (canManageWorkstreams). There is no in-app
-- template editor today ("Seed-only" per the type's own doc comment), so — matching the
-- departments/activities precedent — SELECT is ungated for every authenticated user and there is
-- no INSERT/UPDATE/DELETE grant.
--
-- No active/inactive/archived state exists on the current type — none is added here.
--
-- Field-naming note (confirmed during the Phase 7A-C hotfix): `tasks.template_id` semantically
-- holds a TemplateTask id, not a Template id (`ApplyTemplateDialog` passes `templateTask.id`, not
-- `template.id`). The column name is left unchanged (added back in the Phase 7A-C tasks
-- migration as a bare uuid, no FK yet) to avoid touching an already-applied migration — this
-- migration adds the real FK pointed at the correct table, template_tasks, not templates.

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  service_line_id uuid null references public.service_lines (id),
  recurrence_frequency text null check (recurrence_frequency in ('weekly', 'monthly', 'quarterly', 'yearly', 'custom')),
  recurrence_custom_interval_days int null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.template_tasks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates (id) on delete cascade,
  title text not null,
  description text not null default '',
  default_owner_role text null check (default_owner_role in ('superadmin', 'supervisor', 'employee')),
  due_days_after_start int null,
  expected_minutes int null,
  position int not null default 0
);

create index template_tasks_template_id_idx on public.template_tasks (template_id);

create table public.template_checklist_items (
  id uuid primary key default gen_random_uuid(),
  template_task_id uuid not null references public.template_tasks (id) on delete cascade,
  description text not null,
  position int not null default 0
);

create index template_checklist_items_template_task_id_idx on public.template_checklist_items (template_task_id);

-- Real FK for the already-existing tasks.template_id column, now that template_tasks exists.
-- ON DELETE SET NULL — deleting a template task must never cascade-delete historical real Tasks
-- created from it.
alter table public.tasks
  add constraint tasks_template_id_fkey
  foreign key (template_id) references public.template_tasks (id) on delete set null;

-- ---------------------------------------------------------------------------
-- RLS — ungated reference-data SELECT (matches departments/activities); no other grants.
-- ---------------------------------------------------------------------------
alter table public.templates enable row level security;
alter table public.template_tasks enable row level security;
alter table public.template_checklist_items enable row level security;

create policy "templates_select_all" on public.templates for select using (true);
create policy "template_tasks_select_all" on public.template_tasks for select using (true);
create policy "template_checklist_items_select_all" on public.template_checklist_items for select using (true);

grant select on public.templates to authenticated;
grant select on public.template_tasks to authenticated;
grant select on public.template_checklist_items to authenticated;
grant select, insert, update, delete on public.templates to service_role;
grant select, insert, update, delete on public.template_tasks to service_role;
grant select, insert, update, delete on public.template_checklist_items to service_role;

-- ---------------------------------------------------------------------------
-- apply_template — a single atomic RPC replacing the client's current "1 createWorkstream + N
-- sequential createTask calls, no rollback" sequence (a real correctness gap once any call in
-- that sequence can fail mid-loop against a real database). One transaction: the workstream, its
-- team, every template task, and every task's checklist items either all commit or none do.
-- Mirrors the exact current ApplyTemplateDialog payload shape. activity_ids is intentionally
-- never populated — Templates have no Activity concept (Phase 5 rule preserved: a
-- template-created workstream starts with zero configured Activities, never a fallback to the
-- full Service catalog).
-- ---------------------------------------------------------------------------
create function public.apply_template(
  target_template_id uuid,
  p_company_id uuid,
  p_name text,
  p_lead_user_id uuid,
  p_team_user_ids uuid[],
  p_start_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workstream_id uuid;
  tmpl record;
  company_brand_id uuid;
  tt record;
  new_task_id uuid;
  ci record;
begin
  if not (public.is_supervisor() or public.is_superadmin()) then
    raise exception 'Only a supervisor or superadmin can apply a template.';
  end if;

  select * into tmpl from public.templates where id = target_template_id;
  if not found then
    raise exception 'Template % not found.', target_template_id;
  end if;

  select brand_id into company_brand_id from public.companies where id = p_company_id;
  if not found then
    raise exception 'Company % not found.', p_company_id;
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

  for tt in select * from public.template_tasks where template_id = target_template_id order by position loop
    insert into public.tasks (
      title, description, workstream_id, status, priority, due_date, expected_minutes, created_by, self_added, template_id
    )
    values (
      tt.title, tt.description, new_workstream_id, 'todo', 'medium',
      case when tt.due_days_after_start is not null then p_start_date + tt.due_days_after_start else null end,
      tt.expected_minutes, auth.uid(), false, tt.id
    )
    returning id into new_task_id;

    for ci in select * from public.template_checklist_items where template_task_id = tt.id order by position loop
      insert into public.checklist_items (task_id, description, position) values (new_task_id, ci.description, ci.position);
    end loop;
  end loop;

  return new_workstream_id;
end;
$$;

revoke execute on function public.apply_template(uuid, uuid, text, uuid, uuid[], date) from public, anon;
grant execute on function public.apply_template(uuid, uuid, text, uuid, uuid[], date) to authenticated, service_role;
