-- Phase 7D/7E — Notifications extension. `notifications.related_report_id`/
-- `related_client_report_id` were added bare (no FK) in the Phase 7A-C tasks migration because
-- accomplishments_reports/client_reports didn't exist yet. Both tables now exist — add the real
-- FKs. No architecture change: the `type` check constraint already covers all 6 NotificationType
-- values (report-comment/client-report-comment included) from Phase 7A-C, and RLS/grants on
-- notifications are untouched (still no direct INSERT for authenticated — every notification,
-- including the two new comment types, is written by a SECURITY DEFINER RPC).

alter table public.notifications
  add constraint notifications_related_report_id_fkey
  foreign key (related_report_id) references public.accomplishments_reports (id) on delete cascade;

alter table public.notifications
  add constraint notifications_related_client_report_id_fkey
  foreign key (related_client_report_id) references public.client_reports (id) on delete cascade;
