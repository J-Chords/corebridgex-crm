-- Phase 7D, part 1 — Notes. Maps to src/lib/data/types/note.ts's `Note`.
--
-- Exactly one of company_id/task_id is ever set (never both, never neither) — a hard invariant
-- in the mock (each provider method fixes exactly one parent), enforced here with a CHECK rather
-- than a polymorphic parent_type/parent_id design, since the app itself only ever has two
-- concrete parent kinds and two concrete provider methods (listNotesForTask/listNotesForCompany).
-- Notes are append-only: no updated_at, no UPDATE/DELETE grant, no update/delete provider method.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null references public.companies (id) on delete cascade,
  task_id uuid null references public.tasks (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  type text not null check (type in ('call', 'meeting', 'internal', 'decision')),
  body text not null,
  created_at timestamptz not null default now(),
  constraint notes_exactly_one_parent check (num_nonnulls(company_id, task_id) = 1)
);

create index notes_company_id_idx on public.notes (company_id);
create index notes_task_id_idx on public.notes (task_id);

comment on table public.notes is
  'Append-only. Exactly one of company_id/task_id is set — see notes_exactly_one_parent. Visible to anyone who can access the parent Task/Company (can_access_task / can_access_company), matching mock-notes-provider.ts exactly.';

-- ---------------------------------------------------------------------------
-- RLS. SELECT/INSERT mirror the parent object's own visibility exactly — no separate
-- "can write a note" gate exists in the mock beyond "can see the parent," so none is added here.
-- No UPDATE/DELETE policy or grant at all (append-only, matches current behavior).
-- ---------------------------------------------------------------------------
alter table public.notes enable row level security;

create policy "notes_select" on public.notes
  for select using (
    (task_id is not null and public.can_access_task(task_id))
    or (company_id is not null and public.can_access_company(company_id))
  );

create policy "notes_insert" on public.notes
  for insert with check (
    author_id = auth.uid()
    and (
      (task_id is not null and public.can_access_task(task_id))
      or (company_id is not null and public.can_access_company(company_id))
    )
  );

grant select, insert on public.notes to authenticated;
grant select, insert, update, delete on public.notes to service_role;
