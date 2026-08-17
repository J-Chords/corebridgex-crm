-- Phase 7E, part 1 — Accomplishments Reports. Maps to
-- src/lib/data/types/accomplishments-report.ts.
--
-- `subject_user_id`/`subject_company_id` mirror the Notes table's "exactly one of two typed FKs"
-- pattern, matching `kind` ('person' -> subject_user_id, 'client' -> subject_company_id) — a
-- polymorphic single FK would lose real referential integrity to either table.
--
-- `brand_sections` (the checklist tree) and `history` (the finalize/reopen audit log) are jsonb:
-- both are point-in-time snapshots the mock never re-derives from live Task/TimeEntry/Checklist/
-- Note data after generation (brand_sections is edited in place by the owner, history is
-- append-only) — exactly the "immutable report snapshot" case the phase instructions call out
-- for jsonb. Every name paired with an id in that snapshot (activityName/departmentName/
-- brandName/companyLabel/actorName) is captured at generation/finalize time, by design, so a
-- later catalog/profile rename never rewrites history.
--
-- Comments are a real table, not jsonb, because commenting has an entirely different RLS shape
-- (a non-owner supervisor/superadmin writes it) than the report row's own owner-only mutations —
-- folding it into the report row's jsonb would force choosing one UPDATE policy for two
-- incompatible actor sets.
--
-- All mutations beyond the initial generate-insert go through RPCs (never a blanket UPDATE
-- grant) because each one has a different owner/state precondition (draft-only edit vs.
-- finalized-only reopen vs. view-access-only trash) that a single RLS UPDATE policy can't
-- express without accidentally granting one action's precondition to another.

create table public.accomplishments_reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('person', 'client')),
  subject_user_id uuid null references public.profiles (id),
  subject_company_id uuid null references public.companies (id),
  subject_label text not null,
  range_label text not null check (range_label in ('today', 'this-week', 'custom')),
  range_start date not null,
  range_end date not null,
  status text not null check (status in ('draft', 'finalized')) default 'draft',
  brand_sections jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  generated_by uuid not null references public.profiles (id),
  generated_by_name text not null,
  generated_at timestamptz not null default now(),
  finalized_at timestamptz null,
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accomplishments_reports_subject_matches_kind check (
    (kind = 'person' and subject_user_id is not null and subject_company_id is null)
    or (kind = 'client' and subject_company_id is not null and subject_user_id is null)
  )
);

create index accomplishments_reports_subject_user_id_idx on public.accomplishments_reports (subject_user_id);
create index accomplishments_reports_subject_company_id_idx on public.accomplishments_reports (subject_company_id);
create index accomplishments_reports_generated_by_idx on public.accomplishments_reports (generated_by);

create table public.accomplishments_report_comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.accomplishments_reports (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index accomplishments_report_comments_report_id_idx on public.accomplishments_report_comments (report_id);

-- ---------------------------------------------------------------------------
-- can_view_accomplishments_report — mirrors canViewAccomplishmentsReport exactly: owner (person:
-- subject; client: generator) always; else not-employee AND manages_user(owner).
-- ---------------------------------------------------------------------------
create function public.can_view_accomplishments_report(target_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.accomplishments_reports r
    where r.id = target_report_id
      and (
        (r.kind = 'person' and r.subject_user_id = auth.uid())
        or (r.kind = 'client' and r.generated_by = auth.uid())
        or (
          not public.is_employee()
          and public.manages_user(case when r.kind = 'person' then r.subject_user_id else r.generated_by end)
        )
      )
  );
$$;

revoke execute on function public.can_view_accomplishments_report(uuid) from public, anon;
grant execute on function public.can_view_accomplishments_report(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS.
-- ---------------------------------------------------------------------------
alter table public.accomplishments_reports enable row level security;

create policy "accomplishments_reports_select" on public.accomplishments_reports
  for select using (public.can_view_accomplishments_report(id));

-- INSERT is the one plain-table mutation: generateReport always creates a brand-new row and
-- never merges into an existing one, so there's no competing precondition to isolate into an
-- RPC. Mirrors canGenerateAccomplishmentsReport: person reports are always self (subject forced
-- to auth.uid(), matching the mock's own server-side override of any client-supplied subjectId);
-- client reports require ordinary company access.
create policy "accomplishments_reports_insert" on public.accomplishments_reports
  for insert with check (
    generated_by = auth.uid()
    and (
      (kind = 'person' and subject_user_id = auth.uid())
      or (kind = 'client' and subject_company_id is not null and public.can_access_company(subject_company_id))
    )
  );

grant select, insert on public.accomplishments_reports to authenticated;
grant select, insert, update, delete on public.accomplishments_reports to service_role;

create policy "accomplishments_report_comments_select" on public.accomplishments_report_comments
  for select using (public.can_view_accomplishments_report(report_id));

grant select on public.accomplishments_report_comments to authenticated;
grant select, insert, update, delete on public.accomplishments_report_comments to service_role;

alter table public.accomplishments_report_comments enable row level security;

-- ---------------------------------------------------------------------------
-- RPCs — every state transition beyond the initial generate-insert.
-- ---------------------------------------------------------------------------
create function public.update_accomplishments_report_draft(target_report_id uuid, p_brand_sections jsonb)
returns public.accomplishments_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.accomplishments_reports;
  result public.accomplishments_reports;
begin
  select * into existing from public.accomplishments_reports where id = target_report_id;
  if not found then raise exception 'Report not found.'; end if;
  if existing.status <> 'draft' then
    raise exception 'This report is finalized and can no longer be edited.';
  end if;
  if not (
    (existing.kind = 'person' and existing.subject_user_id = auth.uid())
    or (existing.kind = 'client' and existing.generated_by = auth.uid())
  ) then
    raise exception 'Only the report''s owner can edit its entries.';
  end if;

  update public.accomplishments_reports
  set brand_sections = p_brand_sections, updated_at = now()
  where id = target_report_id
  returning * into result;
  return result;
end;
$$;

create function public.finalize_accomplishments_report(target_report_id uuid)
returns public.accomplishments_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.accomplishments_reports;
  result public.accomplishments_reports;
  event_type text;
begin
  select * into existing from public.accomplishments_reports where id = target_report_id;
  if not found then raise exception 'Report not found.'; end if;
  if existing.status = 'finalized' then return existing; end if;
  if not (
    (existing.kind = 'person' and existing.subject_user_id = auth.uid())
    or (existing.kind = 'client' and existing.generated_by = auth.uid())
  ) then
    raise exception 'Only the report''s owner can edit its entries.';
  end if;

  event_type := case when jsonb_path_exists(existing.history, '$[*] ? (@.type == "finalized" || @.type == "re-finalized")')
    then 're-finalized' else 'finalized' end;

  update public.accomplishments_reports
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

create function public.reopen_accomplishments_report(target_report_id uuid)
returns public.accomplishments_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.accomplishments_reports;
  result public.accomplishments_reports;
begin
  select * into existing from public.accomplishments_reports where id = target_report_id;
  if not found then raise exception 'Report not found.'; end if;
  if existing.status <> 'finalized' then
    raise exception 'Only a finalized report can be reopened.';
  end if;
  if not (
    (existing.kind = 'person' and existing.subject_user_id = auth.uid())
    or (existing.kind = 'client' and existing.generated_by = auth.uid())
  ) then
    raise exception 'Only the report''s owner can reopen it.';
  end if;

  update public.accomplishments_reports
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

-- add_accomplishments_report_comment — inserts the comment and writes the report-comment
-- notification atomically (never self-notify; recipient is the report's owner).
create function public.add_accomplishments_report_comment(target_report_id uuid, p_body text)
returns public.accomplishments_reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.accomplishments_reports;
  owner_id uuid;
  actor_name text;
  trimmed text;
  range_word text;
begin
  select * into existing from public.accomplishments_reports where id = target_report_id;
  if not found then raise exception 'Report not found.'; end if;
  if public.is_employee() then
    raise exception 'You don''t have permission to comment on this report.';
  end if;
  owner_id := case when existing.kind = 'person' then existing.subject_user_id else existing.generated_by end;
  if owner_id = auth.uid() then
    raise exception 'You don''t have permission to comment on this report.';
  end if;
  if not public.can_view_accomplishments_report(target_report_id) then
    raise exception 'You don''t have permission to comment on this report.';
  end if;
  trimmed := trim(p_body);
  if trimmed = '' then
    raise exception 'Comment can''t be empty.';
  end if;

  select full_name into actor_name from public.profiles where id = auth.uid();
  insert into public.accomplishments_report_comments (report_id, author_id, author_name, body)
  values (target_report_id, auth.uid(), actor_name, trimmed);

  range_word := case existing.range_label
    when 'today' then 'daily '
    when 'this-week' then 'weekly '
    else '' end;
  insert into public.notifications (recipient_id, type, message, related_report_id, read, created_at)
  values (owner_id, 'report-comment', format('%s commented on your %saccomplishments report', actor_name, range_word), target_report_id, false, now());

  return existing;
end;
$$;

create function public.trash_accomplishments_report(target_report_id uuid)
returns public.accomplishments_reports
language plpgsql
security definer
set search_path = ''
as $$
declare result public.accomplishments_reports;
begin
  if not public.can_view_accomplishments_report(target_report_id) then
    raise exception 'Report not found.';
  end if;
  update public.accomplishments_reports
  set deleted_at = coalesce(deleted_at, now())
  where id = target_report_id
  returning * into result;
  return result;
end;
$$;

create function public.restore_accomplishments_report(target_report_id uuid)
returns public.accomplishments_reports
language plpgsql
security definer
set search_path = ''
as $$
declare result public.accomplishments_reports;
begin
  if not public.can_view_accomplishments_report(target_report_id) then
    raise exception 'Report not found.';
  end if;
  update public.accomplishments_reports
  set deleted_at = null
  where id = target_report_id
  returning * into result;
  return result;
end;
$$;

create function public.permanently_delete_accomplishments_report(target_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare existing public.accomplishments_reports;
begin
  select * into existing from public.accomplishments_reports where id = target_report_id;
  if not found or not public.can_view_accomplishments_report(target_report_id) then
    raise exception 'Report not found.';
  end if;
  if existing.deleted_at is null then
    raise exception 'Move the report to Trash before permanently deleting it.';
  end if;
  delete from public.accomplishments_reports where id = target_report_id;
end;
$$;

revoke execute on function public.update_accomplishments_report_draft(uuid, jsonb) from public, anon;
revoke execute on function public.finalize_accomplishments_report(uuid) from public, anon;
revoke execute on function public.reopen_accomplishments_report(uuid) from public, anon;
revoke execute on function public.add_accomplishments_report_comment(uuid, text) from public, anon;
revoke execute on function public.trash_accomplishments_report(uuid) from public, anon;
revoke execute on function public.restore_accomplishments_report(uuid) from public, anon;
revoke execute on function public.permanently_delete_accomplishments_report(uuid) from public, anon;

grant execute on function public.update_accomplishments_report_draft(uuid, jsonb) to authenticated, service_role;
grant execute on function public.finalize_accomplishments_report(uuid) to authenticated, service_role;
grant execute on function public.reopen_accomplishments_report(uuid) to authenticated, service_role;
grant execute on function public.add_accomplishments_report_comment(uuid, text) to authenticated, service_role;
grant execute on function public.trash_accomplishments_report(uuid) to authenticated, service_role;
grant execute on function public.restore_accomplishments_report(uuid) to authenticated, service_role;
grant execute on function public.permanently_delete_accomplishments_report(uuid) to authenticated, service_role;
