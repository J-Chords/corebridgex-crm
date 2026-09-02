-- Admin Foundation Part 3 — first-login forced password change.
--
-- An Admin-created user gets a real initial password chosen by the Admin; must_change_password
-- marks that they must set their own password before normal access. Existing users default to
-- false (never retroactively forced through the gate). complete_required_password_change() is
-- self-only (auth.uid()) and is the ONLY way to clear the flag from the client, and only after
-- AuthProvider.changePassword has already confirmed auth.updateUser({password}) succeeded — never
-- clear it first. admin_set_must_change_password is the Admin-only re-arm path (e.g. after an
-- Admin-driven password reset, the user must change it again).

alter table public.profiles
  add column must_change_password boolean not null default false;

create or replace function public.complete_required_password_change()
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  update public.profiles set must_change_password = false where id = auth.uid();
  if not found then
    raise exception 'Profile not found for current user.';
  end if;
end;
$function$;

create or replace function public.admin_set_must_change_password(target_id uuid, new_value boolean)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin can set this flag.';
  end if;
  update public.profiles set must_change_password = new_value where id = target_id;
  if not found then
    raise exception 'Profile % not found.', target_id;
  end if;
end;
$function$;

revoke all on function public.complete_required_password_change() from public, anon;
grant execute on function public.complete_required_password_change() to authenticated, service_role;
revoke all on function public.admin_set_must_change_password(uuid, boolean) from public, anon;
grant execute on function public.admin_set_must_change_password(uuid, boolean) to authenticated, service_role;
