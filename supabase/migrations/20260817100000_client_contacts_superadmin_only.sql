-- Phase 8B final hardening pass — Client Contacts administrative boundary.
--
-- The previous hotfix (20260816100000) correctly closed the Employee-readable gap by narrowing
-- client_contacts_select to Supervisor-or-Superadmin. Revisiting against the now-explicitly-locked
-- product principle: Supervisor's extra privileges over Employee are TEAM/operational privileges
-- (their own + their direct reports' work), never Company *administration* — and Client Contacts
-- are Company administrative data, not operational work data. Nothing in the current product docs
-- gives Supervisor a specific need to read or write Contacts; the Company admin page that displays
-- them is Superadmin-only per Phase 8B's own route guard, and Supervisor never reaches it. Narrowing
-- both policies to Superadmin-only closes this without any functional loss.
--
-- client_contacts_write was already Supervisor-or-Superadmin (from Foundation A) — narrowed here
-- too, since a Supervisor could otherwise still INSERT/UPDATE/DELETE Contacts directly via the API
-- despite having no UI path to do so, which is the same "narrow the boundary, don't just hide the
-- button" discipline this whole phase has followed.
--
-- Project UI still resolves the minimum Company identity it actually needs (name, for the Services
-- tab / "+ Add Service" dialog) via `companies_select`'s own can_access_company(id) policy, which
-- this migration does not touch — only Contacts are narrowed further than Company itself.

drop policy "client_contacts_select" on public.client_contacts;
create policy "client_contacts_select" on public.client_contacts
  for select using (public.is_superadmin());

drop policy "client_contacts_write" on public.client_contacts;
create policy "client_contacts_write" on public.client_contacts
  for all using (public.is_superadmin()) with check (public.is_superadmin());
