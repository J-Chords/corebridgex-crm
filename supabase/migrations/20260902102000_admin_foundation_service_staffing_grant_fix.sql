-- Admin Foundation acceptance-hardening — found via live testing: the original service staffing
-- migration granted service_role INSERT/UPDATE/DELETE on service_team_leads/service_employees but
-- never SELECT, unlike every other table in this schema. RLS bypass and base table GRANTs are two
-- separate Postgres mechanisms — service_role bypasses RLS, but a missing GRANT still blocks it
-- with a genuine "permission denied for table" error. Confirmed live: a service-role SELECT on
-- either table failed until this fix.
grant select on public.service_team_leads to service_role;
grant select on public.service_employees to service_role;
