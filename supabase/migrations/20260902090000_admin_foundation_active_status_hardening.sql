-- Admin Foundation Part 4/5 — deactivation security hardening + last-active-superadmin protection.
--
-- Part 4 finding (live SQL read-back, pre-implementation audit): none of is_superadmin()/
-- is_supervisor()/is_employee()/manages_user() ever checked profiles.active — only role. Since
-- these four functions are the choke point nearly every RLS policy and permission check in this
-- schema composes (directly or transitively), a user whose profiles.active was flipped to false
-- continued to pass every one of those checks for as long as their existing Supabase Auth
-- session/JWT remained valid — deactivation did not itself cut off an already-issued session's
-- cross-user data access (Supervisor-over-team, Superadmin-over-everything). Hardened here by
-- adding an explicit active check to all four. This does not affect service_role (which bypasses
-- RLS entirely and never calls these auth.uid()-based helpers) and does not change behavior for
-- any currently-active user.
--
-- Residual, accepted gap (documented, not fixed here): raw self = auth.uid() checks that don't
-- route through any of these four functions (e.g. profiles_select's own `id = auth.uid()` branch,
-- or various tables' `user_id = auth.uid()` self-branches) still let a deactivated user see their
-- own previously-owned rows until their session naturally expires. Closing every such raw
-- self-check across the schema is a materially larger, separate effort; this migration closes the
-- actually dangerous case (deactivated Supervisor/Superadmin retaining broad cross-user access).

create or replace function public.is_superadmin()
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'superadmin' and active
  );
$function$;

create or replace function public.is_supervisor()
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'supervisor' and active
  );
$function$;

create or replace function public.is_employee()
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'employee' and active
  );
$function$;

create or replace function public.manages_user(target_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select
    (
      auth.uid() = target_id
      and exists (select 1 from public.profiles where id = auth.uid() and active)
    )
    or public.is_superadmin()
    or (
      public.is_supervisor()
      and exists (select 1 from public.profiles where id = target_id and supervisor_id = auth.uid())
    );
$function$;

revoke all on function public.is_superadmin() from public, anon;
grant execute on function public.is_superadmin() to authenticated, service_role;
revoke all on function public.is_supervisor() from public, anon;
grant execute on function public.is_supervisor() to authenticated, service_role;
revoke all on function public.is_employee() from public, anon;
grant execute on function public.is_employee() to authenticated, service_role;
revoke all on function public.manages_user(uuid) from public, anon;
grant execute on function public.manages_user(uuid) to authenticated, service_role;

-- Part 5 — last-active-superadmin protection, enforced as a BEFORE UPDATE trigger (not only inside
-- admin_set_active/admin_set_user_role) so the guard also covers profiles_update_self_superadmin's
-- own raw-UPDATE path (a superadmin editing their own row in Settings -> Profile), never just the
-- RPC callers. Fires only when the row being changed is itself the last active superadmin and the
-- update would remove that status (role away from superadmin, or active -> false).
create or replace function public.enforce_last_active_superadmin()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if old.role = 'superadmin' and old.active = true
     and (new.role <> 'superadmin' or new.active = false)
  then
    if (
      select count(*) from public.profiles
      where role = 'superadmin' and active = true and id <> old.id
    ) = 0 then
      raise exception 'Cannot remove or deactivate the last active superadmin.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists profiles_protect_last_superadmin on public.profiles;
create trigger profiles_protect_last_superadmin
  before update on public.profiles
  for each row
  execute function public.enforce_last_active_superadmin();
