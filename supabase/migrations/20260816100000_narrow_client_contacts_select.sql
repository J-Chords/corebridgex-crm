-- Phase 8B acceptance hotfix — Section 13 verification found a real gap, closed here.
--
-- `client_contacts_select` has always been `can_access_company(company_id)`, with no role gate of
-- its own (unlike `client_contacts_write`, which was already Supervisor/Superadmin-only). Phase 8B
-- extended `can_access_company` with two new EXISTS branches (Project ownership, Project
-- membership) so an Employee/Supervisor Project member without a `user_companies` row could still
-- resolve their own Project's Company *name* for the Services tab / "+ Add Service" dialog — but
-- since `client_contacts_select` piggybacks on that exact same function, the same broadened access
-- also newly lets that Employee read the Company's real Contacts (name/title/email/phone) via a
-- direct API call, even though no Employee-facing screen ever requests or displays them. This is
-- exactly the "do not solve Project-name hydration by broadly exposing Contacts" risk the phase's
-- own acceptance review flagged for explicit verification.
--
-- Fix: narrow client_contacts_select to the same Supervisor/Superadmin role gate
-- client_contacts_write already has. No functional loss — no Employee-facing surface reads Contacts
-- today (the Company admin page that displays them is Superadmin-only per Phase 8B's own route
-- guard), so this closes real exposure without touching anything currently in use.

drop policy "client_contacts_select" on public.client_contacts;
create policy "client_contacts_select" on public.client_contacts
  for select using ((public.is_supervisor() or public.is_superadmin()) and public.can_access_company(company_id));
