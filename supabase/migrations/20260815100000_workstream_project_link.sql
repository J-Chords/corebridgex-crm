-- Phase 8B — Project-aware Workstream (Service) creation.
--
-- Every newly-created Workstream must resolve to a real Project, and its company_id must always
-- match that Project's own company (never independently guessable/settable by the client) —
-- mirrors the existing enforce_task_invariants precedent (forcing tasks.company_id from its own
-- Workstream) at one layer up the chain.
--
-- enforce_workstream_project_link (BEFORE INSERT):
--   - project_id already provided: company_id is forced to match that Project's own company_id
--     (closing the "pass an unrelated company_id" risk entirely — the FK chain wins over
--     whatever the client sent).
--   - project_id omitted (legacy Company-page flow, still used by Supervisor/Superadmin): resolved
--     from company_id ONLY when that Company has exactly one Project, matching today's 1:1
--     backfilled reality. Zero or multiple Projects raises rather than guessing, per the explicit
--     instruction not to silently pick between ambiguous Projects.
--
-- workstreams_insert RLS: the Employee branch now requires can_access_project(project_id) instead
-- of can_access_company(company_id) — Project is the real entry point for Employee-initiated
-- Service creation, and since the trigger fires BEFORE this policy's WITH CHECK is evaluated,
-- project_id is guaranteed resolved by the time it's checked. This still cannot be satisfied by
-- an Employee merely knowing an unrelated company_id: they must be able to
-- can_access_project(project_id), and the trigger has already forced company_id to match that
-- Project regardless of what was submitted.

create function public.enforce_workstream_project_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_project_id uuid;
  matching_project_count int;
  project_company_id uuid;
begin
  if new.project_id is null then
    select count(*), min(id) into matching_project_count, resolved_project_id
    from public.projects where company_id = new.company_id;

    if matching_project_count = 0 then
      raise exception 'Company % has no Project yet — create one before adding a Service.', new.company_id;
    elsif matching_project_count > 1 then
      raise exception 'Company % has more than one Project — a Service must specify which Project it belongs to.', new.company_id;
    end if;
    new.project_id := resolved_project_id;
  end if;

  select company_id into project_company_id from public.projects where id = new.project_id;
  if project_company_id is null then
    raise exception 'Project % not found.', new.project_id;
  end if;
  new.company_id := project_company_id;

  return new;
end;
$$;

create trigger workstreams_enforce_project_link
  before insert on public.workstreams
  for each row execute function public.enforce_workstream_project_link();

revoke execute on function public.enforce_workstream_project_link() from public, anon, authenticated, service_role;

drop policy "workstreams_insert" on public.workstreams;
create policy "workstreams_insert" on public.workstreams
  for insert with check (
    public.is_supervisor() or public.is_superadmin()
    or (public.is_employee() and public.can_access_project(project_id) and lead_user_id = auth.uid())
  );
