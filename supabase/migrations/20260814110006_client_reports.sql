-- Phase 7E, part 2 — Client Reports. Maps to src/lib/data/types/client-report.ts.
--
-- Owner is always the generator (generatedBy) — no polymorphic subject like Accomplishments
-- Reports (Client Reports are always per-Company, never per-person). `departments` (the
-- department/activity/line-item tree) and `history` are jsonb snapshots for the same reason as
-- Accomplishments Reports: never re-derived from live Task/TimeEntry/DailyUpdate data after
-- generation, owner-editable, append-only history.
--
-- LOCKED BUSINESS RULE (name-free client-facing content): the mock never enforces this at the
-- data-shape level either — `generatedByName`/`comments.authorName`/`history.actorName` are
-- genuinely stored on the same row, and the real anonymization boundary is the client-facing
-- print/export/serialization layer (never selecting those columns) plus mandatory human review
-- before finalizing, exactly like the mock's own `findMentionedStaffNames` best-effort warning.
-- This migration keeps that same shape/division of responsibility — the provider layer must
-- never expose generated_by_name/comments/history through whatever code path eventually produces
-- a client-facing snapshot, but nothing here silently deletes or hides staff identity from the
-- authenticated internal app itself, matching current (mock) behavior exactly.
--
-- Comments are a real table for the same RLS-shape reason as Accomplishments Reports (a
-- non-owner supervisor/superadmin writes them, which conflicts with the report row's own
-- owner-only mutation policy if folded into one table/column).

create table public.client_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id),
  company_label text not null,
  brand_id uuid not null references public.brands (id),
  brand_label text not null,
  range_label text not null check (range_label in ('today', 'this-week', 'custom')),
  range_start date not null,
  range_end date not null,
  status text not null check (status in ('draft', 'finalized')) default 'draft',
  departments jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  generated_by uuid not null references public.profiles (id),
  generated_by_name text not null,
  generated_at timestamptz not null default now(),
  finalized_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index client_reports_company_id_idx on public.client_reports (company_id);
create index client_reports_generated_by_idx on public.client_reports (generated_by);

create table public.client_report_comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.client_reports (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index client_report_comments_report_id_idx on public.client_report_comments (report_id);

-- can_view_client_report — mirrors canViewClientReport exactly: never for an employee; owner
-- (generator) always; else not-employee AND manages_user(generator).
create function public.can_view_client_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.client_reports r
    where r.id = target_report_id
      and (
        r.generated_by = auth.uid()
        or (not public.is_employee() and public.manages_user(r.generated_by))
      )
  );
$$;

revoke execute on function public.can_view_client_report(uuid) from public, anon;
grant execute on function public.can_view_client_report(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS.
-- ---------------------------------------------------------------------------
alter table public.client_reports enable row level security;

create policy "client_reports_select" on public.client_reports
  for select using (public.can_view_client_report(id));

-- Mirrors canGenerateClientReport: supervisor/superadmin only, and ordinary company access.
create policy "client_reports_insert" on public.client_reports
  for insert with check (
    generated_by = auth.uid()
    and (public.is_supervisor() or public.is_superadmin())
    and public.can_access_company(company_id)
  );

grant select, insert on public.client_reports to authenticated;
grant select, insert, update, delete on public.client_reports to service_role;

alter table public.client_report_comments enable row level security;

create policy "client_report_comments_select" on public.client_report_comments
  for select using (public.can_view_client_report(report_id));

grant select on public.client_report_comments to authenticated;
grant select, insert, update, delete on public.client_report_comments to service_role;

-- ---------------------------------------------------------------------------
-- RPCs — every state transition beyond the initial generate-insert. Same rationale as
-- Accomplishments Reports: differing owner/state preconditions per action rule out one blanket
-- UPDATE policy.
-- ---------------------------------------------------------------------------
create function public.update_client_report_draft(target_report_id uuid, p_departments jsonb)
returns public.client_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.client_reports;
  result public.client_reports;
begin
  select * into existing from public.client_reports where id = target_report_id;
  if not found then raise exception 'Report not found.'; end if;
  if existing.status <> 'draft' then
    raise exception 'This report is finalized and can no longer be edited.';
  end if;
  if existing.generated_by <> auth.uid() then
    raise exception 'Only the report''s owner can edit its entries.';
  end if;

  update public.client_reports
  set departments = p_departments, updated_at = now()
  where id = target_report_id
  returning * into result;
  return result;
end;
$$;

create function public.finalize_client_report(target_report_id uuid)
returns public.client_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.client_reports;
  result public.client_reports;
  event_type text;
begin
  select * into existing from public.client_reports where id = target_report_id;
  if not found then raise exception 'Report not found.'; end if;
  if existing.status = 'finalized' then return existing; end if;
  if existing.generated_by <> auth.uid() then
    raise exception 'Only the report''s owner can edit its entries.';
  end if;

  event_type := case when jsonb_path_exists(existing.history, '$[*] ? (@.type == "finalized" || @.type == "re-finalized")')
    then 're-finalized' else 'finalized' end;

  update public.client_reports
  set status = 'finalized', finalized_at = now(), updated_at = now(),
      history = existing.history || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(), 'type', event_type, 'actorId', auth.uid(),
        'actorName', (select full_name from public.profiles where id = auth.uid()), 'createdAt', now()
      ))
  where id = target_report_id
  returning * into result;
  return result;
end;
$$;

create function public.reopen_client_report(target_report_id uuid)
returns public.client_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.client_reports;
  result public.client_reports;
begin
  select * into existing from public.client_reports where id = target_report_id;
  if not found then raise exception 'Report not found.'; end if;
  if existing.status <> 'finalized' then
    raise exception 'Only a finalized report can be reopened.';
  end if;
  if existing.generated_by <> auth.uid() then
    raise exception 'Only the report''s owner can reopen it.';
  end if;

  update public.client_reports
  set status = 'draft', finalized_at = null, updated_at = now(),
      history = existing.history || jsonb_build_array(jsonb_build_object(
        'id', gen_random_uuid(), 'type', 'reopened', 'actorId', auth.uid(),
        'actorName', (select full_name from public.profiles where id = auth.uid()), 'createdAt', now()
      ))
  where id = target_report_id
  returning * into result;
  return result;
end;
$$;

-- add_client_report_comment — inserts the comment and writes the client-report-comment
-- notification atomically. Never self-notify (the owner can never comment on their own report —
-- enforced below, matching canCommentOnClientReport).
create function public.add_client_report_comment(target_report_id uuid, p_body text)
returns public.client_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.client_reports;
  actor_name text;
  trimmed text;
begin
  select * into existing from public.client_reports where id = target_report_id;
  if not found then raise exception 'Report not found.'; end if;
  if public.is_employee() or existing.generated_by = auth.uid() then
    raise exception 'You don''t have permission to comment on this report.';
  end if;
  if not public.can_view_client_report(target_report_id) then
    raise exception 'You don''t have permission to comment on this report.';
  end if;
  trimmed := trim(p_body);
  if trimmed = '' then
    raise exception 'Comment can''t be empty.';
  end if;

  select full_name into actor_name from public.profiles where id = auth.uid();
  insert into public.client_report_comments (report_id, author_id, author_name, body)
  values (target_report_id, auth.uid(), actor_name, trimmed);

  insert into public.notifications (recipient_id, type, message, related_client_report_id, read, created_at)
  values (existing.generated_by, 'client-report-comment', format('%s commented on the %s client report', actor_name, existing.company_label), target_report_id, false, now());

  return existing;
end;
$$;

create function public.trash_client_report(target_report_id uuid)
returns public.client_reports
language plpgsql
security definer
set search_path = ''
as $$
declare result public.client_reports;
begin
  if not public.can_view_client_report(target_report_id) then
    raise exception 'Report not found.';
  end if;
  update public.client_reports
  set deleted_at = coalesce(deleted_at, now())
  where id = target_report_id
  returning * into result;
  return result;
end;
$$;

create function public.restore_client_report(target_report_id uuid)
returns public.client_reports
language plpgsql
security definer
set search_path = ''
as $$
declare result public.client_reports;
begin
  if not public.can_view_client_report(target_report_id) then
    raise exception 'Report not found.';
  end if;
  update public.client_reports
  set deleted_at = null
  where id = target_report_id
  returning * into result;
  return result;
end;
$$;

create function public.permanently_delete_client_report(target_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare existing public.client_reports;
begin
  select * into existing from public.client_reports where id = target_report_id;
  if not found or not public.can_view_client_report(target_report_id) then
    raise exception 'Report not found.';
  end if;
  if existing.deleted_at is null then
    raise exception 'Move the report to Trash before permanently deleting it.';
  end if;
  delete from public.client_reports where id = target_report_id;
end;
$$;

revoke execute on function public.update_client_report_draft(uuid, jsonb) from public, anon;
revoke execute on function public.finalize_client_report(uuid) from public, anon;
revoke execute on function public.reopen_client_report(uuid) from public, anon;
revoke execute on function public.add_client_report_comment(uuid, text) from public, anon;
revoke execute on function public.trash_client_report(uuid) from public, anon;
revoke execute on function public.restore_client_report(uuid) from public, anon;
revoke execute on function public.permanently_delete_client_report(uuid) from public, anon;

grant execute on function public.update_client_report_draft(uuid, jsonb) to authenticated, service_role;
grant execute on function public.finalize_client_report(uuid) to authenticated, service_role;
grant execute on function public.reopen_client_report(uuid) to authenticated, service_role;
grant execute on function public.add_client_report_comment(uuid, text) to authenticated, service_role;
grant execute on function public.trash_client_report(uuid) to authenticated, service_role;
grant execute on function public.restore_client_report(uuid) to authenticated, service_role;
grant execute on function public.permanently_delete_client_report(uuid) to authenticated, service_role;
