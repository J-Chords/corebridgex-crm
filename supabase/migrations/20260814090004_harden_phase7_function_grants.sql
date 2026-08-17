-- Phase 7 follow-up — explicit function EXECUTE hardening for every function introduced in this
-- migration set (20260814090000-3).
--
-- DISCOVERED DURING VERIFICATION: despite Foundation C's `ALTER DEFAULT PRIVILEGES FOR ROLE
-- postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM public, anon, authenticated,
-- service_role`, every one of the Phase 7 functions still ended up with an implicit PUBLIC
-- EXECUTE grant (confirmed via raw `proacl` inspection — e.g. `{=X/postgres, postgres=X/postgres,
-- authenticated=X/postgres, service_role=X/postgres}`, where the empty-grantee `=X` entry is
-- PostgreSQL's own built-in "every new function grants EXECUTE to PUBLIC" factory default for
-- CREATE FUNCTION — evidently NOT overridden by the default-privilege REVOKE the way the table/
-- sequence defaults were). Since PUBLIC membership is automatic for every role including `anon`,
-- this meant `anon`/`authenticated` had EXECUTE on every Phase 7 function purely by being members
-- of PUBLIC, regardless of the narrower grants already issued to `authenticated`/`service_role`
-- specifically. Fixed the same explicit way Foundation C fixed the original 9 functions: revoke
-- from PUBLIC directly on every affected function, per-function, rather than trusting the
-- default-privilege mechanism for functions going forward.
--
-- No behavior change for `authenticated`/`service_role` — they keep exactly the EXECUTE grants
-- already issued in the preceding four migrations. This migration only removes the previously
-- undetected PUBLIC (and therefore anon) access.

revoke execute on function
  public.can_access_workstream(uuid),
  public.can_access_task(uuid),
  public.can_edit_task(uuid),
  public.can_progress_task(uuid),
  public.can_log_time_on_task(uuid),
  public.can_correct_time_entry(uuid),
  public.update_task_status(uuid, text),
  public.toggle_checklist_item(uuid, boolean),
  public.notify_task_created(uuid, uuid[], boolean),
  public.notify_task_assignment_changed(uuid, uuid[]),
  public.mark_all_notifications_read(),
  public.start_timer(uuid),
  public.stop_timer(uuid),
  public.pause_timer(uuid),
  public.resume_timer(uuid),
  public.create_manual_time_entry(uuid, timestamptz, timestamptz, int, text, boolean),
  public.correct_time_entry(uuid, int, text),
  public.enforce_workstream_service_requirement(),
  public.enforce_workstream_activity_service_match(),
  public.enforce_task_invariants()
from public, anon;

-- Re-assert the intended authenticated/service_role grants explicitly, so this migration is a
-- complete, self-contained statement of the final intended state rather than a bare revoke that
-- depends on reading the prior migrations to know what should remain.
grant execute on function public.can_access_workstream(uuid) to authenticated, service_role;
grant execute on function public.can_access_task(uuid) to authenticated, service_role;
grant execute on function public.can_edit_task(uuid) to authenticated, service_role;
grant execute on function public.can_progress_task(uuid) to authenticated, service_role;
grant execute on function public.can_log_time_on_task(uuid) to authenticated, service_role;
grant execute on function public.can_correct_time_entry(uuid) to authenticated, service_role;
grant execute on function public.update_task_status(uuid, text) to authenticated, service_role;
grant execute on function public.toggle_checklist_item(uuid, boolean) to authenticated, service_role;
grant execute on function public.notify_task_created(uuid, uuid[], boolean) to authenticated, service_role;
grant execute on function public.notify_task_assignment_changed(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.mark_all_notifications_read() to authenticated, service_role;
grant execute on function public.start_timer(uuid) to authenticated, service_role;
grant execute on function public.stop_timer(uuid) to authenticated, service_role;
grant execute on function public.pause_timer(uuid) to authenticated, service_role;
grant execute on function public.resume_timer(uuid) to authenticated, service_role;
grant execute on function public.create_manual_time_entry(uuid, timestamptz, timestamptz, int, text, boolean) to authenticated, service_role;
grant execute on function public.correct_time_entry(uuid, int, text) to authenticated, service_role;

-- The three trigger functions get no grant at all (matches handle_new_user's precedent) — a
-- trigger fires via the table event system, not a role explicitly calling the function, so no
-- role (not even authenticated/service_role) ever needs direct EXECUTE on these three.
