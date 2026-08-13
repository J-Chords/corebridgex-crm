-- Foundation C — explicit least-privilege grants + function execution hardening.
--
-- WHY THIS EXISTS: Supabase's platform pre-configures ALTER DEFAULT PRIVILEGES for role
-- `postgres` in schema `public` so that any table/function/sequence created by `postgres`
-- (the role our migrations run as) automatically grants anon/authenticated/service_role far
-- more than any migration in this repo ever asked for — tables got `arwdDxtm` (full CRUD +
-- TRUNCATE + REFERENCES + TRIGGER + MAINTAIN), functions got EXECUTE via PUBLIC, sequences got
-- SELECT/UPDATE/USAGE. Every earlier migration's own `grant select ...`/`grant execute ...`
-- statement was additive on top of that already-broad default, not a replacement for it — so
-- the narrower grants were harmless but insufficient. This migration does not change any RLS
-- policy and does not touch data; it only changes the coarser table/function privilege layer
-- that sits underneath RLS, to match least-privilege intent before real Auth begins.
--
-- Scope: schema public only, the 7 existing application tables and 9 existing functions, plus
-- default privileges for role postgres in schema public (so future objects don't silently
-- inherit the same broad defaults). No Supabase-managed schema is touched.

-- ---------------------------------------------------------------------------
-- 1. Revoke existing overly-broad table privileges (clean slate), including whatever
--    column-level grants exist — the explicit grants below re-add exactly what's needed.
-- ---------------------------------------------------------------------------
revoke all on table
  public.profiles,
  public.brands,
  public.service_lines,
  public.companies,
  public.client_contacts,
  public.company_service_lines,
  public.user_companies
from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Explicit table privilege matrix.
-- ---------------------------------------------------------------------------

-- anon: intentionally receives nothing on any of the 7 tables (no GRANT statement for anon
-- appears anywhere below). All data access requires an authenticated session.

-- profiles — table-wide SELECT, but UPDATE only on the two columns the app actually lets a
-- superadmin edit on their own row. role/supervisor_id/active stay reachable only via the
-- SECURITY DEFINER admin_* RPCs (see function grants below), never via ordinary UPDATE.
grant select on public.profiles to authenticated;
grant update (full_name, email) on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

-- brands / service_lines — read-only reference data for authenticated; no app codepath writes
-- either table.
grant select on public.brands to authenticated;
grant select, insert, update, delete on public.brands to service_role;

grant select on public.service_lines to authenticated;
grant select, insert, update, delete on public.service_lines to service_role;

-- companies — CompaniesProvider has createCompany/updateCompany but no delete path (soft-delete
-- via `active` only), so no DELETE for authenticated.
grant select, insert, update on public.companies to authenticated;
grant select, insert, update, delete on public.companies to service_role;

-- client_contacts — CompaniesProvider has createContact/updateContact but no delete path, so no
-- DELETE for authenticated.
grant select, insert, update on public.client_contacts to authenticated;
grant select, insert, update, delete on public.client_contacts to service_role;

-- company_service_lines — mock-companies-provider.ts's syncServiceLines always fully replaces a
-- company's rows (delete this company's rows, reinsert the new set) and never row-edits in
-- place, so authenticated needs SELECT/INSERT/DELETE but not UPDATE.
grant select, insert, delete on public.company_service_lines to authenticated;
grant select, insert, update, delete on public.company_service_lines to service_role;

-- user_companies — mirrors syncAssignedStaff's same delete-then-reinsert shape; no codepath
-- updates a user_companies row in place, so no UPDATE for authenticated.
grant select, insert, delete on public.user_companies to authenticated;
grant select, insert, update, delete on public.user_companies to service_role;

-- ---------------------------------------------------------------------------
-- 3. Explicit function execution model.
--
-- Every function below was created with `security definer`, so ordinary callers never need
-- direct table access to use them — only EXECUTE. Revoking EXECUTE from PUBLIC removes the
-- implicit access anon/authenticated/service_role all inherited by virtue of being members of
-- PUBLIC; the grants that follow re-add exactly what each role needs.
--
-- handle_new_user() is invoked exclusively by the `on_auth_user_created` trigger on
-- auth.users. Trigger firing does not require the triggering statement's role to hold EXECUTE
-- on the trigger function — trigger invocation goes through the table event system, not a
-- role-mediated function call — so revoking EXECUTE here does not break onboarding.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.is_superadmin(),
  public.is_supervisor(),
  public.is_employee(),
  public.manages_user(uuid),
  public.can_access_company(uuid),
  public.handle_new_user(),
  public.admin_set_user_role(uuid, text),
  public.admin_set_supervisor(uuid, uuid),
  public.admin_set_active(uuid, boolean)
from public, anon, authenticated, service_role;

-- authenticated: the RLS helper functions (referenced inside policies evaluated as this role)
-- and the three admin RPCs (which independently re-check is_superadmin() internally — EXECUTE
-- privilege is only a coarse "can attempt to call" gate, never the authorization boundary
-- itself). handle_new_user is deliberately excluded — no role should call it directly.
grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.is_supervisor() to authenticated;
grant execute on function public.is_employee() to authenticated;
grant execute on function public.manages_user(uuid) to authenticated;
grant execute on function public.can_access_company(uuid) to authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.admin_set_supervisor(uuid, uuid) to authenticated;
grant execute on function public.admin_set_active(uuid, boolean) to authenticated;

-- service_role: trusted server-side/admin infrastructure — same 8 functions as authenticated,
-- also excluding handle_new_user (trigger-only, no direct caller needed, by any role).
grant execute on function public.is_superadmin() to service_role;
grant execute on function public.is_supervisor() to service_role;
grant execute on function public.is_employee() to service_role;
grant execute on function public.manages_user(uuid) to service_role;
grant execute on function public.can_access_company(uuid) to service_role;
grant execute on function public.admin_set_user_role(uuid, text) to service_role;
grant execute on function public.admin_set_supervisor(uuid, uuid) to service_role;
grant execute on function public.admin_set_active(uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Default privileges — scoped to role postgres, schema public, only. Future
--    tables/functions/sequences created by postgres in public no longer automatically become
--    available to anon/authenticated/service_role; a future migration must GRANT explicitly.
--    Supabase-managed schemas/roles (e.g. supabase_admin's own defaults) are untouched.
-- ---------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
