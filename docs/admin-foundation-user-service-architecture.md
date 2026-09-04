# Admin Foundation — User / Role / Service Responsibility Architecture

**Status: ADMIN FOUNDATION — FINAL ACCEPTED / COMPLETE.** Manual UI acceptance has PASSED. A final
polish pass (password reveal/hide, "Services Led"/"Works In Services" terminology, Admin Service
staffing filters, Admin Users Services-column distinction) was applied and validated, then this
checkpoint was committed and pushed — see the git log for the exact commit hash. This document (and
`docs/current-project-state.md`) is the durable record; Phase 14C and the Project-level module both
build forward from this checkpoint.

**Acceptance-hardening pass (same day, before manual UI acceptance)**: an audit found the initial
deactivation fix was necessary but not sufficient (see "Deactivation hardening" below for the full
finding and fix); also fixed: `useAdminUsers`/`useServiceStaffing` no longer fire an Admin-only
provider call before a Team Lead/Employee's direct-URL redirect completes (was producing an
unhandled promise rejection); `MultiSelect` now uses `useId()` instead of a hardcoded DOM id
(multiple instances on one page no longer collide); its own doc comment corrected to not claim
"never renders all options" when an empty search does exactly that inside the popover.

**Final polish pass (this checkpoint)**:
- **Password reveal/hide**: one reusable `PasswordInput` (`src/components/ui/password-input.tsx`,
  wrapping `FloatingLabelInput`'s new `endAdornment` slot) — an Eye/EyeOff toggle button
  (`aria-label="Show password"`/`"Hide password"`, `type="button"`, never submits the form) applied
  to every password field in the app: login, Admin Create User's initial password, Admin Reset
  Password, `/change-password` (both fields), and Settings' own (still-inert) change-password form.
  No package added.
- **"Services Led" / "Works In Services"**: the Admin Create/Edit User dialog's two Service
  MultiSelects were previously labeled "Leads Services"/"Services" — ambiguous. Relabeled to
  "Services Led" (helper: "Services this Team Lead is responsible for across all Projects.") and
  "Works In Services" (helper: "Services where this user participates as an operational team
  member."). Employee shows only "Works In Services"; Admin shows neither — unchanged from before,
  this was a labeling-only fix. The two underlying relationships (`service_team_leads`/
  `service_employees`) were already independent and remain so — a Team Lead may lead a Service
  without working in it, work in a Service without leading it, both, or neither.
- **Admin Service staffing filters**: `/dashboard/admin/services` gained a Team Lead filter (all,
  or one active Team Lead — selecting a person shows only Services they lead), an Employee/member
  filter (same, against `service_employees`), and a Staffing filter (All / No Team Lead / No
  Employees / Fully unstaffed), all combining with AND alongside the existing Service-name search.
  Clear "No Services match your filters." empty state.
- **Admin Users Services-column distinction**: the column previously unioned leadership and
  membership into one flat comma list. Now shows up to two labeled lines ("Led: …" / "Works in: …"),
  omitting whichever is empty, with the full list also available via the native `title` tooltip —
  never presents the two relationships as though they were the same thing.

### Implementation facts (this pass)

- **Role terminology**: visible labels Admin/Team Lead/Employee (`src/lib/data/role-labels.ts`);
  technical DB values `superadmin`/`supervisor`/`employee` unchanged everywhere. Every raw
  role-display bypass found in the Turn-12 audit was routed through `ROLE_LABELS`.
- **User creation**: Admin picks full name/email/initial password/role (+ optional Service
  staffing); `auth.admin.createUser` runs server-side only (`src/app/dashboard/admin/actions.ts`),
  with compensating cleanup (delete only the just-created Auth user) if any follow-up step fails.
- **First-login password change**: `profiles.must_change_password` (default false; true for every
  Admin-created account and re-armed on Admin password reset); `AuthProvider.changePassword`
  updates the real password first, only then clears the flag; `/change-password` is a standalone
  application-level gate wired into `DashboardLayout`, not into `src/proxy.ts`.
- **Global Service staffing**: new `service_team_leads`/`service_employees` tables (composite PK,
  no Project/Workstream id column, Admin-write-only RLS, DB-enforced role-eligibility triggers —
  Team Lead restricted to active `supervisor`, Employee membership to active `employee`/`supervisor`,
  never `superadmin`). Both optional at creation; multi-Service and multi-Team-Lead cardinality
  supported; visible org-wide via `select using (true)`.
- **Role-change cleanup**: enforced inside `admin_set_user_role` itself (DB-authoritative, not
  UI-only) exactly per Stage 0 Corrections 3/4 — Team Lead→Employee deletes leadership only, never
  auto-converts to membership; anything→Admin deletes both; Employee→Team Lead and Admin→anything
  add nothing automatically (only explicit UI selections do).
- **Admin protection**: the last active Admin can never be demoted or deactivated — enforced by a
  `BEFORE UPDATE` trigger on `profiles` (`enforce_last_active_superadmin`), not just inside the
  RPCs, so it also covers the existing self-edit RLS path.
- **Deactivation hardening — two passes, both required**:
  1. `20260902090000_admin_foundation_active_status_hardening.sql` — `is_superadmin()`/
     `is_supervisor()`/`is_employee()`/`manages_user()` never checked `profiles.active`. Fixed
     (mirrored in mock `permissions.ts`). **This alone was proven NOT sufficient** — an acceptance
     audit found many policies/helpers/RPCs gate access via a raw `<column> = auth.uid()` ownership
     check that never calls any of those four functions at all.
  2. `20260902100000_admin_foundation_deactivation_completeness_hardening.sql` +
     `20260902101000_..._service_staffing_visibility_hardening.sql` — a new canonical
     `is_current_user_active()` helper, composed into every read/write authorization entry point
     that had a raw self-check: `can_access_company`/`can_access_project`/`can_access_workstream`/
     `can_access_task`/`can_edit_task`/`can_progress_task`/`can_log_time_on_task`/
     `can_user_access_company`/`can_user_access_task`/`has_reporting_review_access`/
     `can_view_accomplishments_report`/`can_view_client_report`, plus 14 leaf RPCs with their own
     raw owner check (`acknowledge_task_handoff`, `pause_timer`/`stop_timer`, visit/daily-update/
     accomplishments-report/client-report mutation RPCs), plus the RLS policies for
     `time_entries`/`time_entry_corrections`/`visit_entries`/`notifications`/`saved_views`/
     `service_team_leads`/`service_employees` (the last two initially left `using (true)`, then
     corrected — Service staffing is personnel data, not a bare reference catalog). A grant-only
     bug found during live testing (`service_role` had INSERT/UPDATE/DELETE but never SELECT on the
     two staffing tables) was fixed in `20260902102000_..._grant_fix.sql`.

  **Precise guarantee, proven live** (real disposable Auth session, deactivated mid-session, no
  re-login): the SAME already-authenticated session immediately loses `is_current_user_active()`
  (true→false), loses `can_access_company` for even the always-visible Internal company, loses
  SELECT on its own previously-inserted `saved_views` row (confirmed still physically present via
  a service-role read — an RLS block, not data loss), and cannot INSERT a new one. Reactivating the
  same profile (same session, no new login) restores all three immediately. By composition, this
  same guarantee now covers Project/Task/Workstream/Notes/Documents/Time/Reports/Team
  Updates/Visits/Service-staffing-visibility — every one of those now bottoms out in either
  `is_current_user_active()` or an already-hardened `manages_user()`/`is_superadmin()`/
  `is_supervisor()`/`is_employee()`.

  **Explicit, deliberate exception**: `profiles_select`'s own `id = auth.uid()` branch is
  untouched — a deactivated user's client must still be able to read their own profile row (to
  learn `active=false` and cleanly log out / be gated). `complete_required_password_change()` is
  also untouched (self-only, mutates no operational data). `service_lines`/`brands`/`activities`/
  `departments`/`templates`/`template_tasks`/`template_checklist_items` remain `using (true)` —
  bare name/definition catalogs with no personnel-identifying data, the concrete architectural
  reason they're exempt.

  **Known, accepted limitation of the last-active-Admin test**: the `enforce_last_active_superadmin`
  trigger counts *every* active superadmin in the table, including the real production Admin —
  which means the negative case ("the actual last admin is refused") is structurally impossible to
  reproduce live using only disposable identities, short of deactivating the real Admin (explicitly
  never done). That negative case is proven instead at the source-code level (live trigger
  read-back) and via the mock-mirrored probe suite's isolated in-memory scenario; the positive case
  (a non-last admin can legitimately be changed) was proven live.
- **Authorization non-broadening**: Service staffing is staffing/organizational data only for this
  pass — it does not appear in `can_access_company`/`can_access_project`/`can_access_workstream`/
  `can_access_task`/`can_access_task_directly`/`can_edit_task`/`can_progress_task`/Documents/Time/
  Reports, all of which are unchanged. This is an explicit SAFE STAGING RULE, not a permanent
  decision (see Section 15).
- **Email**: read-only after creation this slice ("Email changes are not available yet" shown in
  the Edit User dialog); no `auth.users`/`profiles` sync attempted.
- **Providers**: new `AdminUsersProvider`/`ServiceMembershipProvider`, mock + Supabase, gated on
  `usesSupabaseData` (same precedent as Documents/Projects/Visit Entries).
- **UI**: `/dashboard/admin/users` and `/dashboard/admin/services`, both Admin-only (redirect on
  direct URL access by Team Lead/Employee); a new reusable `MultiSelect` component
  (`src/components/ui/multi-select.tsx`), intended for future Task-assignee reuse; no hard Delete
  User action anywhere.
- **Migrations** (all forward-only, applied hosted, live-read-back confirmed, zero pending):
  `20260902090000_admin_foundation_active_status_hardening.sql`,
  `20260902091000_admin_foundation_password_change.sql`,
  `20260902092000_admin_foundation_service_staffing.sql`,
  `20260902094000_admin_foundation_set_full_name.sql`,
  `20260902100000_admin_foundation_deactivation_completeness_hardening.sql`,
  `20260902101000_admin_foundation_service_staffing_visibility_hardening.sql`,
  `20260902102000_admin_foundation_service_staffing_grant_fix.sql`.
- **Probes**: 37 mock security/provider probes + 48 live hosted acceptance assertions (real
  disposable Auth users, real sessions, real Auth Admin API calls), all passing. Both throwaway
  scripts deleted after running; zero leftover disposable Auth users/profiles/staffing rows
  confirmed via a live `auth.users` count query after cleanup.
- **Live Auth Admin test**: `SUPABASE_SERVICE_ROLE_KEY` is present in `.env.local` — **executed**.
  Covered live: Admin creates a Team Lead with zero Services (profile/role/`must_change_password`
  all correct); one Team Lead assigned to two Services; one Service assigned two Team Leads; first
  password-change flow (real `auth.updateUser` then `complete_required_password_change`, new
  password verified to actually work); the core existing-session deactivation proof (see above);
  reactivation restores access on the same session; Admin password reset re-arms the forced-change
  flag and the new temporary password works; Team Lead→Employee→Admin role-cleanup transitions
  (leadership rows removed with no auto-conversion, then explicit membership added, then removed
  again on the Admin transition); a non-last Admin can legitimately be demoted. A real grant bug
  (`service_role` missing SELECT on the two staffing tables) was found and fixed during this run.
  Not reproduced live (see the deactivation section above): the actual "last remaining Admin is
  refused" negative case, since the real production Admin always counts toward the trigger's live
  total.
- **Still deferred (at the time of this document)**: Workstream `lead_user_id`/"Created By"
  correction, the Project-Service mutation entry point, and Service-based Team Lead authority all
  remained reserved for the upcoming Service-level correction, per Stage 0 Corrections 1/2/5 —
  untouched in this pass. **Resolved by the Service Level Manual Acceptance pass** (see
  `docs/current-project-state.md`'s "Service Level — Terminology & Authority" section): Lead stays
  distinct from Created By (both now surfaced), lead reassignment is now security-hardened to the
  same eligibility as creation, and Service-based Team Lead/Employee authority remains explicitly
  non-widening — the safe staging rule in Section 15 below was reaffirmed, not changed.

## Stage 0 corrections (accepted amendments to the original audit)

1. **Project-Service entry point is allowed to mutate, not just link-out.** The original
   recommendation (Section 14, below) proposed a read-only display + a "Manage Payroll Team →" link
   as the *only* acceptable UX. Corrected: the Project-Service configuration UI **may** mutate the
   same global `service_team_leads`/`service_employees` rows directly, as a fourth legitimate entry
   point alongside Create User, Edit User, and global Service management — provided it displays
   explicit copy such as *"These Team Lead and Employee assignments apply to Payroll across all
   Projects."* No Project-specific Team Lead table is ever created either way. This Admin
   implementation does not build the Project-Service UI itself (Correction/Part 18) — only ensures
   the provider layer supports it without a future schema redesign.
2. **Service leadership authorization is a temporary staging rule, not a permanent product
   decision.** The original Section 15 stated Team Lead authority "remains direct-report based" as
   if settled. Corrected: this Admin implementation deliberately does **not** broaden
   `can_access_company`/`can_access_project`/`can_access_workstream`/`can_access_task`/
   `can_access_task_directly`/`can_edit_task`/`can_progress_task`/Documents/Time/Reports/Team Updates
   — that is a **safe staging rule for this pass only**, not a claim about what Service-based Team
   Lead authority will permanently mean. A future, explicitly-approved Project/Service validation
   phase will define that meaning and migrate authorization additively and safely. The current
   `supervisor_id`/`manages_user` security path remains temporarily intact until that transition.
3. **Role-change cleanup is a hard delete of current staffing rows, never an automatic conversion.**
   Team Lead → Employee/Admin deletes `service_team_leads` rows for that user (with an Admin-facing
   warning listing affected Services beforehand where practical) — it never auto-creates
   `service_employees` rows. If Employee-level Service membership is wanted after the role change,
   Admin selects it explicitly. No soft-history table is required for v1.
4. **Admin never needs Service assignment.** Create/Edit Admin does not expose Service selection.
   Any role change *to* Admin removes both `service_team_leads` and `service_employees` rows for that
   user (not just leadership) — an Admin does not remain an invisible Service "member" who could
   silently resurface in a future assignment-suggestion UI.
5. **`workstreams.lead_user_id` is untouched in this implementation.** It remains the real,
   currently-enforced responsibility/security field for one Project's one Service instance;
   `workstreams.created_by` remains the real creator; the two are not the same thing and "Lead" is
   not relabeled "Created By" by a text change. The boss's "Lead → Created By" request is captured
   for the upcoming **Service-level correction** (which will decide whether to retire the visible
   Lead concept, display the real creator via `created_by`, and reconcile per-Workstream
   responsibility with global Team Leads) — not addressed here.
6. **Email is read-only after user creation in this implementation.** No email-change/synchronization
   work (keeping `auth.users.email` and `profiles.email` in sync) is built now. Admin v1 supports:
   create user with email, edit full name, change role, manage Services, deactivate/reactivate, reset
   password. UI copy states plainly that email changes aren't available yet — this is documented as
   explicitly deferred, not silently unsupported.

## 1. Locked business requirements (restated for reference)

- Visible role names: **Admin / Team Lead / Employee**. Technical role values stay
  `superadmin`/`supervisor`/`employee` — exactly three global roles, no fourth.
- Admin creates any of the three roles, supplying full name/email/role/initial password. The new
  user logs in with that password and **must change it** before normal access begins.
- Team Lead ↔ Service is many-to-many, **global** (not per-Project), optional at creation, editable
  later from either the User or the Service side, and from a Project's "add Service" flow (which
  must operate on the same global relationship, never a separate Project-only concept).
- Employee ↔ Service is many-to-many, optional at creation, editable later.
- Existing Service/Activity catalog must be reused, not duplicated.
- Future Task-assignee UI must scale past a "50-user wall of checkboxes" — searchable, multi-select,
  Service-relevant people surfaced first. Not built now; only the data model must support it.
- The approved Project-module direction (Title-only-required creation, optional attributes, statuses
  Active/On Hold/Completed/Canceled/Archived/Trash, future Tasks/Services/Comments/Documents/Time/
  Issues/Members surfaces) is context only — no Project changes here.

## 2. Baseline

HEAD == origin/main == `83eb3aae014ca5785caa7f36f05e554c861a771b`. All 63 existing migrations local
== remote; `db push --dry-run` reports "Remote database is up to date"; zero pending.

## 3. Audit 1 — Current Auth / User Creation

**Confirmed absent** (a genuinely clean slate, not a partial/broken existing feature):
- No service-role Supabase client anywhere in `src/`. `src/lib/supabase/client.ts` and `server.ts`
  both use only the anon/publishable key, and **both already carry an explicit doc comment**
  anticipating this exact gap: *"a real admin-only operation (e.g. the invite-onboarding flow)
  belongs in its own narrowly-scoped server-only module, not here."* No
  `SUPABASE_SERVICE_ROLE_KEY` exists in `.env.example` or anywhere in code.
- `AuthProvider` (`src/lib/data/providers/auth-provider.ts`) exposes exactly four methods —
  `getCurrentUser`/`login`/`logout`/`updateProfile`. No create/invite/reset method exists in the
  contract.
- No Supabase Auth Admin API usage anywhere (`auth.admin.*`, `inviteUserByEmail`,
  `resetPasswordForEmail`, `updateUserById` — zero matches). `src/app/api/` does not exist — zero
  Route Handlers/Server Actions of any kind exist yet for anything.
- `login-form.tsx` states outright: *"This tool is invite-only — accounts are created by an admin,
  there is no self-signup."* No forgot-password/change-password UI exists.
- No user-management UI exists beyond a literal placeholder in
  `src/components/settings/workspace-section.tsx:106-114`: *"A dedicated invite/manage-accounts page
  (`/dashboard/admin/users`) is planned but not built yet."* `canInviteUsers()` already exists in
  `permissions.ts` (superadmin-only) but has zero call sites — an unused, forward-declared hook for
  exactly this feature.

**Confirmed present and directly reusable** — the schema already anticipated this feature more than
expected:
- `profiles` (`supabase/migrations/20260813130857_profiles.sql`) already has `role`, `active`,
  `supervisor_id`. **No password-related column exists** (confirmed by reading the full migration) —
  a new column is genuinely needed.
- A trigger `on_auth_user_created` → `handle_new_user()` already fires on every `auth.users` insert,
  auto-creating a matching `profiles` row (`role='employee'`, `active=true` by default). Its own
  comment already describes the intended mechanism verbatim: *"auth.users gets a row via Supabase
  Auth's admin invite (server-side, service-role key, never in this migration or in browser code) —
  this trigger then creates a minimal matching profile automatically... a superadmin assigns the real
  role/supervisor afterward via `admin_set_user_role`/`admin_set_supervisor`."*
- Three existing `SECURITY DEFINER`, superadmin-gated RPCs already establish the exact pattern to
  extend: `admin_set_user_role(target_id, new_role)`, `admin_set_supervisor(target_id,
  new_supervisor_id)`, `admin_set_active(target_id, new_active)`.
- `@supabase/supabase-js` v2 (already installed) ships `auth.admin.*` (including `createUser`,
  `updateUserById`, `generateLink`) the moment it's instantiated with a service-role key — **no new
  package is needed.**
- `proxy.ts` (Next 16's middleware) only refreshes session cookies today — it explicitly documents
  that it "never redirects/blocks based on who the user is... actual access control is, and remains,
  Postgres RLS." It carries no allow/deny logic to extend. A forced-password-change gate should
  **not** be added here — it belongs at the same layer that already decides "redirect unauthenticated
  users away from `/dashboard`" (a Server Component check in the dashboard layout), which is the
  existing pattern this app already uses for authorization decisions, not `proxy.ts`.

### Answers to Audit 1's eight questions
1. Users are currently created **only** by whatever manual/dashboard mechanism the operator uses
   directly against hosted Supabase Auth today (outside the app) — the app itself has no path.
2. No — Admin cannot currently create a real Auth user through the app.
3. No — confirmed, only a "planned but not built" placeholder exists.
4. No initial-password flow exists.
5. No forced first-login password change exists.
6. A new **server-only module** (never imported by any `"use client"` file) constructing a
   service-role Supabase client, invoked exclusively from a Next.js Server Action or Route Handler,
   calling `auth.admin.createUser({ email, password, email_confirm: true })`. This mirrors the
   existing client-file doc comments' own stated intent exactly.
7. Minimally: one new `profiles` boolean column (`must_change_password` or
   `force_password_change`), defaulted appropriately by the create-user path.
8. Yes — no new package required (see above).

## 4. Audit 2 — Current Role Terminology

**The rename is a small, well-contained edit, not a blind find-replace.** `src/lib/data/role-labels.ts`
is *already* the single source of truth:
```ts
export const ROLE_LABELS: Record<Role, string> = {
  employee: "Employee",
  supervisor: "Supervisor",
  superadmin: "Superadmin",
};
```
Eight components already consume `ROLE_LABELS` correctly (sidebar, dashboards, profile settings,
Team Time, Team Updates, Project member list) — changing two values here (`supervisor: "Team Lead"`,
`superadmin: "Admin"`) automatically fixes all of them.

**Three real gaps to fix in the same change** (not automatically covered by the map):
- `src/components/auth/login-form.tsx:23-24` — the mock-mode quick-login buttons literally hardcode
  `"Supervisor"`/`"Superadmin"` as labels, bypassing the map entirely.
- `src/components/settings/workspace-section.tsx:89` and
  `src/app/dashboard/companies/[id]/page.tsx:191` — both render the **raw** `{staff.role}` value
  through CSS `capitalize` rather than `ROLE_LABELS[...]`. This coincidentally produces the right
  text today (`"supervisor"` → capitalize → `"Supervisor"`) but **will silently keep showing
  "Supervisor"/"Superadmin" forever** once the map changes, since CSS capitalization of the raw DB
  value can never produce "Team Lead"/"Admin". Both must switch to `ROLE_LABELS[staff.role]`.
- A handful of prose strings need rewording (not structural): `notification-labels.ts:17-18`,
  `mock-auth-provider.ts:50`, `profile-section.tsx:69`, `report-comments.tsx:54`,
  `generate-client-report-dialog.tsx:193`.

**Everything else is Category A** (technical identifiers: `isSuperadmin`/`isSupervisor`,
`is_superadmin()`/`is_supervisor()`, the `Role` type itself, RLS policy names, SQL comments, mock
fixture `role:` values) or **Category C** (documentation) — none of it needs to change for a UI-only
label swap. `docs/product-brief.md`'s `## Roles (RBAC)` section is the one doc worth updating
precisely (it's the canonical spec every phase doc points back to); phase-history docs
(`current-project-state.md`, `phase-*.md`) are changelogs of what shipped and are lower priority —
recommend leaving their historical narration with the original terminology and updating only
forward-looking sections, consistent with this project's own "do not rewrite historical decisions"
convention.

**No blind replacement is safe or needed** — the audit found the exact 3 non-map files and confirmed
every other occurrence is either already correctly routed through the map or is a technical
identifier that must never change (changing `role="supervisor"` DB values, function names, or the
`Role` TypeScript union would be a completely different, much riskier undertaking — explicitly not
required, since the business requirement is display-only).

## 5. Audit 3 — Current Supervisor Hierarchy (the highest-risk finding)

`manages_user`/`managesUser` is the **single choke point** almost everything below composes:
```sql
-- 20260813130857_profiles.sql:109-126, never redefined since
select auth.uid() = target_id
  or public.is_superadmin()
  or (public.is_supervisor() and exists (
        select 1 from public.profiles where id = target_id and supervisor_id = auth.uid()));
```

**Direct or transitive dependents** (SQL function → mock mirror), all confirmed by reading current
live definitions:

| Function | Dependency shape |
|---|---|
| `can_access_company`/`canAccessCompany` | Superadmin unconditional; internal company always visible; Supervisor via `manages_user` over `user_companies`/project-owner/project-member; Employee self only |
| `can_user_access_company` | **Hand-inlined** equivalent check (can't call `manages_user`, which reads `auth.uid()` — this takes an arbitrary candidate). Its own comment warns: *"Update this whenever can_access_company itself gains a new access path"* — a manual-parity burden already known to the team. |
| `can_access_task`/`canAccessTask` (READ, hierarchy-inclusive) | Supervisor via `manages_user` over assignees; **plus** two hierarchy-only branches (assigned to parent/child Subtask) that are READ-only and never touch `manages_user` |
| `can_access_task_directly`/`canAccessTaskDirectly` (MUTATION, no hierarchy) | Delegates to `can_user_access_task`, which hand-inlines the same supervisor/direct-report check (same manual-parity note as above) |
| `can_edit_task`/`can_progress_task` | Supervisor branch **narrowed** to `is_supervisor() AND can_access_task_directly(...)` — this exact narrowing was a real bug fix (Phase 13: was previously role-global) |
| `can_access_project`/`canAccessProject` | Supervisor via `manages_user` over project owner/members |
| `can_access_workstream`/`canAccessWorkstream` | Supervisor via `manages_user` over `lead_user_id`/`workstream_members` |
| `can_manage_document_row`, `can_manage_pending_document_row`, `can_access_document` | Composed from `can_access_task_directly`/`can_access_project` (not raw `manages_user`) — the Phase 14B "Defect B" fix specifically hardened the Employee-own-upload branch to require direct authority, not hierarchy visibility |

**Every other product surface confirmed dependent on it**: Time entry visibility/correction
(`canViewTimeForUser`/`canCorrectTimeEntry`), Team Time page + roster, Visit Entries, Daily
Updates + review, Team Updates, Accomplishments Reports, Client Reports (with
`hasReportingReviewAccess` as an explicit *orthogonal, hierarchy-bypassing* capability flag — the
one existing precedent for a capability decoupled from the hierarchy), Notes (same READ/MUTATION
split as Tasks), Profile Directory, and — critically — **`assignableStaffFor`**
(`src/lib/data/permissions.ts`), the literal function every Task-assignee picker, company-staff
picker, and "Team Workload" widget already calls to compute "who can I assign this to" (Superadmin →
everyone; Supervisor → self + direct reports; Employee → nobody). Any new eligibility source for
Task assignment must either extend this one function or every existing call site silently keeps the
old direct-report-only pool.

**Architectural principle already hardened twice** (Phase 10, Phase 13, and again in Phase 14B):
this codebase maintains a strict split between **READ/hierarchy visibility**
(`can_access_task`/`canAccessTask`) and **direct operational authority**
(`can_access_task_directly`/`canAccessTaskDirectly`), after real over-grant bugs were found each time
these were conflated. **Any new Service-based Team Lead concept must respect this same split from
day one** — a single unified check would very likely reproduce exactly the class of bug this
codebase has already paid to fix twice.

### Recommendation (Audit 3's A/B/C/D question)
**Option D initially, Option B as the explicit long-term direction — never A.** Service-based Team
Lead responsibility should, in this phase, be used **only for Service work-assignment/staffing
purposes** — it is not a security relationship at all (see Audit 12). It must **coexist** with,
never replace, the direct-report hierarchy, which remains the real organizational-management
structure for Time/Reports/Reviews/Company-and-Project access. If the business later wants Service
Team Leads to gain real Task/Project authority over their Service's work, that is an **additive**
future change (a new OR-branch composed into the relevant helpers, following the exact pattern
`hasReportingReviewAccess` already established for a hierarchy-independent capability) — never a
replacement of `manages_user`, and never bundled into this phase.

## 6. Audit 4 — Current Service Data Model

Confirmed exact semantics (not assumed):

- **`service_lines`** (`supabase/migrations/20260813130858_reference_data.sql:13-16`) — a flat,
  **global** catalog: `id`, `name` only. Read-only to everyone (`select using (true)`), no
  insert/update/delete grant to anyone but migrations. This is genuinely "one row per named service
  across the whole org," exactly as assumed.
- **`workstreams`** (`supabase/migrations/20260814090000_workstreams.sql`, linked to Projects by
  `20260815100000_workstream_project_link.sql`) — the UI-labeled **"Service."** One row = one
  Project's own instance of a Service Line: `company_id`, `project_id`, `service_line_id`
  (nullable — only for the Internal/Non-billable company), `lead_user_id` (**single, required
  user — one person, not a set**), status, dates, recurrence.
- **`workstream_members`** — a real join table (`workstream_id, user_id`), the "team" for that one
  workstream row.
- **Activities** relate via `departments` (each optionally mapped to one `service_line_id`) →
  `activities` → `workstream_activities` (the per-workstream enabled-activity selection, enforced by
  a trigger to match the workstream's own `service_line_id`).
- **"Lead" today means exactly one person, responsible for one `workstreams` row — i.e., one
  Project's one Service instance. It is NOT a global, cross-project concept.** Confirmed at every
  layer (type, provider, permission function, RLS, and the `WorkstreamFormDialog` UI itself): if
  Company A has two Projects each running "Payroll," each gets its own independent `workstreams`
  row with its own independent `lead_user_id` and `workstream_members` — **changing one has zero
  effect on the other.** "Lead" cannot simply be renamed "Created By" either — it is an ongoing
  responsibility field (editable after creation, distinct from `created_by`, which also exists
  separately on the table).
- **No existing global/cross-project Service-Line-level membership concept exists at all** —
  confirmed by grep and by `service_lines`' own two-column shape. This is genuinely new territory,
  with zero existing analog to conflict with or duplicate.
- **Established provider pattern to follow**: every provider method takes `viewer: User` first and
  self-enforces its own visibility gate; reads return a `...WithRelations`-hydrated shape; writes
  take a plain `...Input`; a join-table membership set is synced via an internal diff-based
  `syncX(id, ids: string[])` helper (see `supabase-workstreams-provider.ts`'s `syncTeam`), never
  exposed as its own raw CRUD surface.

## 7. Recommended Team Lead ↔ Service Model

**New table, forward-only, not created in this pass:**
```sql
create table public.service_team_leads (
  service_line_id uuid not null references public.service_lines (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id)
);
-- primary key (service_line_id, user_id) — the composite PK itself prevents duplicate pairs.
```
- **Cardinality**: many-to-many by construction (composite PK, no uniqueness beyond the pair).
- **Optional assignment**: no NOT NULL constraint requires a row to exist — a Team Lead may have
  zero rows; a Service Line may have zero rows.
- **Global responsibility**: keyed on `service_line_id` (the global catalog), never
  `workstream_id` — this is the entire point; it is deliberately a *new, separate* concept from the
  existing per-workstream `lead_user_id`, which remains untouched and keeps its current, narrower
  meaning ("who runs THIS Project's instance of the service day-to-day").
- **Role restriction**: a `before insert or update` trigger (matching the established pattern of
  `enforce_workstream_project_link`/`enforce_document_invariants`) validates
  `(select role from profiles where id = new.user_id) = 'supervisor'` at write time — only a
  Team Lead—role user may ever be inserted here.
- **Removal supported**: plain `delete`.
- **Admin controls assignment**: RLS — `select using (true)` (visible to everyone, like the
  `service_lines` catalog itself), `insert`/`update`/`delete` restricted to `is_superadmin()` only.
  Team Leads themselves do **not** edit this relationship (per the locked "Admin controls global
  Service leadership" rule) — a Team Lead can see who else leads their Service, but cannot add or
  remove anyone.
- **Why not reuse `workstream_members`**: it is explicitly per-`workstream_id` (per Project-Service
  instance) — reusing it for a global concept would conflate "this Project's specific execution
  team" with "org-wide responsible people for this Service," which the business requirements
  explicitly separate (the Payroll/Alderleaf/Brightwell example is precisely this distinction).

## 8. Recommended Employee ↔ Service Model

**A second, separate table — not a discriminator column on the same table:**
```sql
create table public.service_employees (
  service_line_id uuid not null references public.service_lines (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id)
);
-- primary key (service_line_id, user_id)
```
- **Cardinality**: many-to-many, same shape as `service_team_leads`.
- **Optional assignment**: same — a Service or a person may have zero rows.
- **No role restriction**: any active user (Employee **or** Team Lead) may appear here — since "a
  Team Lead is also operationally an Employee," a Team Lead may also want to appear as a working
  member of their own (or another) Service; the table itself imposes no role check.
- **Why two tables instead of one `service_members` table with a `membership_type` column**: this
  codebase has an established precedent for exactly this fork in the road — the `notes` table
  (`company_id`/`task_id`, "exactly one of the two is set... enforced with a CHECK rather than a
  polymorphic parent_type/parent_id design, since the app itself only ever has two concrete parent
  kinds") deliberately chose **two concrete kinds over one generic discriminator** when there are
  genuinely only two kinds and their write-rules differ. Leadership (Admin-only mutation, role-
  restricted) and membership (broader, more delegatable, no role restriction) have exactly this kind
  of different write-rule — a single table would need a `CASE`-branching RLS policy distinguishing
  by `membership_type`, more fragile than two simple, single-purpose policies. A person may hold rows
  in *both* tables for the same Service simultaneously (leading Payroll while also doing hands-on
  Payroll work) — this is intentional and requires no special handling with two separate tables.
- **Future Task-assignee eligibility**: "everyone associated with a Service" is a simple two-query
  merge (or a thin SQL view unioning both tables) for the future searchable picker — no worse than a
  single-table query, and the picker UI already wants to visually distinguish Leads from Members
  ("Service-relevant users surfaced first," per the locked requirement) anyway.

## 9. User Creation Architecture

1. Admin submits full name, email, role, initial password via a new Create User form.
2. A **Server Action** (new, e.g. `src/app/dashboard/admin/users/actions.ts`) — never a client
   component — validates the caller is a real, currently-authenticated Superadmin (checked
   server-side against the session, not trusted from the client), then:
   a. Constructs a service-role Supabase client from a **new, narrowly-scoped server-only module**
      (e.g. `src/lib/supabase/admin-client.ts`, explicitly never imported by any `"use client"`
      file — mirrors the existing `client.ts`/`server.ts` files' own stated intent).
   b. Calls `auth.admin.createUser({ email, password: initialPassword, email_confirm: true,
      user_metadata: { full_name } })`. The existing `handle_new_user()` trigger fires automatically,
      creating the matching `profiles` row (`role='employee'`, `active=true` by default).
   c. Calls the existing `admin_set_user_role(new_user_id, role)` RPC to set the real requested role
      (Admin/Team Lead/Employee) — reusing the established pattern rather than inventing a new one.
   d. Sets the new `must_change_password = true` flag (via a new, narrow, superadmin-gated RPC or as
      part of the same profile row, depending on final column design — a detail for implementation,
      not this audit).
3. The new user logs in normally with the initial password.
4. **First-login gate**: the dashboard's own root layout (the existing place that already decides
   "not authenticated → redirect to `/login`," per Audit 1's finding that `proxy.ts` deliberately
   does not make this decision) additionally checks `profile.mustChangePassword` and redirects to a
   new `/change-password` page if true — for every request, until cleared.
5. The change-password page calls a new `AuthProvider.changePassword(newPassword)` method — this one
   **does not** need the service-role client at all; it's the user's own session calling Supabase
   Auth's ordinary `updateUser({ password })`, exactly like `updateProfile` already does for name.
   On success, it clears `must_change_password` (a narrow RPC restricted to `auth.uid() = target`,
   or simply allowed via the existing column-scoped grant pattern already used for `full_name`).
6. Normal access begins.

**Locked guarantees preserved:**
- No plaintext password ever touches a public table — Supabase Auth's own `auth.users` table
  (never queried/exposed by this app) stores only the hash; `profiles` never gains a password
  column, only a boolean flag.
- The service-role key lives in exactly one new server-only module, never imported client-side, and
  is only ever invoked from Server Actions/Route Handlers (never from a "use client" file or the
  browser).
- Admin cannot retrieve an existing password (Supabase Auth never exposes password hashes or
  plaintext to anyone, including the Admin API — this is inherent, not something to build).
- Password *reset* (Admin sets a new one for a locked-out user) is a distinct action from password
  *retrieval* (impossible) — reset reuses the same service-role `auth.admin.updateUserById` call and
  re-sets `must_change_password = true`.

## 10. Role Change Semantics (locked — see Stage 0 Correction 3/4)

- **Employee → Team Lead**: no cleanup needed. Existing `service_employees` rows are untouched
  (not converted to leadership). Newly selected "Leads Services" values in the same Edit User action
  become `service_team_leads` rows — an explicit selection, never inferred from prior membership.
- **Team Lead → Employee**: delete all `service_team_leads` rows for that user, in the same
  transaction as the role change. Do **not** auto-convert them to `service_employees` — if Employee
  Service membership is wanted, Admin selects it explicitly in the same Edit User action. Admin UI
  warns before confirming, listing affected Services where practical ("Priya currently leads Payroll
  and Accounting — changing her role to Employee will remove her from both. Continue?").
- **Team Lead → Admin**: delete all `service_team_leads` **and** all `service_employees` rows for
  that user (Correction 4 — Admin holds no Service relationship of either kind). Last-Admin guard
  (below) still applies to the role-change itself.
- **Employee → Admin**: delete all `service_employees` rows for that user (same reasoning).
- **Admin → Team Lead**: zero Services is valid; any "Leads Services" selected in the same action may
  be added.
- **Admin → Employee**: zero Services is valid; any "Services" selected in the same action may be
  added.
- **Last-Admin protection**: `admin_set_user_role`/`admin_set_active` must refuse any change that
  would leave the organization with zero active Superadmins (`count(*) where role='superadmin' and
  active and id <> target_id) = 0` guard) — enforced server-side, not merely in the UI.
- All of the above cleanup happens **transactionally** with the role change itself (single RPC call,
  single transaction) — no invalid leadership/membership row may survive a completed role change.

## 11. User Lifecycle

`profiles.active` and the `admin_set_active` RPC **already exist and already work** — deactivation/
reactivation requires **no new capability**, only UI to call the existing RPC. Recommended v1
capability set:
- **Deactivate / Reactivate**: already exists (`admin_set_active`) — reuse as-is.
- **Reset password**: new — a Server Action calling `auth.admin.updateUserById(id, { password:
  <new> })`, then re-setting `must_change_password = true` (forces the user to choose their own on
  next login, exactly like initial creation).
- **Change role**: already exists (`admin_set_user_role`), extended per Section 10's cleanup rule.
- **Edit name**: already exists for self (`updateProfile`) — extending to "Admin edits *another*
  user's name" needs a new, narrow, superadmin-gated RPC (small addition, same pattern).
- **Edit email**: **deferred (Stage 0 Correction 6) — read-only after creation in this
  implementation.** A real email change needs `auth.users.email` and `profiles.email` kept in sync
  via the Admin API, which is real synchronization work this pass deliberately does not build. UI
  copy states this plainly ("Email changes are not available yet") rather than offering a field that
  half-works.
- **Delete Auth user**: **not recommended for v1.** Deleting `auth.users` cascades to `profiles`
  (`on delete cascade`) and would erase the user's identity from historical `created_by`/`author_id`
  references throughout the app — a real loss of audit trail for no real gain over deactivation.
  Prefer reversible deactivation always; true erasure (if ever needed for compliance) is a separate,
  carefully-scoped future feature.

## 12. Admin Users UI (proposed, not built)

`Admin → Users` — reuses the exact list-page pattern already established for Tasks/Documents
(search bar, filter popover, dense list rows, `⋯` action menu with the just-hardened
`ReservedActionSlot` alignment pattern from Phase 13/14). Columns: Name, Email, Role, Services,
Status, Actions. Search: name/email. Filters: role, service, active/inactive.

Create/Edit User: Name, Email, Initial Password (Create only), Role, Services (optional, searchable
multi-select — see Section 15's UI-scaling note). **Role gates whether the Services field appears at
all (Stage 0 Correction 4)**: Team Lead shows "Leads Services" (optional, role-filtered to Team Lead
users when picking peers, though this field concerns the user being edited); Employee shows
"Services" (optional); **Admin shows no Service field at all** — Admin never holds a Service
relationship of either kind.

## 13. Service Management UI (proposed, not built)

A **new**, `Admin`-scoped surface — distinct from the existing per-Project `WorkstreamFormDialog`
(which stays exactly as-is, editing one Project's own `lead_user_id`/`workstream_members`). The new
surface manages the *global* `service_team_leads`/`service_employees` relationships per Service
Line: Team Leads (optional, searchable multi-select, role-filtered to Team Lead users only) and
Employees (optional, searchable multi-select, any active user). A Service Line may be saved with
zero of either.

## 14. Project-Service Entry Point (Audit 11 — corrected, Stage 0 Correction 1)

**Both direct mutation and a dedicated link are architecturally acceptable; direct mutation is now
explicitly allowed as a fourth legitimate entry point** (alongside Create User, Edit User, and
global Service management) — the earlier "read-only + link-out only" recommendation is superseded.
When Admin configures "Payroll" for the Alderleaf Project, the per-Project Add/Edit Service UI *may*
show the same Team Lead/Employee multi-selects used on the global Service admin surface, writing
directly to the same `service_team_leads`/`service_employees` rows keyed by `service_line_id` — with
**mandatory, explicit copy** at that entry point: *"These Team Lead and Employee assignments apply
to Payroll across all Projects."* No Project-specific leadership/membership table is ever created
either way. This Admin implementation does not build the Project-Service UI itself (that stays with
`WorkstreamFormDialog`, untouched, per Correction 5) — it only ensures `ServiceMembershipProvider`
(Section 17) is generic enough that a future Service-level correction can add this entry point
without a schema change.

## 15. Authorization Impact (Audit 12 — highest-risk section; Stage 0 Correction 2)

**For THIS Admin implementation only: Service Team Lead / Employee membership is
staffing/organizational data — it does not broaden `can_access_company`/`can_access_project`/
`can_access_workstream`/`can_access_task`/`can_access_task_directly`/`can_edit_task`/
`can_progress_task`/Documents/Time/Reports/Team Updates. This is a SAFE STAGING RULE for this pass,
not a permanent statement of what Team Lead authority will mean.**

- It exists to answer "who is responsible for/works in this Service" for UI and future
  assignment-suggestion purposes (a future searchable Task-assignee picker can surface a Service's
  own Team Leads/Employees first) — nothing more, for now.
- This staging rule introduces **zero new RLS surface for authorization** — `service_team_leads`/
  `service_employees` need only simple read-all/admin-write policies (Sections 7-8), not composed
  into any existing `can_access_*`/`can_edit_*` helper.
- **The future Project/Service validation phase will explicitly define what Service-based Team Lead
  authority means, and migrate authorization additively and safely** — composed additively (e.g., a
  new `OR` branch in `can_access_task_directly` such as "OR is a Team Lead of this Task's own Service
  Line"), following the precedent `hasReportingReviewAccess` already set for a hierarchy-independent
  capability — never a silent replacement of the direct-report hierarchy, and never bundled into this
  pass. Attempting that transition in the same pass as the staffing model would repeat the exact
  mistake this codebase has already found and fixed twice (Phase 10, Phase 13, Phase 14B): conflating
  a visibility/staffing concept with a mutation-authority concept.
- **The current `supervisor_id`/`manages_user` security path remains temporarily intact** — Time,
  Reports, Reviews, Company/Project access are all untouched by this implementation. This is a
  staging position pending the approved transition above, not a claim that Service-based authority
  is permanently out of scope.

## 16. Proposed Implementation Slices (forward-only, none created)

- **Admin-A — Account onboarding / forced password change**: `must_change_password` column, the
  server-only Auth Admin module, the create-user Server Action, `changePassword`/clear-flag path,
  `/change-password` page, dashboard-layout gate, Create User UI.
- **Admin-B — Service membership relationships**: `service_team_leads`/`service_employees` tables +
  RLS + role-restriction trigger, `ServiceMembershipProvider` (mock + Supabase), Service admin UI,
  Service-field additions to Create/Edit User, "Manage Service Team" Project entry point.
- **Admin-C — Role/service consistency + lifecycle**: `admin_set_user_role` cleanup extension,
  last-Admin guard, `admin_reset_password`/`admin_update_profile` RPCs, deactivate/reactivate/reset
  wiring in the Users UI.
- **Admin-D — Authorization transition (deferred, separate approval required)**: only if/when the
  business explicitly decides Service Team Lead should carry real Task/Project authority — not
  scheduled, not scoped here.

Standard hosted-database safety rules apply throughout: forward-only, never edit a hosted migration,
no linked `db reset`, no destructive migration without explicit review — identical discipline to
every Phase 13/14 migration so far.

## 17. Provider / Mock Parity (Audit 14)

- **`AuthProvider`** gains exactly one new self-service method: `changePassword(newPassword):
  Promise<void>` — uses the normal authenticated client, no service-role involvement, matching
  `updateProfile`'s existing shape.
- **New `AdminUsersProvider`** (mock + Supabase) — org-wide user administration:
  `listUsers`/`createUser`/`updateUserRole`/`setActive`/`resetPassword`/`updateProfile(targetId,
  ...)`. The Supabase implementation's mutating methods (`createUser`, `resetPassword`) are thin
  client-side wrappers that call a Server Action/Route Handler — **never** `supabase.auth.admin.*`
  directly from client code. The mock implementation works entirely against `db.users`.
- **New `ServiceMembershipProvider`** (mock + Supabase) — `listServiceTeamLeads(serviceLineId)`,
  `listServiceEmployees(serviceLineId)`, `setServiceTeamLeads(serviceLineId, userIds[])`,
  `setServiceEmployees(serviceLineId, userIds[])` — following the exact diff-based `syncTeam`
  pattern already established in `supabase-workstreams-provider.ts`.
- No UI ever calls raw Supabase directly for a domain operation — the one narrow exception (already
  true today) is the Server Action/Route Handler boundary itself, which is server-only code, not UI.

## Risks

- The two hand-inlined `manages_user` duplicates (`can_user_access_company`, `can_user_access_task`)
  are a known manual-parity burden — any future Stage-2 authorization change touching the hierarchy
  must update both, not just `manages_user` itself.
- Email-change-on-behalf-of-another-user (Section 11) needs a concrete design (keep `auth.users` and
  `profiles` in sync) before implementation — flagged, not resolved.
- The searchable multi-select control needed for 50+ users doesn't exist yet (`TaskAssigneeChips` is
  a plain checkbox-chip list) — a genuinely new UI primitive, though not architecturally blocked by
  anything in this design.

## Open Decisions (resolved at Stage 0)

- ~~Retention policy for `service_team_leads` rows on a role change away from Team Lead~~ — **resolved
  by Correction 3**: hard delete with a confirming Admin-facing warning, no soft-history table.
- ~~Email-change-on-behalf-of-another-user mechanics~~ — **resolved by Correction 6**: deferred
  entirely for this implementation; email is read-only after creation.

No open decisions remain blocking implementation.

## Ready for Admin Foundation Implementation Planning?

Yes — architecture accepted and locked (Stage 0), all prior open decisions resolved. Implementation
A/B/C follows immediately from this checkpoint.
