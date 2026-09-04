-- Project Level Part 3 correction — audit proved `contract_start_date`/`contract_months`/
-- `contract_end_date` are genuinely ANNUAL-CONTRACT-TERM semantics (copied 1:1 from
-- companies.contract_start_date/renewal_date at backfill time, extended by `renew_project` for the
-- next contract year, `contract_months` used only to SUGGEST a next term length) — never "planned
-- start/end of this Project's own work." The previous Project Level pass incorrectly relabeled
-- these fields "Start date"/"End date" in the UI merely because the data types matched. This
-- migration adds genuinely NEW, independent columns for the real management concept and leaves the
-- contract-term columns completely untouched, still serving the Renewal feature exactly as before.
alter table public.projects
  add column start_date date,
  add column end_date date;

alter table public.projects add constraint projects_end_date_after_start_date
  check (start_date is null or end_date is null or end_date >= start_date);
