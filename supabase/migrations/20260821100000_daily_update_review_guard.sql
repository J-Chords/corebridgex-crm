-- Phase 9C hotfix — review_daily_update (from 20260821090000_daily_update_review.sql, left
-- untouched) allowed an already-reviewed submitted Daily Update to be reviewed again, silently
-- overwriting reviewed_at/reviewed_by/reviewed_by_name with a second reviewer's identity. The
-- intended semantics: a submitted snapshot is either "Submitted · Not reviewed" or "Submitted ·
-- Reviewed" — once reviewed, it stays reviewed by whoever reviewed it first, until the owner
-- reopens it (which clears the marker) and re-submits (making it reviewable again). Forward-only
-- `create or replace`; 20260821090000_daily_update_review.sql is not edited.

create or replace function public.review_daily_update(target_update_id uuid)
returns public.daily_updates
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.daily_updates;
  result public.daily_updates;
begin
  select * into existing from public.daily_updates where id = target_update_id;
  if not found then
    raise exception 'Daily update not found.';
  end if;
  if existing.status <> 'confirmed' then
    raise exception 'Only a submitted Daily Update can be reviewed.';
  end if;
  if existing.reviewed_at is not null then
    raise exception 'This Daily Update has already been reviewed.';
  end if;
  if existing.user_id = auth.uid() then
    raise exception 'You cannot review your own Daily Update.';
  end if;
  if not (
    public.is_superadmin()
    or (public.is_supervisor() and public.manages_user(existing.user_id))
  ) then
    raise exception 'You do not have permission to review this Daily Update.';
  end if;

  update public.daily_updates
  set reviewed_at = now(), reviewed_by = auth.uid(),
      reviewed_by_name = (select full_name from public.profiles where id = auth.uid())
  where id = target_update_id
  returning * into result;
  return result;
end;
$$;

-- CREATE OR REPLACE preserves the existing EXECUTE grants, but the function's own authorization-
-- relevant body changed, so the privilege boundary is re-stated explicitly for clarity/
-- defense-in-depth rather than assumed — matching this project's established convention for every
-- SECURITY DEFINER replace.
revoke execute on function public.review_daily_update(uuid) from public, anon;
grant execute on function public.review_daily_update(uuid) to authenticated, service_role;
