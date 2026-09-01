-- Phase 14B hotfix — direct Task authority + reservation ownership. Forward-only. None of
-- 20260831090000_documents_foundation.sql, 20260831100000_task_delete_documents_blocker.sql, or
-- 20260901090000_documents_foundation_contract_hotfix.sql (all already hosted) is edited.
--
-- Reconfirmed from CURRENT live source before writing this file (pg_get_functiondef), not assumed:
--   - public.can_access_task: the broad READ/hierarchy-visibility helper. Confirmed to still include
--     its two one-hop parent/child Subtask branches (assigned-to-parent -> may read child;
--     assigned-to-child -> may read parent), exactly as originally designed for read/display
--     surfaces (Notes, Task list/detail visibility). NOT changed by this migration.
--   - public.can_access_task_directly: `select can_user_access_task(auth.uid(), target_task_id)` —
--     the direct-operational-authority helper `can_edit_task`/`can_progress_task`/`delete_task`
--     already use for every real MUTATION, with zero hierarchy/Subtask-visibility branches. NOT
--     changed by this migration.
--
-- DEFECT A (confirmed) — `reserve_document_upload`'s Task-linked branch called `can_access_task`
-- (read authority) to gate an upload, which is itself a mutation/side effect on the Task. Fixed:
-- Task-linked reservation now requires `can_access_task_directly`.
--
-- DEFECT B (confirmed) — `can_manage_document_row`'s Employee-own-upload branch composed
-- `can_access_task` for its Task-linked condition, meaning an uploader who kept only hierarchy-only
-- READ visibility after losing direct Task authority would still retain rename/delete/restore
-- rights. Fixed: that branch now requires `can_access_task_directly`. The Supervisor branch already
-- correctly used `can_access_task_directly` (confirmed via pg_get_functiondef, unchanged here).
--
-- DEFECT C (confirmed) — `finalize_document_upload`/`cancel_document_upload` and the three pending-
-- lifecycle policies (`documents_objects_insert`, `documents_select_own_pending`,
-- `documents_objects_delete_own_pending`) all gated on the general `can_manage_document_row`, whose
-- Supervisor branch would let a Supervisor with legitimate direct Task/Project scope finalize or
-- cancel a SUBORDINATE's still-in-flight pending upload merely by knowing/guessing its UUID. Pending
-- reservations are uploader-owned, not yet a "Document" a Supervisor has any real standing over.
-- Fixed with a new, narrower helper (`can_manage_pending_document_row`) used exclusively for
-- pending-state operations — reservation owner (while still directly authorized) or Superadmin
-- only, with NO Supervisor-of-uploader branch at all. A Supervisor's broader legitimate management
-- authority begins only once `upload_state = 'ready'`.
--
-- READ/MUTATION distinction preserved throughout (mirrors the already-accepted Phase 10/13
-- architecture — `canAccessTask` vs `canAccessTaskDirectly`, `can_access_task` vs
-- `can_access_task_directly`): `can_access_document` (ready/active Document VIEW) still composes
-- `can_access_task` unchanged — a hierarchy-visible Task's attachments remain readable exactly like
-- its other content (Notes, Task detail) already is. Only the MUTATION-shaped paths (upload, rename,
-- soft-delete, restore, pending lifecycle) move to direct authority.

-- ---------------------------------------------------------------------------
-- New helper — pending-lifecycle authorization only. Deliberately has NO Supervisor-of-uploader
-- branch: a pending reservation is uploader-owned until it becomes a real (`ready`) Document: Correction
-- to the previous hotfix, this pass allows retained Superadmin recovery capability over ANY pending
-- row (not merely their own), for the explicit "Superadmin may perform recovery/cleanup" allowance —
-- unlike an ordinary Supervisor, a Superadmin already has unconditional authority everywhere else in
-- this schema, so this is not a broadening beyond precedent.
-- ---------------------------------------------------------------------------
create function public.can_manage_pending_document_row(p_uploaded_by uuid, p_task_id uuid, p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_superadmin()
    or (
      p_uploaded_by = auth.uid()
      and (
        (p_task_id is not null and public.can_access_task_directly(p_task_id))
        or (p_task_id is null and public.can_access_project(p_project_id))
      )
    );
$$;

revoke execute on function public.can_manage_pending_document_row(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_manage_pending_document_row(uuid, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- can_manage_document_row — Employee-own-upload branch corrected to direct Task authority (Defect
-- B). Supervisor branch already correctly used can_access_task_directly; unchanged. Superadmin
-- branch unchanged. This is the READY-document management gate — pending-state operations never
-- call this function anymore (they call can_manage_pending_document_row instead).
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_document_row(p_uploaded_by uuid, p_task_id uuid, p_project_id uuid)
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
        (p_task_id is not null and public.can_access_task_directly(p_task_id))
        or (p_task_id is null and public.can_access_project(p_project_id))
      )
    );
$$;

revoke execute on function public.can_manage_document_row(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_manage_document_row(uuid, uuid, uuid) to authenticated, service_role;

-- Recursion safety: can_manage_pending_document_row / can_manage_document_row -> is_superadmin,
-- is_supervisor, can_access_task_directly, can_access_project -> already-proven leaf helpers, no
-- path back into `documents` or either of these two functions. Clean DAG.

-- ---------------------------------------------------------------------------
-- reserve_document_upload — Task-linked reservation gate corrected to can_access_task_directly
-- (Defect A). Signature is unchanged (still 8 params) — create or replace in place, no overload to
-- drop. Every other validation (extension/MIME/size/category) is untouched.
-- ---------------------------------------------------------------------------
create or replace function public.reserve_document_upload(
  p_project_id uuid,
  p_task_id uuid,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint,
  p_display_name text,
  p_description text,
  p_category text
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
    -- Defect A fix: uploading is a mutation/side effect on the Task, not a read — direct authority
    -- required, never mere hierarchy-visibility.
    if not public.can_access_task_directly(p_task_id) then
      raise exception 'You do not have access to this task.';
    end if;
  else
    v_project_id := p_project_id;
    if not public.can_access_project(v_project_id) then
      raise exception 'You do not have access to this project.';
    end if;
  end if;

  if p_category is not null then
    if p_task_id is not null then
      raise exception 'Category only applies to Project-level documents, not Task attachments.';
    end if;
    if p_category not in (
      'engagement_letter', 'working_paper', 'client_provided', 'deliverable', 'compliance', 'other'
    ) then
      raise exception 'Invalid document category.';
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
    id, project_id, task_id, uploaded_by, original_filename, storage_path, mime_type, size_bytes,
    display_name, description, category, upload_state
  ) values (
    v_document_id, v_project_id, p_task_id, auth.uid(), p_original_filename, v_storage_path, p_mime_type, p_size_bytes,
    p_display_name, p_description, p_category, 'pending'
  );

  return query select v_document_id, v_storage_path;
end;
$$;

revoke execute on function public.reserve_document_upload(uuid, uuid, text, text, bigint, text, text, text) from public, anon;
grant execute on function public.reserve_document_upload(uuid, uuid, text, text, bigint, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- finalize_document_upload / cancel_document_upload — Defect C fix. Authorization switched from
-- can_manage_document_row (which has a Supervisor-of-uploader branch, correct for READY Documents
-- but wrong for a still-pending reservation) to can_manage_pending_document_row (reservation owner,
-- still directly authorized, or Superadmin — never a Supervisor merely because they supervise the
-- uploader). Every other behavior is unchanged: authenticated check, row lock, pending-state check,
-- Storage-object-exists check (finalize), idempotency (cancel).
-- ---------------------------------------------------------------------------
create or replace function public.finalize_document_upload(p_document_id uuid)
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
  if not public.can_manage_pending_document_row(v_doc.uploaded_by, v_doc.task_id, v_doc.project_id) then
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

create or replace function public.cancel_document_upload(p_document_id uuid)
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
  if not public.can_manage_pending_document_row(v_doc.uploaded_by, v_doc.task_id, v_doc.project_id) then
    raise exception 'You do not have permission to cancel this upload.';
  end if;

  delete from public.documents where id = p_document_id;
end;
$$;

revoke execute on function public.finalize_document_upload(uuid) from public, anon;
revoke execute on function public.cancel_document_upload(uuid) from public, anon;
grant execute on function public.finalize_document_upload(uuid) to authenticated, service_role;
grant execute on function public.cancel_document_upload(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Pending-lifecycle policies — all three now compose can_manage_pending_document_row instead of
-- can_manage_document_row (which already internally covers Superadmin, so the explicit standalone
-- is_superadmin() branch these policies previously carried is folded into the helper itself now).
-- ---------------------------------------------------------------------------
drop policy if exists "documents_select_own_pending" on public.documents;
create policy "documents_select_own_pending" on public.documents
  for select using (
    upload_state = 'pending'
    and public.can_manage_pending_document_row(uploaded_by, task_id, project_id)
  );

drop policy if exists "documents_objects_insert" on storage.objects;
create policy "documents_objects_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = storage.objects.name
        and d.upload_state = 'pending'
        and d.deleted_at is null
        and public.can_manage_pending_document_row(d.uploaded_by, d.task_id, d.project_id)
    )
  );

drop policy if exists "documents_objects_delete_own_pending" on storage.objects;
create policy "documents_objects_delete_own_pending" on storage.objects
  for delete
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_path = storage.objects.name
        and d.upload_state = 'pending'
        and public.can_manage_pending_document_row(d.uploaded_by, d.task_id, d.project_id)
    )
  );

-- documents_select (ready/active VIEW, via can_access_document -> can_access_task for Task-linked
-- rows), documents_select_trash (via can_manage_document_row, now direct-Task-authority-corrected
-- automatically), documents_objects_select (ready/active Storage SELECT, via can_access_document),
-- update_document_metadata/soft_delete_document/restore_document (via can_edit_document ->
-- can_manage_document_row) all inherit their respective corrections/non-corrections automatically by
-- calling the same named functions — none of them needed to be redefined here.
