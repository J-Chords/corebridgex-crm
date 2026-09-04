-- Correction hygiene — the previous migration (20260902130000, already hosted, not edited here)
-- carried forward a real gap from the original 20260902121000_project_templates.sql: `service_role`
-- was granted insert/update/delete on project_templates/project_template_services/
-- project_template_activities but never select. Harmless to app-facing security (the browser client
-- never uses the service_role key; RLS/`authenticated` grants are unaffected either way — service
-- tooling only), but it silently breaks any service-role script or backend job trying to read these
-- tables (discovered live during this correction's own E2E validation cleanup, which needed
-- service-role reads to verify teardown).
grant select on public.project_templates, public.project_template_services, public.project_template_activities to service_role;
