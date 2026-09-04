-- Project Level Part 7/8/9 — extend the existing threaded Comments architecture to Task and
-- Document targets, rather than a second incompatible comments table. `project_id` always present
-- (denormalized for a cheap, direct RLS check even on a Task/Document comment); at most one of
-- `task_id`/`document_id` may be set (a CHECK enforces this structurally); a genuinely valid
-- `task_id`/`document_id` must belong to THIS SAME Project (enforced by a trigger, since that's a
-- cross-row fact no CHECK constraint alone can express) — a reply must stay in the same target as
-- its parent (also trigger-enforced). Read/create authorization is target-aware: a Task comment
-- requires real can_access_task, a Document comment requires the real can_access_document, a root
-- comment requires can_access_project — never "if you can see the Project you can see everything
-- commented on inside it."

alter table public.project_comments
  add column task_id uuid references public.tasks(id) on delete cascade,
  add column document_id uuid references public.documents(id) on delete cascade;

alter table public.project_comments add constraint project_comments_single_target
  check (not (task_id is not null and document_id is not null));

create or replace function public.enforce_project_comment_target()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  parent public.project_comments;
begin
  if new.task_id is not null then
    if not exists (
      select 1 from public.tasks t join public.workstreams w on w.id = t.workstream_id
      where t.id = new.task_id and w.project_id = new.project_id
    ) then
      raise exception 'That Task does not belong to this Project.';
    end if;
  end if;
  if new.document_id is not null then
    if not exists (select 1 from public.documents d where d.id = new.document_id and d.project_id = new.project_id) then
      raise exception 'That Document does not belong to this Project.';
    end if;
  end if;
  if new.parent_comment_id is not null then
    select * into parent from public.project_comments where id = new.parent_comment_id;
    if not found then
      raise exception 'Parent comment not found.';
    end if;
    if parent.task_id is distinct from new.task_id or parent.document_id is distinct from new.document_id then
      raise exception 'A reply must stay on the same Task/Document/Project context as its parent.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists project_comments_enforce_target on public.project_comments;
create trigger project_comments_enforce_target
  before insert or update on public.project_comments
  for each row execute function public.enforce_project_comment_target();

drop policy if exists "project_comments_select" on public.project_comments;
create policy "project_comments_select" on public.project_comments
  for select using (
    deleted_at is null
    and public.is_current_user_active()
    and (
      (task_id is not null and public.can_access_task(task_id))
      or (document_id is not null and public.can_access_document(document_id))
      or (task_id is null and document_id is null and public.can_access_project(project_id))
    )
  );

-- create_project_comment — target-aware. A Task/Document comment requires the SAME legitimate
-- access the underlying Task/Document itself already requires (never the broader "can see the
-- Project" check). The old 3-arg signature is a different overload, not replaced by the 5-arg one
-- below — drop it explicitly rather than leave it as dead code.
drop function if exists public.create_project_comment(uuid, uuid, text);

create or replace function public.create_project_comment(
  target_project_id uuid, p_parent_comment_id uuid, p_body text, p_task_id uuid default null, p_document_id uuid default null
)
 returns project_comments
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  new_comment public.project_comments;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
  if p_task_id is not null and p_document_id is not null then
    raise exception 'A comment may target at most one of Task/Document.';
  end if;
  if p_task_id is not null then
    if not public.can_access_task(p_task_id) then
      raise exception 'You don''t have access to this task.';
    end if;
  elsif p_document_id is not null then
    if not public.can_access_document(p_document_id) then
      raise exception 'You don''t have access to this document.';
    end if;
  else
    if not public.can_access_project(target_project_id) then
      raise exception 'You don''t have access to this project.';
    end if;
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Comment can''t be empty.';
  end if;

  insert into public.project_comments (project_id, parent_comment_id, author_id, body, task_id, document_id)
  values (target_project_id, p_parent_comment_id, auth.uid(), trim(p_body), p_task_id, p_document_id)
  returning * into new_comment;
  return new_comment;
end;
$function$;

-- update/delete — re-verify the author STILL has legitimate access to the comment's own target
-- (not merely "is still the author") every time, per Part 8's explicit requirement.
create or replace function public.update_project_comment(target_comment_id uuid, p_body text)
 returns project_comments
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing public.project_comments;
  updated public.project_comments;
  has_access boolean;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
  select * into existing from public.project_comments where id = target_comment_id;
  if not found or existing.deleted_at is not null then
    raise exception 'Comment not found.';
  end if;
  if existing.author_id <> auth.uid() then
    raise exception 'Only the comment''s own author can edit it.';
  end if;
  if existing.task_id is not null then
    has_access := public.can_access_task(existing.task_id);
  elsif existing.document_id is not null then
    has_access := public.can_access_document(existing.document_id);
  else
    has_access := public.can_access_project(existing.project_id);
  end if;
  if not has_access then
    raise exception 'You no longer have access to this comment''s context.';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Comment can''t be empty.';
  end if;

  update public.project_comments set body = trim(p_body), updated_at = now()
  where id = target_comment_id
  returning * into updated;
  return updated;
end;
$function$;

create or replace function public.delete_project_comment(target_comment_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  existing public.project_comments;
  has_access boolean;
begin
  if not public.is_current_user_active() then
    raise exception 'This account has been deactivated.';
  end if;
  select * into existing from public.project_comments where id = target_comment_id;
  if not found or existing.deleted_at is not null then
    raise exception 'Comment not found.';
  end if;
  if existing.author_id <> auth.uid() and not public.is_superadmin() then
    raise exception 'Only the comment''s own author or an admin can delete it.';
  end if;
  if existing.author_id = auth.uid() and not public.is_superadmin() then
    if existing.task_id is not null then
      has_access := public.can_access_task(existing.task_id);
    elsif existing.document_id is not null then
      has_access := public.can_access_document(existing.document_id);
    else
      has_access := public.can_access_project(existing.project_id);
    end if;
    if not has_access then
      raise exception 'You no longer have access to this comment''s context.';
    end if;
  end if;

  update public.project_comments set deleted_at = now() where id = target_comment_id;
end;
$function$;

revoke all on function public.create_project_comment(uuid, uuid, text, uuid, uuid) from public, anon;
grant execute on function public.create_project_comment(uuid, uuid, text, uuid, uuid) to authenticated, service_role;
