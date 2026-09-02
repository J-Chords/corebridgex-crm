-- Admin Foundation Part 12 — Admin editing another user's display name. profiles_update_self_
-- superadmin's own RLS (id = auth.uid()) only ever lets a superadmin edit THEIR OWN row directly,
-- so Editing a different user's name needs its own narrow RPC, mirroring admin_set_active/
-- admin_set_user_role exactly. Name only — email stays read-only in this implementation (Stage 0
-- Correction 6).
create or replace function public.admin_set_full_name(target_id uuid, new_full_name text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if not public.is_superadmin() then
    raise exception 'Only a superadmin can edit another user''s name.';
  end if;
  if trim(new_full_name) = '' then
    raise exception 'Name can''t be empty.';
  end if;
  update public.profiles set full_name = trim(new_full_name) where id = target_id;
  if not found then
    raise exception 'Profile % not found.', target_id;
  end if;
end;
$function$;

revoke all on function public.admin_set_full_name(uuid, text) from public, anon;
grant execute on function public.admin_set_full_name(uuid, text) to authenticated, service_role;
