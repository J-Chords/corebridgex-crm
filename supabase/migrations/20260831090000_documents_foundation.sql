-- Phase 14B — Storage + Metadata Security Foundation. Implements the architecture locked in
-- docs/phase-14a-documents-architecture-audit.md (Stage 1 corrections applied before this file was
-- written). One `documents` table for both Project Documents and Task Attachments (a Task
-- Attachment is a Document with `task_id` set — never a second table/model).
--
-- CORRECTION 1 (re-audited before writing this file, not assumed): a Project-level Document's
-- authorization gate is `public.can_access_project` (already defined once, in
-- 20260815090000_projects.sql, never redefined since — the exact function `projects_select`/
-- `project_members_select` RLS already use as the real "may this viewer open Project P" gate),
-- NEVER `public.can_access_company`. `can_access_company` is strictly broader — true for anyone
-- with ANY relationship to ANY Project under that Company — and reusing it here would leak
-- visibility across sibling Projects within the same Company. No new Project-visibility helper was
-- needed; the existing one already matches current Project workspace visibility exactly.
--
-- CORRECTION 2/3 (Task/Project consistency, no "change context") — `project_id`/`task_id` are both
-- immutable after creation. When a Document is created via a Task, `project_id` is DERIVED from
-- that Task's own Workstream server-side (`reserve_document_upload`, below) — never trusted as an
-- independent caller input alongside `task_id` — and a trigger (`enforce_document_invariants`,
-- below) re-validates this on every insert/update as defense-in-depth, and rejects any attempt to
-- change `project_id`/`task_id`/`storage_path`/`uploaded_by`/`original_filename`/`mime_type`/
-- `size_bytes` after creation. No "change context" action/RPC exists — a wrong-context file is
-- deleted and re-uploaded instead.
--
-- CORRECTION 4 (soft delete only, no atomic DB+Storage delete) — `deleted_at` is a plain nullable
-- timestamp. Nothing in this migration ever deletes a Storage object as part of a metadata mutation;
-- Postgres and the Storage API are two separate systems with no shared transaction. No purge job
-- exists here — permanent purge is deferred to a later, narrowly-designed Superadmin-only workflow.
--
-- CORRECTION 9 (document states) — `upload_state` (`pending`/`ready`) is a real column. Every normal
-- read path (`can_access_document`, the Storage SELECT policy, both list queries) requires
-- `upload_state = 'ready' and deleted_at is null`. A separate, explicitly narrower policy
-- (`documents_select_trash`) exists so an authorized manager can still see Trash rows, and another
-- (`documents_select_own_pending`) lets a caller see their own still-pending reservations (for
-- retry/cleanup) — neither broadens normal visibility.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  task_id uuid null references public.tasks (id),
  uploaded_by uuid not null references public.profiles (id),
  original_filename text not null,
  display_name text null,
  -- Server-generated only (reserve_document_upload) — never accepted from a client-supplied value.
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400), -- 25MB, Part 12
  description text null,
  category text null check (
    category in ('engagement_letter', 'working_paper', 'client_provided', 'deliverable', 'compliance', 'other')
  ),
  upload_state text not null check (upload_state in ('pending', 'ready')) default 'pending',
  deleted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- category only means anything for a Project-level Document (Part 6/16) — a Task-linked one
  -- derives its context from the Task itself instead.
  constraint documents_category_only_when_project_level check (category is null or task_id is null)
);

create index documents_project_id_idx on public.documents (project_id);
create index documents_task_id_idx on public.documents (task_id);
-- The one query shape every normal read path shares.
create index documents_ready_active_idx on public.documents (project_id) where upload_state = 'ready' and deleted_at is null;

comment on table public.documents is
  'Phase 14B. One model for Project Documents and Task Attachments — task_id set makes it an attachment. project_id/task_id are immutable after creation (no "change context" in v1). upload_state gates normal visibility; deleted_at is a soft-delete Trash flag, no automatic purge exists yet.';

-- ---------------------------------------------------------------------------
-- Invariant enforcement — server-side, not just "the RPC happens to be careful" (defense-in-depth
-- on top of reserve_document_upload's own derivation logic, per Correction 2's explicit
-- requirement). Re-validates project_id against the Task's own Project on every insert/update, and
-- rejects any attempt to change an immutable field after creation.
-- ---------------------------------------------------------------------------
create function public.enforce_document_invariants()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_task_project_id uuid;
begin
  if new.task_id is not null then
    select w.project_id into v_task_project_id
    from public.tasks t
    join public.workstreams w on w.id = t.workstream_id
    where t.id = new.task_id;

    if v_task_project_id is null or v_task_project_id <> new.project_id then
      raise exception 'Document project_id must match its Task''s own Project.';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.project_id <> old.project_id
      or new.task_id is distinct from old.task_id
      or new.storage_path <> old.storage_path
      or new.uploaded_by <> old.uploaded_by
      or new.original_filename <> old.original_filename
      or new.mime_type <> old.mime_type
      or new.size_bytes <> old.size_bytes
    then
      raise exception 'This field cannot be changed after the document is created.';
    end if;
  end if;

  return new;
end;
$$;

create trigger documents_enforce_invariants
  before insert or update on public.documents
  for each row execute function public.enforce_document_invariants();

-- ---------------------------------------------------------------------------
-- Authorization helpers. can_manage_document_row is the single source of truth composed by both
-- can_edit_document (below) and every RPC in this migration — never re-derived independently, so
-- the metadata layer, the Storage layer, and every RPC can never silently drift apart (Part 10).
-- ---------------------------------------------------------------------------

-- VIEW gate — Task-linked uses the existing broad READ-visibility can_access_task (matching
-- notes_select's own precedent for exactly this question); Project-level uses can_access_project
-- (Correction 1), never can_access_company. Deliberately does not check upload_state/deleted_at
-- itself — callers needing the "manage regardless of state" question (Trash, pending) use
-- can_manage_document_row directly instead.
create function public.can_access_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_superadmin()
    or exists (
      select 1 from public.documents d
      where d.id = target_document_id
        and d.upload_state = 'ready' and d.deleted_at is null
        and (
          (d.task_id is not null and public.can_access_task(d.task_id))
          or (d.task_id is null and public.can_access_project(d.project_id))
        )
    );
$$;

-- Manage gate (rename/soft-delete/restore/finalize/cancel), state-independent — Superadmin
-- unconditional; Supervisor via can_access_task_directly (Task-linked) or can_access_project
-- (Project-level), never role-global; Employee only their own upload, and only while they still
-- genuinely have Task/Project access (an uploader who has since lost access does not retain
-- management rights merely because they uploaded it once).
create function public.can_manage_document_row(p_uploaded_by uuid, p_task_id uuid, p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_superadmin()
    or (
      public.is_supervisor()
      and (
        (p_task_id is not null and public.can_access_task_directly(p_task_id))
        or (p_task_id is null and public.can_access_project(p_project_id))
      )
    )
    or (
      p_uploaded_by = auth.uid()
      and (
        (p_task_id is not null and public.can_access_task(p_task_id))
        or (p_task_id is null and public.can_access_project(p_project_id))
      )
    );
$$;

-- Edit gate for an active, ready Document specifically (rename, soft-delete) — restore uses
-- can_manage_document_row directly instead, since a Trash row fails this state check by design.
create function public.can_edit_document(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = target_document_id
      and d.upload_state = 'ready' and d.deleted_at is null
      and public.can_manage_document_row(d.uploaded_by, d.task_id, d.project_id)
  );
$$;

revoke execute on function public.can_access_document(uuid) from public, anon;
revoke execute on function public.can_manage_document_row(uuid, uuid, uuid) from public, anon;
revoke execute on function public.can_edit_document(uuid) from public, anon;
grant execute on function public.can_access_document(uuid) to authenticated, service_role;
grant execute on function public.can_manage_document_row(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.can_edit_document(uuid) to authenticated, service_role;

-- Recursion safety: can_access_document / can_manage_document_row / can_edit_document each call only
-- can_access_task, can_access_task_directly, can_access_project, is_superadmin, is_supervisor — all
-- already-proven leaf helpers with no path back into `documents` or any of these three functions.
-- Clean DAG, same tracing discipline as the Phase 13 Supervisor Task-mutation hardening.

-- ---------------------------------------------------------------------------
-- RLS. No direct insert/update/delete grant to `authenticated` at all — every mutation goes through
-- the narrow SECURITY DEFINER RPCs below, which is what makes storage_path/project_id/task_id
-- immutability and the reservation lifecycle actually enforceable (a raw INSERT policy would let a
-- client choose an arbitrary storage_path, which must never happen).
-- ---------------------------------------------------------------------------
alter table public.documents enable row level security;

create policy "documents_select" on public.documents
  for select using (public.can_access_document(id));

-- Trash — visible only to someone who could manage the row if it were still active (this document's
-- own uploader-still-scoped, hierarchy-scoped Supervisor, or Superadmin). Never broadens normal
-- visibility: a viewer who could never see the row when it was ready still can't see it in Trash.
create policy "documents_select_trash" on public.documents
  for select using (
    deleted_at is not null
    and public.can_manage_document_row(uploaded_by, task_id, project_id)
  );

-- A caller's own still-pending reservations (for provider-side retry/cleanup after an interrupted
-- upload) — never another user's pending rows.
create policy "documents_select_own_pending" on public.documents
  for select using (upload_state = 'pending' and uploaded_by = auth.uid());

grant select on public.documents to authenticated;
grant select, insert, update, delete on public.documents to service_role;

-- ---------------------------------------------------------------------------
-- reserve_document_upload — step 1 of 3. Derives/validates project_id from task_id server-side when
-- task-scoped (Correction 2) — never trusts two independent inputs. Validates the extension/MIME
-- allowlist (Part 12/Correction 7 — extension and declared MIME must agree exactly; this is NOT
-- magic-byte content validation, stated honestly). Generates the immutable storage_path
-- (Correction 6) — the caller can never choose it.
-- ---------------------------------------------------------------------------
create function public.reserve_document_upload(
  p_project_id uuid,
  p_task_id uuid,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint
)
returns table (document_id uuid, storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_extension text;
  v_expected_mime text;
  v_document_id uuid;
  v_storage_path text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  if (p_project_id is null) = (p_task_id is null) then
    raise exception 'Provide exactly one of project_id or task_id.';
  end if;

  if p_task_id is not null then
    select w.project_id into v_project_id
    from public.tasks t
    join public.workstreams w on w.id = t.workstream_id
    where t.id = p_task_id;

    if v_project_id is null then
      raise exception 'Task not found or has no linked project.';
    end if;
    if not public.can_access_task(p_task_id) then
      raise exception 'You do not have access to this task.';
    end if;
  else
    v_project_id := p_project_id;
    if not public.can_access_project(v_project_id) then
      raise exception 'You do not have access to this project.';
    end if;
  end if;

  v_extension := lower((regexp_match(p_original_filename, '\.([a-zA-Z0-9]+)$'))[1]);
  if v_extension is null then
    raise exception 'File must have a recognizable extension.';
  end if;

  v_expected_mime := case v_extension
    when 'pdf' then 'application/pdf'
    when 'doc' then 'application/msword'
    when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    when 'xls' then 'application/vnd.ms-excel'
    when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    when 'csv' then 'text/csv'
    when 'txt' then 'text/plain'
    when 'png' then 'image/png'
    when 'jpg' then 'image/jpeg'
    when 'jpeg' then 'image/jpeg'
    else null
  end;

  if v_expected_mime is null then
    raise exception 'File type not allowed.';
  end if;
  if p_mime_type <> v_expected_mime then
    raise exception 'Declared file type does not match its extension.';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 26214400 then
    raise exception 'File size must be between 1 byte and 25MB.';
  end if;

  v_document_id := gen_random_uuid();
  v_storage_path := 'projects/' || v_project_id::text || '/' || v_document_id::text || '.' || v_extension;

  insert into public.documents (
    id, project_id, task_id, uploaded_by, original_filename, storage_path, mime_type, size_bytes, upload_state
  ) values (
    v_document_id, v_project_id, p_task_id, auth.uid(), p_original_filename, v_storage_path, p_mime_type, p_size_bytes, 'pending'
  );

  return query select v_document_id, v_storage_path;
end;
$$;

revoke execute on function public.reserve_document_upload(uuid, uuid, text, text, bigint) from public, anon;
grant execute on function public.reserve_document_upload(uuid, uuid, text, text, bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- finalize_document_upload — step 3 of 3 (step 2, the browser's own Storage upload, happens outside
-- Postgres entirely, gated by the Storage RLS policies below). Confirms the matching object actually
-- exists in Storage before flipping pending -> ready. Reading storage.objects for this existence
-- check is read-only inspection, not a Storage mutation.
-- ---------------------------------------------------------------------------
create function public.finalize_document_upload(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc record;
  v_object_exists boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  select * into v_doc from public.documents where id = p_document_id for update;
  if not found then
    raise exception 'Document not found.';
  end if;
  if v_doc.upload_state <> 'pending' then
    raise exception 'Document is not pending.';
  end if;
  if not public.can_manage_document_row(v_doc.uploaded_by, v_doc.task_id, v_doc.project_id) then
    raise exception 'You do not have permission to finalize this upload.';
  end if;

  select exists (
    select 1 from storage.objects where bucket_id = 'documents' and name = v_doc.storage_path
  ) into v_object_exists;

  if not v_object_exists then
    raise exception 'Uploaded file was not found in storage — the upload may have failed.';
  end if;

  update public.documents set upload_state = 'ready', updated_at = now() where id = p_document_id;
end;
$$;

revoke execute on function public.finalize_document_upload(uuid) from public, anon;
grant execute on function public.finalize_document_upload(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cancel_document_upload — cleans up a reservation that never became a real Document (Storage
-- upload never happened, or failed). Idempotent: a already-gone or already-finalized row is a
-- silent no-op, never an error, so a retried/duplicate cleanup call is always safe. Hard-deletes the
-- ROW (a pending row was never visible, carries no evidence to protect) but does NOT touch Storage —
-- the provider's own orchestration removes the Storage object first, while the row is still pending
-- (see the DELETE storage policy below, which requires a matching pending row to still exist), then
-- calls this to remove the metadata row.
-- ---------------------------------------------------------------------------
create function public.cancel_document_upload(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  select * into v_doc from public.documents where id = p_document_id for update;
  if not found then
    return;
  end if;
  if v_doc.upload_state <> 'pending' then
    return;
  end if;
  if not public.can_manage_document_row(v_doc.uploaded_by, v_doc.task_id, v_doc.project_id) then
    raise exception 'You do not have permission to cancel this upload.';
  end if;

  delete from public.documents where id = p_document_id;
end;
$$;

revoke execute on function public.cancel_document_upload(uuid) from public, anon;
grant execute on function public.cancel_document_upload(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- update_document_metadata — display_name/description only. Every other field is immutable
-- (enforced again, defense-in-depth, by enforce_document_invariants above).
-- ---------------------------------------------------------------------------
create function public.update_document_metadata(
  p_document_id uuid,
  p_display_name text,
  p_description text,
  p_category text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;
  if not public.can_edit_document(p_document_id) then
    raise exception 'Document not found or you do not have permission to edit it.';
  end if;

  -- documents_category_only_when_project_level (table constraint) rejects this update outright if
  -- the target row is Task-linked and p_category is non-null — no separate check needed here.
  update public.documents
  set display_name = p_display_name, description = p_description, category = p_category, updated_at = now()
  where id = p_document_id;
end;
$$;

revoke execute on function public.update_document_metadata(uuid, text, text, text) from public, anon;
grant execute on function public.update_document_metadata(uuid, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- soft_delete_document / restore_document — Correction 4: metadata-only, Storage object untouched.
-- soft_delete requires the same active/ready + manage-authorized gate as edit; restore explicitly
-- targets a Trash row instead (can_edit_document would always fail on a deleted row by design), so
-- it composes can_manage_document_row directly.
-- ---------------------------------------------------------------------------
create function public.soft_delete_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;
  if not public.can_edit_document(p_document_id) then
    raise exception 'Document not found or you do not have permission to delete it.';
  end if;

  update public.documents set deleted_at = now(), updated_at = now() where id = p_document_id;
end;
$$;

create function public.restore_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.';
  end if;

  select * into v_doc from public.documents where id = p_document_id and deleted_at is not null for update;
  if not found then
    raise exception 'Document not found in Trash.';
  end if;
  if not public.can_manage_document_row(v_doc.uploaded_by, v_doc.task_id, v_doc.project_id) then
    raise exception 'You do not have permission to restore this document.';
  end if;

  update public.documents set deleted_at = null, updated_at = now() where id = p_document_id;
end;
$$;

revoke execute on function public.soft_delete_document(uuid) from public, anon;
revoke execute on function public.restore_document(uuid) from public, anon;
grant execute on function public.soft_delete_document(uuid) to authenticated, service_role;
grant execute on function public.restore_document(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage bucket + object policies. ONE private bucket for both Project Documents and Task
-- Attachments (Part 8). 25MB limit and the same MIME allowlist configured at the bucket level too,
-- as a second, independent enforcement layer alongside reserve_document_upload's own validation —
-- not a substitute for it.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do nothing;

-- INSERT — only into a path that matches the caller's own pending reservation. This is what makes
-- the browser's own upload safe: it can never write to any path except the exact one
-- reserve_document_upload just generated and recorded for it.
create policy "documents_objects_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = storage.objects.name
        and d.uploaded_by = auth.uid()
        and d.upload_state = 'pending'
    )
  );

-- SELECT — delegates to the exact same can_access_document the metadata table itself uses, so the
-- two layers can never drift apart (Part 10). A request straight at the Storage API is gated
-- identically to a request through the app.
create policy "documents_objects_select" on storage.objects
  for select
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = storage.objects.name and public.can_access_document(d.id)
    )
  );

-- No UPDATE policy — Storage object paths/content are immutable in v1; a rename only ever touches
-- documents.display_name, never storage.objects.

-- DELETE — narrow: only the reservation owner may remove their OWN still-pending object (used by the
-- provider's cancel/cleanup path, which must remove the Storage object BEFORE calling
-- cancel_document_upload — once that RPC deletes the metadata row, this policy's own match
-- disappears too), or Superadmin unconditionally (a deliberate, narrow admin-only capability ahead
-- of any dedicated purge workflow — not exposed anywhere in the provider's public API surface in
-- Phase 14B). An Employee/Supervisor can never physically delete an active/ready object merely
-- because they can soft-delete its metadata row.
create policy "documents_objects_delete_own_pending" on storage.objects
  for delete
  using (
    bucket_id = 'documents'
    and (
      public.is_superadmin()
      or exists (
        select 1 from public.documents d
        where d.storage_path = storage.objects.name
          and d.uploaded_by = auth.uid()
          and d.upload_state = 'pending'
      )
    )
  );
