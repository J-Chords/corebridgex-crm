-- Canonical forward-only correction of public.visit_entry_overlaps.
--
-- 20260821160000_phase9_final_integrity_hardening.sql, as originally pushed, treated every Time
-- Entry with `end_time is null` as open-ended into the future. That accidentally included a
-- completed duration-only manual entry (`end_time is null` AND `duration_minutes is not null`),
-- not only a genuinely running timer (`duration_minutes is null`) — a real correctness bug, found by
-- this same hosted overlap probe battery and corrected live via an ad-hoc `create or replace`
-- immediately afterward. 20260821160000's local file has been restored to accurately represent what
-- was actually applied when that migration version first ran remotely (per its own version history);
-- THIS migration is the canonical forward-only record of the correction — no already-applied
-- migration is edited again.
--
-- Final three-way behavior for each Time Entry's effective end, in order:
--   A. `end_time` exists                        -> use it directly.
--   B. `end_time` is null AND `duration_minutes` is null (a genuinely running timer, per the
--      table's own established "running" indicator, `time_entries_one_running_per_user`)
--                                                 -> open-ended (`'infinity'`).
--   C. `end_time` is null AND `duration_minutes` is NOT null (a completed duration-only manual
--      entry — a real, finished span with no specific clock end)
--                                                 -> `start_time + duration_minutes` (its real,
--                                                    implied end — never treated as open-ended).
-- Visit-vs-Visit overlap behavior is unchanged. Forward-only; does not edit 20260821160000 or any
-- earlier migration.

create or replace function public.visit_entry_overlaps(
  p_user_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_exclude_visit_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.visit_entries v
      where v.user_id = p_user_id
        and (p_exclude_visit_id is null or v.id <> p_exclude_visit_id)
        and tstzrange(v.start_at, v.end_at) && tstzrange(p_start, p_end)
    )
    or exists (
      select 1 from public.time_entries te
      where te.user_id = p_user_id
        and tstzrange(
          te.start_time,
          coalesce(
            te.end_time,
            case
              when te.duration_minutes is null then 'infinity'::timestamptz
              else te.start_time + (te.duration_minutes * interval '1 minute')
            end
          )
        ) && tstzrange(p_start, p_end)
    );
$$;

-- Privileges re-asserted explicitly (CREATE OR REPLACE already preserves existing grants, but this
-- is re-stated per the same hardening requirement as 20260821160000): never PUBLIC/anon/authenticated
-- — an ordinary browser session has no legitimate reason to call a cross-user boolean activity
-- oracle directly. The outer create_visit_entry/update_visit_entry RPCs call this internally as
-- their own SECURITY DEFINER owner, so this revoke cannot affect them. No table RLS is touched by
-- this migration.
revoke execute on function public.visit_entry_overlaps(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.visit_entry_overlaps(uuid, timestamptz, timestamptz, uuid) to service_role;
