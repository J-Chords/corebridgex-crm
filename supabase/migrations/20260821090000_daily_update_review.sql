-- Phase 9C — Daily Update Automation: adds Team Lead review tracking to daily_updates. Forward-only;
-- does not edit 20260814110004_daily_updates.sql.
--
-- Review is a lightweight marker, not a new state in the status machine (still just draft/
-- confirmed) — a submitted (confirmed) Daily Update is either "not yet reviewed" (reviewed_at is
-- null) or "reviewed by {reviewer} at {time}." Locked business rule: a Supervisor remains an
-- Employee operationally for their OWN Daily Update (same submit flow, no special manager-only
-- experience) and additionally gets legitimate direct-report review privileges — never
-- organization-wide, never self-review, never a fourth role.

alter table public.daily_updates add column reviewed_at timestamptz null;
alter table public.daily_updates add column reviewed_by uuid null references public.profiles (id);
-- Denormalized alongside reviewed_by (same rationale as client_reports.generated_by_name): a
-- Supervisor viewing their own direct report's update has no RLS visibility into a Superadmin's
-- profile row (Superadmin review is organization-wide, so the reviewer may be someone the viewing
-- Supervisor doesn't otherwise manage) — the name is snapshotted here at review time instead of
-- resolved client-side from a roster the viewer might not have.
alter table public.daily_updates add column reviewed_by_name text null;

-- review_daily_update — the only way reviewed_at/reviewed_by can ever be set (entries jsonb has no
-- way to carry these, so they can never be forged through upsert_my_daily_update_draft either).
-- Supervisor may review only a genuine direct report's own submitted update; Superadmin may review
-- anyone's; nobody may review their own (including a Supervisor's own submission — it stays an
-- ordinary Employee-style submission awaiting a legitimate higher reviewer); a still-draft update
-- can never be reviewed.
create function public.review_daily_update(target_update_id uuid)
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

revoke execute on function public.review_daily_update(uuid) from public, anon;
grant execute on function public.review_daily_update(uuid) to authenticated, service_role;

-- reopen_my_daily_update — forward `create or replace` hardening (the function's own body was
-- originally defined in 20260814110004_daily_updates.sql, left untouched there) so reopening ALSO
-- clears any review marker: the submitted snapshot that was reviewed no longer exists once it's
-- back in draft, so a re-submit must be reviewed again. Owner-only/confirmed-only preconditions
-- and their exact error wording are unchanged from the original.
create or replace function public.reopen_my_daily_update(target_update_id uuid)
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
  if existing.user_id <> auth.uid() or existing.status <> 'confirmed' then
    raise exception 'Only the owner can reopen their daily update, and only while it''s confirmed.';
  end if;

  update public.daily_updates
  set status = 'draft', confirmed_at = null, reviewed_at = null, reviewed_by = null, reviewed_by_name = null, updated_at = now()
  where id = target_update_id
  returning * into result;
  return result;
end;
$$;

-- CREATE OR REPLACE preserves the existing EXECUTE grants, but the function's own authorization-
-- relevant body changed (it now also clears review columns), so the privilege boundary is
-- re-stated explicitly for clarity/defense-in-depth rather than assumed, matching this project's
-- established convention for every SECURITY DEFINER replace.
revoke execute on function public.reopen_my_daily_update(uuid) from public, anon;
grant execute on function public.reopen_my_daily_update(uuid) to authenticated, service_role;
