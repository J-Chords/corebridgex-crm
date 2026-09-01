-- Phase 14B hotfix — forward-only. Neither 20260831090000_documents_foundation.sql nor
-- 20260831100000_task_delete_documents_blocker.sql (both already hosted) is edited; both remain
-- byte-for-byte as applied.
--
-- Re-audited the CURRENT hosted contract before writing this file (not assumed from the prior
-- transcript) via read-only introspection (pg_get_function_identity_arguments, pg_policies):
--   - update_document_metadata ALREADY has the correct 4-arg signature
--     (p_document_id, p_display_name, p_description, p_category) — hosted matches the provider
--     exactly. No category/TypeScript contract mismatch exists. Not touched here.
--   - reserve_document_upload's hosted signature is still the original 5-arg form (no initial
--     metadata inputs) — the Supabase provider's `uploadDocument` calls
--     reserve -> upload -> finalize -> (conditionally) update_document_metadata, meaning a
--     successful finalize could still be followed by a metadata-write failure, leaving a "ready"
--     Document whose initial display name/description/category never landed. CONFIRMED defect —
--     fixed below by moving initial metadata into reservation itself.
--   - documents_objects_insert / documents_select_own_pending / documents_objects_delete_own_pending
--     each check only "pending row exists, owned by auth.uid()" — none re-verify the uploader still
--     has legitimate underlying Task/Project access at the moment of use. CONFIRMED stale-access
--     gap — fixed below by composing the same public.can_manage_document_row already used
--     everywhere else, so a reservation stops being usable/visible/cleanable the instant its
--     uploader loses the access they had when they reserved it.
--
-- CATEGORY IS NOT SECURITY CONTEXT. It never changes project_id/task_id/Service/Activity/Task
-- visibility — it is Project-Document organization metadata only, and remains permanently null for
-- any Task-linked Document (unchanged: documents_category_only_when_project_level, defined in the
-- already-hosted foundation migration, is not touched here).

-- ---------------------------------------------------------------------------
-- reserve_document_upload — new signature. Initial metadata (display_name/description/category) is
-- now part of the SAME insert that creates the `pending` row, so a successful finalize is the only
-- remaining step for a normal upload to be considered complete — no post-finalize metadata mutation
-- is ever required. The old 5-arg overload is dropped outright (not left stale): nothing in this
-- codebase calls it once the provider is updated in this same pass, and PostgREST resolves RPCs by
-- exact parameter-name match, so leaving a second overload around would only invite ambiguity.
-- ---------------------------------------------------------------------------
drop function if exists public.reserve_document_upload(uuid, uuid, text, text, bigint);

create function public.reserve_document_upload(
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
    if not public.can_access_task(p_task_id) then
      raise exception 'You do not have access to this task.';
    end if;
  else
    v_project_id := p_project_id;
    if not public.can_access_project(v_project_id) then
      raise exception 'You do not have access to this project.';
    end if;
  end if;

  -- Category is organization metadata only (never security context) — Task-linked context still
  -- derives exclusively from Task -> Activity -> Service -> Project; a non-null category on a
  -- Task-scoped upload is rejected explicitly here (a clean, actionable error at the public
  -- contract boundary) rather than silently discarded, and the table's own
  -- documents_category_only_when_project_level constraint backstops this identically at insert time.
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
-- Storage INSERT — a reservation is no longer sufficient on its own; the uploader must still
-- genuinely manage the Task/Project at the moment bytes are uploaded (can_manage_document_row,
-- the same single source of truth used everywhere else). An Employee who reserves an upload and
-- then loses their Project/Task access before the browser's own upload call fires can no longer
-- write the object.
-- ---------------------------------------------------------------------------
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
        and d.uploaded_by = auth.uid()
        and public.can_manage_document_row(d.uploaded_by, d.task_id, d.project_id)
    )
  );

-- ---------------------------------------------------------------------------
-- documents_select_own_pending — same re-check. A caller's own pending reservation is visible only
-- while they still genuinely manage its Task/Project; once access is revoked, the reservation stops
-- surfacing through normal authenticated queries at all — not merely stops being actionable.
-- Deliberately NOT widened to a general "Superadmin sees all pending rows" branch here: no admin
-- cleanup UI consumes that in Phase 14B, and can_manage_document_row's own is_superadmin() branch
-- already lets a Superadmin see/manage their OWN pending reservations through this same policy.
-- Broader administrative pending-row visibility remains an explicitly deferred, narrowly-designed
-- future addition if a real need for it appears.
-- ---------------------------------------------------------------------------
drop policy if exists "documents_select_own_pending" on public.documents;
create policy "documents_select_own_pending" on public.documents
  for select using (
    upload_state = 'pending'
    and uploaded_by = auth.uid()
    and public.can_manage_document_row(uploaded_by, task_id, project_id)
  );

-- ---------------------------------------------------------------------------
-- Storage DELETE (pending cleanup) — same re-check for the ordinary-uploader branch. The Superadmin
-- branch remains unconditional, deliberately, as the one narrow administrative-cleanup capability
-- ahead of any dedicated purge workflow (unchanged from the original foundation migration's own
-- reasoning) — never widened to grant active/ready object deletion to ordinary users.
-- ---------------------------------------------------------------------------
drop policy if exists "documents_objects_delete_own_pending" on storage.objects;
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
          and public.can_manage_document_row(d.uploaded_by, d.task_id, d.project_id)
      )
    )
  );
