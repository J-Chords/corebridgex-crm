# Database & Supabase

## Hosted vs. local — don't confuse the two

`supabase/config.toml` is the **local Supabase CLI dev-stack config** (`supabase start`) — its `site_url = "http://127.0.0.1:3000"` and `127.0.0.1` ports are local-only defaults, not the hosted project's actual settings. The **hosted** Supabase project's real configuration (Auth Site URL, redirect URLs, production connection details) lives in the Supabase Dashboard, outside this repo, and is **not verifiable from repository evidence alone**. If you need to confirm hosted Auth settings, check the Dashboard directly — don't infer them from `config.toml`.

## Migration workflow

Migrations live in `supabase/migrations/`, applied **manually** against the hosted project (there is no CI/CD automation — see `deployment.md`). The established pattern for a hosted change, followed throughout this project's history: write the migration → apply it directly against hosted → verify parity (local migration list matches what's actually applied) → verify the specific guarantee it introduces, often via a rollback-only transaction proof against hosted before trusting it live.

**Known gotcha**: a migration's own header comment can go stale. Two 2026-09-11 migrations (`20260911090000_workstream_lifecycle_and_duplicate_prevention.sql`, `20260911100000_archived_workstream_task_guard.sql`) still say **"NOT YET APPLIED TO THE HOSTED PROJECT"** in their own file header — but both were in fact applied and verified against hosted Supabase during CD-162's final deployment (see `current-state.md`). Nobody went back to edit the comment after deploying. **Don't trust a migration file's header as a live status indicator** — check `current-state.md` or query the hosted schema directly.

## RLS pattern

See `authorization.md`'s RLS section for the two-tier pattern (direct-grant-plus-RLS-policy for simple CRUD vs. `SECURITY DEFINER` RPC-only for complex/stateful mutations). The RPC pattern is used specifically where an operation is genuinely sequential/stateful and needs atomicity — e.g. the one-active-timer-per-user rule, pause/resume chains, multi-table Project+Members creation, or a delete that must check several dependency tables under a row lock.

## Migration history (chronological, one line each)

Grouped loosely by theme; exact filenames below. Reference this table when trying to find "which migration introduced X" rather than grepping the raw SQL.

### Foundation
- `20260813130856_extensions.sql` — enables `pgcrypto`
- `20260813130857_profiles.sql` — `profiles` table (maps to `User`); role/active/supervisor_id locked behind admin RPCs
- `20260813130858_reference_data.sql` — read-only `brands`/`service_lines`
- `20260813130859_companies.sql` — `companies`/`client_contacts`/`company_service_lines`/`user_companies`
- `20260813162744_harden_public_grants.sql` — revokes Supabase's overly-broad default grants

### Operational core (Phase 7)
- `20260814090000_workstreams.sql` — `workstreams` table
- `20260814090001_activity_catalog.sql` — `departments`/`activities`
- `20260814090002_tasks.sql` — `tasks`/`task_assignees`/`checklist_items`/`notifications`
- `20260814090003_time_entries.sql` — `time_entries`/`time_entry_corrections`, one-running-timer-per-user constraint, all mutation via RPC
- `20260814090004`–`20260814090005` — grant hardening, demo seed
- `20260814100000_hotfix_workstream_task_visibility.sql` — lets a task assignee read their parent workstream
- `20260814110000`–`20260814110009` — Notes, Task Handoffs, Saved Views, Templates, **Daily Updates** (`daily_updates`, real `UNIQUE(user_id, date)`), Accomplishments/Client Reports, notification wiring, assignee-scope hardening, demo seed
- `20260814120000`–`20260814120001` — profile-directory RPC, Employee self-led Workstream creation

### Project module
- `20260815090000_projects.sql` — `projects`/`project_members`
- `20260815090001`–`20260816100000` — backfill, Project-Company access link, creation-RPC visibility fixes, Client Contacts narrowing
- `20260817090000`–`20260819090000` — creation-RPC hardening, Activity Catalog expansion, Task-Activity auto-enable, Project admin RPCs

### Reports hardening
- `20260820090000`–`20260820130000` — Client Report project-scoping, generation RPCs, finalize-authorization fixes, destructive-action scoping

### Daily Update review, Visit Entries, Client Report scheduling
- `20260821090000`–`20260821100000` — Team Lead review tracking + guard against re-reviewing
- `20260821110000`–`20260821200000` — weekly evidence RPC, orthogonal reporting-review capability, Visit Entries (anti-double-count vs. Time Entries), Visit reporting integration, Client Report schedules (pg_cron), integrity hardening, Planned→Completed Visit workflow
- `20260821190000_one_level_subtasks.sql` — added Subtask hierarchy (**later fully removed**, see below)
- `20260821200000`–`20260821210000` — Subtask-hierarchy authorization hardening (also later removed)

### Task/Checklist refinements
- `20260826090000_add_task_checklist_item.sql`
- `20260827090000_task_start_date.sql` — **marked "LOCAL / UNAPPLIED"** in its own header, i.e. not confirmed applied to hosted; verify before relying on it there
- `20260828090000`–`20260828110000` — Activity creation from Task form, `delete_task` RPC (first Task delete capability), Supervisor mutation-scope hardening

### Documents
- `20260831090000_documents_foundation.sql` — `documents` table (Project Documents + Task Attachments unified)
- `20260831100000`, `20260901090000`, `20260901100000` — delete-blocker, upload-metadata hotfix, direct-task-authority hotfix

### Admin Foundation
- `20260902090000`–`20260902102000` — active-status hardening on role helpers, forced password change, global Service staffing tables (`service_team_leads`/`service_employees`), `is_current_user_active()` canonical helper, staffing-visibility/grant fixes

### Project Level
- `20260902110000`–`20260902140000` — Project lifecycle metadata, Project Groups, Project Comments (extended to Task/Document targets), Project Issues, Trash-retention setting, Project Templates redesign (service-recipe bundles), Brand-optional

### Service/Activity catalog maturity
- `20260904090000`–`20260904170000` — lead-reassignment hardening, Superadmin-only Activity creation, real Admin-managed Service/Activity catalog with lifecycle RPCs and uniqueness constraints

### Task Level Phase 1 (the big one) + Project lifecycle restoration
- `20260907090000_workstream_edit_superadmin_only.sql` — removes Team Lead's general Service-edit authority
- `20260908090000_task_status_model_phase1.sql` — **the current canonical 6-status Task model**, `statusReason` required for Waiting/Blocked
- `20260908100000`–`20260908120000` — delete-history blockers, Handoff/Task-Notes creation retirement, legacy-reason-compat bypass
- `20260908130000_remove_subtask_architecture.sql` — **removes the Subtask hierarchy entirely.** *"THERE ARE NO SUBTASKS IN COREBRIDGE X."*
- `20260908140000`–`20260908150000` — Project lifecycle hardening, then full restoration of the 5-state model with a dedicated `archived_at` column distinct from `completion_date`

### Most recent (CD-162)
- `20260910090000_employee_service_activity_authorization_parity.sql` — closes 3 hosted gaps letting an Employee-as-lead add a Service or configure Activities. **Applied to hosted.**
- `20260911090000_workstream_lifecycle_and_duplicate_prevention.sql` — one-active-Service-per-catalog-Service-Line-per-Project. **Applied to hosted** (despite stale header — see above).
- `20260911100000_archived_workstream_task_guard.sql` — blocks assigning a Task onto an archived Service. **Applied to hosted** (despite stale header — see above).

CD-190 (Team Activity merge + local-date fix) introduced **no migration at all** — it's a pure application-layer change, fully compatible with the schema as it stood after CD-162.

## Required environment variables (names only — never values)

| Variable | Required when |
|---|---|
| `NEXT_PUBLIC_DATA_PROVIDER` | Always (selects the provider mode; defaults to `mock`) |
| `NEXT_PUBLIC_SUPABASE_URL` | `supabase-auth`, `supabase-core`, or `supabase` mode |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same as above (safe to expose to the browser by design — it's the anon/publishable key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Only for Admin user-management Server Actions (`src/app/dashboard/admin/actions.ts`) — server-only, never `NEXT_PUBLIC_`-prefixed, never logged |

`.env.example` documents these with no real values; copy it to `.env.local` (gitignored — confirmed not tracked) and fill in real values there.
