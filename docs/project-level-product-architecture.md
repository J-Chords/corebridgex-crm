# Project Level — Product Architecture

**Status: PROJECT LEVEL — IMPLEMENTATION COMPLETE / FINAL MANUAL ACCEPTANCE PENDING.** Built
forward from the Admin Foundation final checkpoint (`5fa92448d716996dee6589abeb00bcc28748a1e6`).
Implementation is deliberately left **uncommitted** pending manual UI testing and explicit
acceptance. One intentional, permanent limitation: automatic Trash purge stays disabled by design —
see "Trash retention" below; correct given this schema's FK delete rules, not a placeholder for
later work in this phase. The prior Brand business decision is now resolved (Brand is optional, per
the product owner) — see "Company relationship" below for exactly how.

**Correction pass — the visible "Project Template" bundle layer has been retired; the reusable
templates ARE the global Services and their Activities.** The product owner clarified that the
earlier Project Template concept (below, under "Template architecture — history") was too elaborate
for V1: configuring a Project means selecting existing Services and, per Service, existing
Activities — directly, with no bundle/wrapper layer in between. See "Services & Activities — the
V1 configuration model" for the corrected, current architecture, and "Template architecture —
history / retirement" for exactly what was removed from the UI vs. what stays dormant in the
schema.

**Locked product interpretation — Company is Project context, not a Project attribute.**
Management's "only Title is required to create a Project" means: once the client/company context
for a Project has been established, Title is the only required **Project attribute** — the
attribute list is exactly Title/Status/Creator/Template/Start Date/End Date/Completion Date/
Project Group/Description/Tags, which never included Company. Company is the structural
parent/context relationship every Project sits under (`projects.company_id NOT NULL` — unchanged,
never made nullable, never will be for this reason alone). See "Company relationship" below for
the resulting UX and why it fully satisfies the requirement without any schema/RLS change.

**Locked product interpretation — PROJECT is the visible client/company workspace; Company is the
technical master record underneath.** For V1, a user thinks "Alderleaf Manufacturing is the
Project I work on," never "which Company is this Project under." `companies` and `projects`
remain genuinely separate tables/providers/RLS — this is a UX consolidation, not a data-model
merge. `/dashboard/projects` is now the ONE primary client-facing destination for every role,
including Superadmin; `/dashboard/companies` is no longer a top-level nav item (its route, data
model, and Superadmin-only master-data functionality are all fully preserved — see "Company/Project
UX consolidation" below).

## Audit summary (existing vs. new)

Corebridge X already had a substantial Project module before this pass: `Project`/`ProjectMember`
types, a `ProjectsProvider` (list/get/create/update/renew), a combined list+Gantt browser page, and
a 5-tab detail page. `created_by` (Creator) and `owner_id` (Owner) already existed as two genuinely
separate columns.

**Reused as-is, not rebuilt**: `service_lines`/`workstreams`/`workstream_activities` (Services),
the existing Tasks provider/UI, `project_members` (Members — the relationship existed, only the
Admin-facing quick-editor was new), the Phase 14B `documents` table/`DocumentsProvider`/private
Storage design, Client Reports (`ClientReportsTable`), the existing Notes model (kept for
Overview's own durable Context panel, deliberately never relabeled "Comments"), the `MultiSelect`
component, and — critically for the Template correction — the pre-existing `templates`/
`template_tasks`/`template_checklist_items` Service Template ("recipe") architecture and its
`apply_template` RPC.

**Extended**: `projects` table (new columns — see Project Attributes), `ProjectInput`/
`ProjectsProvider` (status lifecycle actions, Project Groups, Trash retention setting, member
Project Role), `project_comments` (extended to Task/Document targets), `project_issues` (extended
with an optional Activity relation), the pre-existing `apply_template`/`templates-provider.ts`
(made Project-aware), `documents` UI (from a read-only list to the full upload/edit/download/
Trash/restore surface).

**New**: `project_groups`, `project_comments` (threaded), `project_issues`, `project_templates`/
`project_template_services`/`project_template_activities` (the Project Template bundle — now
retired from the visible app and dormant, see "Template architecture — history / retirement"
below), `project_trash_settings`.

## Project Attributes — exact mapping

| Spec attribute | Implementation |
|---|---|
| Title | Reuses the existing `projects.name` column. The UI label everywhere is "Title." |
| Status | `projects.status` (`text`, `CHECK` constraint): `active`/`on-hold`/`completed`/`cancelled`/`archived`/`trash`. Visible label for `cancelled` is "Canceled." |
| Creator | `projects.created_by` — resolved to a `createdBy: User` on `ProjectWithRelations`, shown on Overview as "Created by," read-only. |
| ~~Template~~ | **Retired as a Project attribute** (Services/Activity Configuration correction pass) — a Project no longer has a Template field. Optional Services (+ Activities) configuration replaces it; see "Services & Activities — the V1 configuration model" below. |
| Start Date / End Date | **New**, genuinely distinct columns: `projects.start_date`/`end_date` — this Project's own planned/actual work timeline. Deliberately NOT the same as `contract_start_date`/`contract_end_date` (the annual client-contract term, which continues to feed the existing "Renew Project" suggested-next-term logic, untouched). Both pairs are stored and labeled independently in the UI (a separate "Contract term" section on the Create/Edit form and a distinct pair of Overview stat tiles). |
| Completion Date | `projects.completion_date` (date, nullable) — the real, actual-successful-completion date, distinct from both End Date and the contract end date. Auto-set to today the first time a Project moves to "Completed" if not already set. |
| Project Group | `project_groups` table (id, name) + `projects.project_group_id` FK (nullable). Admin-managed. |
| Description | `projects.description` (plain `text` column, unchanged) — rendered/edited as safe Markdown (see "Description" below), not a schema change. |
| Tags | `projects.tags` (`text[]`, default `{}`). |

## Company relationship — context, not a Project attribute

A Project always belongs to exactly one Company (`projects.company_id uuid not null`, FK to
`companies`, unchanged — still never nullable). Company is the structural parent/context a Project
sits under — never itself listed in management's Project attribute list
(Title/Status/Creator/Template/Start Date/End Date/Completion Date/Project Group/Description/Tags).

**Brand is now optional (product owner decision, resolved this pass).** `companies.brand_id` was
`NOT NULL` with no safe default; the product owner has now explicitly decided Brand is optional
client/master data, never a required Project attribute. Corrected via a new forward-only migration
(`20260902140000_company_brand_optional.sql`, live-applied): `alter table companies alter column
brand_id drop not null`. Audited first (per that migration's own header) — Brand is never read by
any RLS policy or permission helper anywhere in this schema; it is purely descriptive/display data
plus the key that scopes which partner brand's Activity Catalog a *Service* (Workstream) uses.
`workstreams.brand_id`/`departments.brand_id`/`client_reports.brand_id` all deliberately stay
`NOT NULL` — those represent real delivered work or catalog structure that must always resolve to
a real brand. The consequence: a Company can now genuinely have no Brand, but creating a *Service*
under it still needs one — `create_workstream`/`apply_template` were hardened (same migration) to
raise a clear, honest error ("This client has no Brand set yet — add a Brand to this client before
creating a Service") instead of a raw NOT NULL constraint violation, exactly the "disable/explain
only that operation" outcome the correction called for. No fake/default/"Unknown" Brand exists
anywhere; leaving it blank is a genuine, valid, permanent state until an Admin sets one.

**Resolution — ONE unified "New Project" workflow, no separate modal hop.** `ProjectFormDialog`
(the same dialog every Project-create/edit flow already used) now offers, only at the true global
entry point (`/dashboard/projects → New Project`, no prior Company context):

- **New client (default)** — Title is the only required input, reused as-is for the brand-new
  Company's own name (never a second, duplicate name field). An optional "Client Information"
  section offers Brand (optional Select, "No brand yet" is a real, valid choice), a single primary
  contact (name/email/phone), and this client's own Contract start/Renewal date — all genuinely
  optional. Submitting calls the new `createClientProject` provider method, which creates the
  Company (+ optional contact) and the Project **atomically** — see "Atomic client+project
  creation" below.
- **Existing client** — one click switches to the original Company picker (unchanged logic), for
  attaching a new Project to a Company that already exists (a real, supported, explicit alternate
  path — historical multi-Project-per-Company data is never destroyed or discouraged).
- **From a Company's own page** (`/dashboard/companies/[id] → New Project`) — unchanged: opens the
  same dialog with that Company prefilled/read-only, no toggle shown at all.
- **Project Edit** — Company stays read-only, exactly as before.

Every path leaves Status/Template/Start Date/End Date/Completion Date/Project Group/Description/
Tags fully optional; Creator stays system-derived.

## Atomic client+project creation

A single Postgres function body is one transaction: `create_client_project(p_name, p_brand_id,
p_contract_start_date, p_renewal_date, p_contact_name, p_contact_email, p_contact_phone, ...)`
inserts the `companies` row (+ optional `client_contacts` row and `primary_contact_id` link), then
delegates the actual Project row (and any Template materialization) entirely to the **existing,
unmodified** `create_project` — never a second copy of that logic, never a parallel provider
architecture. If anything after the Company insert raises, the whole function aborts and that
insert rolls back with it — genuinely atomic, no orphan-Company risk, no client-side multi-step
call sequence. The mock provider mirrors the same semantics (`mockProjectsProvider.
createClientProject` calls the existing `mockCompaniesProvider.createCompany`/`createContact` then
`mockProjectsProvider.createProject`, with a best-effort compensating delete on any failure, since
the mock has no real transaction). Proven live: 14/14 hosted assertions (disposable Auth user,
Title-only creation, Brand-blank vs. Brand-set, primary-contact creation, the new
create_workstream error message, full cleanup) — and 21/21 in the mock probe suite.

## Company/Project UX consolidation

**Primary navigation.** `/dashboard/projects` is the only client-facing item in the sidebar's
"Client work" group, for every role — "Companies" has no sidebar entry at all (it was already
Superadmin-only; the removal now applies to Superadmin too). The route
(`/dashboard/companies`/`/dashboard/companies/[id]`), its RLS/permission gate, its
`CompaniesProvider`, and every one of its existing capabilities are all **fully preserved,
unmodified** — reachable only by direct URL now (see below). Nothing was deleted; nothing was
rebuilt.

**Project Overview — "Client Information" (not a second Company page).** Shows Client status
(`CompanyStatusBadge`, reused), Brand, Contract start, and Renewal date, plus a genuine **Contacts
list** (name/title/email/phone, Primary badge) sourced from the exact same `useCompany` hook the
Companies page already used (it already returned `contacts`, just unused here before). Admin-only
actions — "Edit client details" (opens the existing `CompanyFormDialog` in place, unmodified) and
"+ Add contact"/"Edit" per contact (opens the existing `ContactFormDialog` in place, unmodified) —
mean an Admin no longer needs to leave the Project workspace for this normal client-administration
work. Deliberately **not** duplicated here: Services (own Project tab, now including Service/
Activity Configuration — see below), Members (own tab), Comments/Notes (own tab/panel).

**Services/Activity Configuration correction — the "Full client record (advanced)" link is
removed** (it pointed at Service Line subscriptions and staff assignment on the Company page). Per
the product owner's explicit instruction this pass, Services are no longer a reason to send Admin
back to Companies at all: Service Line subscriptions on the Company record are legacy/display-only
(Section 16 audit — never read by `create_workstream`, RLS, or any Service/Activity selection
logic; a Project's own Services tab is the real, live source of which Services a client actually
has configured), and staff assignment is global Service staffing, already surfaced read-only on the
Project Services tab. Admin now does **all** normal V1 client-master-data work (name, Brand,
status, primary contact, contacts, contract/renewal) from inside the Project, with no link back to
Companies anywhere in the normal flow.

**`/dashboard/companies` after consolidation.** No longer a competing primary destination and no
longer needed for normal client administration or Service configuration — it remains a fully
working, Superadmin-only surface (Service Line subscription checkboxes, staff assignment, and the
legacy Company-level "Apply Template" Service-recipe flow — see "Service Template / recipe reuse"
below), reachable only by direct URL now that its one in-app link has been removed.

**Known pre-existing, out-of-scope issue (not touched this pass).** Several dashboard widgets and
global affordances (`supervisor-dashboard.tsx`, `client-health-overview-card.tsx`,
`needs-attention-strip.tsx`, the command palette, and the unconditional `c` keyboard shortcut)
already linked directly to `/dashboard/companies/[id]` for non-Superadmin viewers, who get
redirected away on arrival — a "latent, currently harmless" issue already documented by an earlier
audit (`docs/phase-13-client-history-audit.md` Part A), not newly introduced or worsened by
removing the sidebar entry. Section 25 of this pass's own instructions explicitly fences off
broader Dashboard/navigation consolidation ("wait until Project → Service → Activity → Task is
stable") — left as a known, named follow-up rather than fixed here.

## Project Overview — role-aware (Manual Acceptance Steps 3-4)

`src/app/dashboard/projects/[id]/page.tsx`'s Overview tab is one shared component, adapting its
content and actions by role from data the page already fetches — never a per-role route, never a
new provider/query. The former always-visible 5-status-badge strip (rendered above every tab, not
just Overview) is removed; its useful figures are folded into Overview's own grouped panels below
instead of duplicating them across every tab.

**Shared foundation (all roles).** Header (Project identity, `ProjectStatusControl` — Admin sees
the full lifecycle control, everyone else sees the plain badge plus the On Hold/Canceled reason
inline, unchanged pre-existing behavior; the header's only other Admin action is "Edit" — Step 4
removed "Renew" from normal display, see below), a compact 3-4-tile summary strip, a "Services"
summary panel (global Service Line names, `serviceLineDisplayName`, max 3 + overflow), and a compact
"Project Details" panel (Owner always shown; Description/Project Group/Start/End/Completion
date/Tags rendered only for whichever actually have a value — "No additional Project details have
been added." replaces the field grid entirely when none do, never a wall of "Not set"/"—").

**Admin** additionally gets: a "Work needing attention" panel (project-wide Overdue/Waiting/Blocked
badges + Next due — the Task's own title plus its date, e.g. "Reconcile Q2 books — Jul 27," never a
bare date with no item identity — linking to Tasks), a "Team" panel (`PeopleInline`, linking to
Members), and an Admin-only "Administrative Details" panel (renamed from "Client Information" —
Account Status/Partner Brand/Contract Start/Renewal Date/Contacts, reusing the existing
`CompanyFormDialog`/`ContactFormDialog` unmodified, plus Created By). "Account Status" is the
underlying Company/master status — deliberately relabeled (Step 4) so it never reads as a second,
ambiguous "Status" next to the Project's own lifecycle status at the top of the page; the two remain
technically separate fields, never merged. Related Projects is no longer shown on normal Overview
(Step 4 — normal V1 keeps Project as the one visible client/company workspace; the underlying
multi-Project-per-Company relationship is untouched, just not promoted here).

**Team Lead** gets the same project-wide "Work needing attention" and "Team" panels as Admin, but
**no** Administrative Details panel and no lifecycle/destructive header actions — matching their
existing `canManageProjects`-gated absence, unchanged.

**Employee** gets a "my work" scoped attention panel (own overdue/waiting/blocked assigned Tasks +
own next due, same Task-title-plus-date treatment) instead of the project-wide one, and **no** Team
or Administrative Details panels at all — only Project identity/status/Services/Project Details
plus their own work.

**Renew (Step 4 carryover).** The header's "Renew" button and its `ProjectRenewalDialog` mount are
removed from this page — normal V1 Project lifecycle is Active/On Hold/Completed/Canceled/
Archived/Trash via `ProjectStatusControl`, with Start/End/Completion as the Project's own work
dates; a separate "renew into a new annual-contract Project" action isn't part of that. The
`ProjectRenewalDialog` component, `renewProject`/`ProjectRenewalInput` provider method/type, and all
historical renewal data are completely untouched and remain dormant, not deleted — reachable again
later if a real call site needs them.

**Notes → Comments consolidation (Step 4 carryover).** The `SharedNotesSection` composer is removed
from Overview entirely — Comments (below) is now the one normal place to add new Project discussion
or context. Existing historical Note rows are never deleted and remain visible: `SharedNotesSection`
gained a `readOnly` prop (used only here) that hides its composer/"+ Add note" trigger completely;
the Comments tab composes it a second time, read-only, labeled "Legacy Notes," directly under the
threaded Comments panel. No Notes table/migration/provider was touched — this is a visibility/UI
change only, and if a Project genuinely has zero historical Notes, this section renders nothing.

No authorization changed: every gate reuses `canManageProjects`/`isSupervisor` exactly as already
established; Team Lead's global Service leadership still grants no additional Project visibility
(Section 23 of this pass — deferred to the Service level, as before).

## Project list — role-conditional columns (Manual Acceptance Step 1, ACCEPTED)

One page, one route, one component (`src/app/dashboard/projects/page.tsx`) for every role — never
a separate Admin/Team Lead/Employee route. The former combined list+Gantt timeline is **removed**
(Manual Acceptance Step 1 correction) — it squeezed the Project identity column down to
near-unreadable at ordinary desktop widths, and the detailed per-Task Gantt already lives on each
Project's own Tasks → Timeline. This is now a plain, full-width operational table; only the column
set varies by viewer role, computed entirely from data the page already fetches (role-scoped Tasks,
the existing Service-staffing lookup) — no new fetch, no invented metric:

| Admin | Team Lead | Employee |
|---|---|---|
| Project | Project | Project |
| Services | Services | — |
| Team Leads | Open Tasks | My Open Work |
| Team | Overdue | Attention |
| Open Work | Waiting | Next Due |
| Attention | Blocked | — |
| | Team | — |

The Project column shows readable avatar + name (never squeezed to bare initials); Services shows
actual global Service Line names ("Accounting," not "Accounting 2026" — `serviceLineDisplayName` in
`src/lib/data/project-display.ts`); Team/Team Leads show avatar + first person's name + "+N"
(`PeopleInline`, `src/components/projects/people-inline.tsx`), never bare unexplained initials or an
all-user chip wall. No Status column was added — every group is already sectioned by status (the
collapsible group header), so a per-row Status badge would just repeat it. "Global Team Leads"
reuses the same `getStaffingForServiceLines` read-only lookup the Project Services tab's own
staffing display already uses — displaying it here changes no authorization; it is exactly the same
information already visible per-Project, just also summarized at list level.

### All six Project statuses — one unified filter (Project Final Integration Correction)

The former separate Active/Archived/Trash segmented toggle (Admin-only) plus the four-status
grouped view are consolidated into **one** status system: a compact 6-tile KPI strip (Admin) / 4-tile
strip (Team Lead, Employee) — Active, On Hold, Completed, Canceled, and, Admin-only, Archived and
Trash — plus a matching explicit "Status" dropdown (`All Statuses` + each reachable status), both
driven by the same `statusFilter` state so there is never a second, competing filter system.
Clicking a KPI tile applies that status filter; clicking the already-selected tile (or picking "All
Statuses") returns to the grouped view. Every KPI count is computed over `filteredExceptStatus` —
the viewer's role-scoped Projects narrowed by every *other* active filter (search/Service/Team
Lead/Member/Group/Tag) but not status itself — so a count honestly previews what selecting it will
show, never a stale org-wide figure. Archived/Trash stay reachable only to Admin — the exact same
restriction the prior toggle already enforced (it too was rendered only for `canManageProjects`),
now expressed as which statuses a role's `visibleStatuses` list even contains, never a widened
visible Project set for Team Lead/Employee. "All Statuses" (the default) groups every reachable
status together, with Archived/Trash's own groups starting collapsed (matching the prior "hidden
from ordinary browsing by default, reachable on demand" behavior) while the four working statuses
start expanded.

## New Project — no Client/Company concept exposed (Manual Acceptance Step 2, ACCEPTED)

`ProjectFormDialog`'s normal global entry point (`/dashboard/projects → New Project`, no
`defaultCompanyId`) never shows a Company/"client" mode choice or picker at all — it always creates
a brand-new Company + Project together via the existing atomic `createClientProject`. The technical
ability to attach a Project to an already-existing Company is preserved, reachable only from that
Company's own page (`defaultCompanyId` passed in) or while editing — never exposed as a toggle from
the normal flow. Sections: Title\* → Project information (Description) → collapsed-by-default
optional groups (Administrative details: Partner Brand/Primary Contact/Email/Phone/Contract
Start/Renewal Date, 2-column at desktop width; Project details: Owner/Status-indicator/Project
Group/Completion Date/Start Date/End Date/Tags, 2-column; Services: `ProjectServicePicker`; Members:
searchable `MultiSelect`, never an all-user chip wall) → "Create Project." Status is shown only as a
non-editable "Active" indicator here — every lifecycle change still goes exclusively through
`ProjectStatusControl`.

## Description — safe rich text (v1)

`projects.description` stays a plain `text` column. The editor
(`src/components/ui/rich-description-editor.tsx`) is a Textarea plus a formatting toolbar
(Bold/Italic/Bulleted list/Numbered list/Link/Image URL) that inserts Markdown syntax; rendering
(`src/lib/markdown-lite.tsx`) is a hand-rolled parser that returns plain React elements — never
`dangerouslySetInnerHTML`, no third-party editor package. Only `http://`/`https://` link and image
URLs render as real links/images; every other scheme (`javascript:`, `data:`, a scheme-less value)
degrades to plain visible text instead of executing. Plain pre-existing descriptions remain
readable (no bold/italic/list/link syntax renders as literal text, since none of it is HTML).

## Owner vs. Creator vs. Project Group vs. Company vs. Tags

Five genuinely different concepts, never merged — Company (permanent client master record),
Owner (`owner_id`, accountable person, reassignable, defaults to the creating Admin), Creator
(`created_by`, immutable audit fact), Project Group (optional cross-Project label), Tags
(free-form, multiple, display/search/filter only).

## Status lifecycle

Six statuses: Active, On Hold, Completed, Canceled, Archived, Trash. Three Admin-only RPCs
(`set_project_status`/`trash_project`/`restore_project`), each independently re-verifying the
caller via `is_superadmin()`. On-hold/cancelled require a non-empty reason. `trash_project`/
`restore_project` are separate, explicit actions — never reachable through the status dropdown.

**Trash retention — configurable, purge deliberately never automatic.** `project_trash_settings`
(a singleton row) lets an Admin set a retention window in days, or leave it disabled (`null`,
the default) via `set_project_trash_retention`. No `purge_expired_trashed_projects()` function was
ever written, and none is scheduled. This is not an oversight: a live FK audit found
`documents.project_id`/`workstreams.project_id`/`client_reports.project_id`/
`visit_entries.project_id`/`client_report_schedules.project_id` are all `ON DELETE NO ACTION` —
meaning a non-empty Project cannot be physically deleted at all today without a separate,
deliberate cascade-safety migration (a Service-level-phase concern, not this one). Writing a
purge function that can never safely run risks future misuse more than it helps, so the setting
exists and is honest about what it does (configures a retention window for eventual purge, and
purge stays off) without a working purge behind it.

## Authorization — explicitly unchanged

`can_access_company`/`can_access_project`/`can_access_workstream`/`can_access_task`/
`can_access_task_directly` are untouched throughout this whole effort, including the Template
correction. Every new RLS policy composes only these same already-accepted helpers plus
`is_current_user_active`/`is_superadmin`. Global Service staffing (Team Leads/Members) is
displayed read-only on the Project Services tab, sourced from `service_team_leads`/
`service_employees` via a new read-only lookup — it is never consulted by any access decision.
Materializing Services from a Project Template does not widen `supervisor_id`/`manages_user`/
`can_access_project`/`can_access_workstream`/`can_access_task`/`can_access_task_directly` in any
way — every materialized Workstream is created through the exact same `create_workstream` RPC
(and its existing Superadmin/Supervisor/Employee role branches) a manual "Add Service" already
uses. Service-based Team Lead authorization remains a separate, future Service-level phase.

## Comments vs. Notes — Comments is now the one normal authoring surface (Step 4 correction)

Comments (`project_comments`) is a genuinely different model from Notes — threaded, with replies,
author edit/delete-own, Admin moderation-delete — and, per product-owner review, is now **the**
primary visible Project discussion/context surface for V1; the two are no longer presented as
equally-normal competing places to write. `project_comments` supports three target shapes via
nullable `task_id`/`document_id` (never both set): a root Project comment, a Task comment, or a
Document comment. A reply always inherits its parent's exact target (enforced by a trigger, not
just client-side); a Task comment requires `can_access_task`; a Document comment requires the same
access a legitimate Document viewer already has. One reusable panel (`ProjectCommentsSection`,
`target={{projectId, taskId?, documentId?}}`) is composed on the Project's own Comments tab, inside
the full Task detail page, and inside each Project Document's own Comments dialog — never a
duplicated implementation. The legacy Notes composer (`SharedNotesSection`) no longer appears on
Overview; historical Notes remain visible read-only under a "Legacy Notes" heading on the Comments
tab (see "Project Overview — role-aware" above) — the Notes table/provider/migrations are untouched.

## Issues — a real, separate concept

`project_issues` is not a Task status and reuses no Task/Project status enum (its own
`open`/`in-progress`/`resolved`/`cancelled`). May optionally reference a Service (`workstream_id`),
a Task (`task_id`), and/or an Activity (`activity_id`) — or none of the three. When an Activity is
given, it is validated server-side to belong to the selected Workstream (via
`workstream_activities`); the Workstream itself is validated to belong to the selected Project. Any
legitimate Project viewer may report an Issue; only the reporter, the assignee, or an Admin may
progress its status; only the reporter or an Admin may edit its details.

## Members

`project_members` is the real Project-participation relationship (distinct from any global role).
Each membership carries an optional, Project-scoped, free-text `project_role` label ("Project
Lead"/"Reviewer"/"Contributor" as placeholder examples only) — data only, never a new global
authorization role, never consulted by any access helper; editable Admin-only via
`set_project_member_role`.

## Documents

Reuses the Phase 14B `documents` table/`DocumentsProvider`/private Storage design exactly — no
second document model. The full surface is built: upload (reserve → authenticated browser upload
→ finalize, entirely inside `documentsProvider.uploadDocument`), list, metadata edit
(display name/description/category), signed download (short-lived, minted only for a viewer who
still passes `can_access_document`), soft delete, a Trash view, and restore — plus per-Document
threaded Comments via the same reusable Comments panel. No public URLs, no service-role key in any
client-facing code path. Proven with a real authenticated hosted Storage E2E (disposable Auth user
+ disposable Document, full lifecycle exercised, fully cleaned up, zero leftovers confirmed by live
read-back) — not just unit-tested against the mock provider.

## Filters

`/dashboard/projects` combines (AND) name search, Active/Archived/Trash view, Service, Team Lead
(reads the same global `service_team_leads` staffing data the Services tab displays), Project
member, Project Group, and Tag. Filtering is always applied after each viewer's own already-scoped
visible set — it narrows what's already legitimately visible, never widens it.

## Time

Audited against the management-required fields (Task, Date, Duration OR Start/End Time, Note): all
four were already representable before this pass (`time_entries.notes` exists and the manual Log
Time dialog already exposes a Note field alongside its Time range/Duration modes) — no code change
was needed here; this is a verified fact, not an assumed one.

## Services & Activities — the V1 configuration model

**Controlling interpretation (Services/Activity Configuration correction pass, locked).** The
reusable "templates" for V1 ARE the global Services (`service_lines`) and their Activities — not a
separate wrapper. Configuring a Project for a client means: select an existing Service (e.g.
"Payroll"), then select the subset of that Service's existing Activities that apply (e.g. "Monthly
Payroll," "Employee Changes," "Tax Filing") — producing Project → Service → Activities directly.

```
GLOBAL SERVICE (service_lines)
  -> a reusable catalog definition — name only, Admin-managed, brand-agnostic (no brand_id column
     at all — any client can use any Service Line).

ACTIVITY (activities, under departments)
  -> a reusable Activity catalog definition, scoped to one Service Line AND one partner Brand
     (departments.brand_id NOT NULL) — see "Brand dependency" below for exactly why.

PROJECT SERVICE (a Workstream, workstreams.project_id)
  -> one existing Service Line attached to one Project, with a plain, explicit subset of that
     Service's existing Activities selected (workstream_activities) — created via the same
     `create_workstream` RPC/provider method every other Service-creation path already uses, with
     ordinary defaults (lead = Project owner, no team/dates/recurrence) since this is a plain
     association, not a rich Workstream setup. No new catalog row (Service or Activity) is ever
     created by this flow — only existing ones are selected.
```

**Shared picker, two call sites (Section 27).** `ProjectServicePicker`
(`src/components/projects/project-service-picker.tsx`) is the one "select an existing Service, then
select its existing Activities" widget, reused by:

- **New Project creation** — an optional "Services" section in `ProjectFormDialog`, gathering a
  list of `{serviceLineId, activityIds}` entries before submit. The Project (and, for a brand-new
  client, the Company) is created first via the existing atomic `createClientProject`/`createProject`
  call; each selected Service is then attached via `createWorkstream` in a second, best-effort step
  — if the Project itself succeeds but a Service fails to attach, the error names exactly which
  Service(s) failed and directs the user to the Project's own Services tab rather than silently
  reporting full success (Section 28 — no new migration was needed or added to preserve creation
  atomicity for the Company+Project part; only the fully-optional Services step is a second call).
- **Project → Services → Add Service** (`AddProjectServiceDialog`,
  `src/components/projects/add-project-service-dialog.tsx`) — the exact same picker, for an already-
  existing Project. Passes the Project's own already-attached Service Line ids as
  `excludeServiceLineIds`, so the picker never offers a Service the Project already has — this is
  how duplicate Project Services are prevented (a UI-layer guarantee, by construction; the
  underlying `workstreams` table has no uniqueness constraint on `(project_id, service_line_id)`,
  deliberately, to keep supporting renewal/history Workstream chains elsewhere). Adding more
  Activities to a Service the Project already has is not this flow's job — see "Configure Activities
  on an existing Project Service" below.

`WorkstreamFormDialog` itself was **not modified** and keeps its other two remaining call sites
exactly as before (Company-page legacy "+ Add Service," a Workstream's own "Edit" —
lead/team/dates/recurrence). Its third former call site, the Task form's inline "+ New service," is
retired (see "Task form is no longer a catalog-administration surface" below).
`ProjectServicePicker`/`AddProjectServiceDialog` are new, narrower components that replace only the
Project Services tab's own "Add Service" trigger.

### Configure Activities on an existing Project Service (Project Final Integration Correction)

`Project → Services → [Service] → "Configure Activities"` reuses the already-existing
`AddServiceActivitiesDialog` (`src/components/workstreams/add-service-activities-dialog.tsx`, built
in an earlier phase but until now only reachable from the Task form's own now-removed inline flow —
AUDIT → REUSE, no new component). It shows only that Service's **remaining, not-yet-enabled**
catalog Activities (identity via Activity id, never display-name comparison) — offering
"Bookkeeping"/"Bank Reconciliation" again once they're already enabled is impossible by construction
since they're filtered out of the list entirely; if every catalog Activity is already enabled, it
shows "Every catalog activity for this service is already enabled." instead of an empty picker. It
persists via the existing `updateWorkstream` (a full replace-all sync, `[...alreadyEnabled,
...newlyChecked]` — never a partial/duplicate-prone write), the same call `WorkstreamFormDialog`'s
own Activities checklist already uses — no new RPC, no new migration. Gated `canManageWorkstreams`
(Supervisor/Superadmin, unchanged, pre-existing RLS boundary on `updateWorkstream`) — an Employee who
leads a Service can no longer silently extend its Activity catalog as a side effect of creating a
Task (that narrow capability rode along inside `create_task`'s own atomic RPC and had no standalone
equivalent); they ask their Team Lead/Admin, or create the Task untagged and retag it later. This is
a deliberate, narrow, explicitly-flagged consequence of retiring the Task form's catalog-admin
surface (below), not an oversight — resolving it durably belongs to the Service-level phase.

### Task form is no longer a catalog-administration surface (Project Final Integration Correction)

`TaskFormDialog` (`src/components/tasks/task-form-dialog.tsx`) previously exposed three ways to
extend the global/Service catalog inline while creating a Task: "+ New service" (opened
`WorkstreamFormDialog` to attach a Service), "+ Add existing activities to Service"/"+ Add an
activity to this Service" (enabled already-cataloged Activities for the Service), and "+ Create
Activity" (`CreateActivityDialog` — created a genuinely new global Activity Catalog row). All three
are removed. The Service selector now only ever lists Services already attached to the selected
Project (it already did — `useWorkstreams({projectId})` was always Project-scoped; only the
attach-a-new-one escape hatch is gone); when a Service has no Activities configured yet, the form
shows "Configure this Service and its Activities from Project > Services first." instead of an
inline fix-it action — Activity tagging simply stays optional in that case (`activityRequired`,
unchanged). Task creation is otherwise completely unaffected: title/description, Status/Priority,
Start/Due date, Checklist, and Reuse-from-past all work exactly as before.

### Task Assignees — scalable searchable selector (Project Final Integration Correction)

The Supervisor/Superadmin "Assignee" field (Employee never saw one — assignment is always
self-assign for them, unchanged) replaced `TaskAssigneeChips` (a permanent checkbox list of every
assignable staff member) with the same `MultiSelect` already used for Project Members — searchable
by name/email, selected people shown as compact removable chips, never an unbounded wall regardless
of organization size. Feeds it the exact same `assignableStaff` list the old chip list already used
— no widened assignability, no authorization change.

## Brand dependency — audited, Case A confirmed

Section 16/17's audit question: does selecting Activities for a Service genuinely require the
client's Brand, or is today's coupling merely legacy? Findings: `service_lines` has no `brand_id`
column at all (fully brand-agnostic — confirmed against the actual migration). `departments.brand_id`
and `workstreams.brand_id` are both deliberately `NOT NULL` (unchanged by the earlier Brand-optional
migration, which only touched `companies.brand_id`) — Activities are organized per-Brand
(`ActivityCatalogProvider.listDepartments(brandId, serviceLineId)`), and a Workstream's own
`brand_id` is a real, denormalized copy of its Company's Brand, resolved at creation time. Today,
only one seeded Brand ("Sparing Consulting") has any populated Departments/Activities at all — the
other four have none. **Conclusion: Case A** — Brand is a genuine, current structural dependency
for Service/Activity configuration, not legacy cruft; unifying the Activity Catalog across Brands
(making it brand-agnostic the way `service_lines` already is) would be a real Activity Catalog
redesign, explicitly out of scope for this pass (Section 24 — belongs to the next Service-level
phase).

**Resolution implemented.** Title-only + Brand-less + zero-Services Project creation remains fully
valid (unchanged from the prior pass). `ProjectServicePicker` renders a plain, proactive guard —
"Add a Brand to this client before configuring Services" — and shows no Service/Activity picker at
all when the resolved client has no Brand, in both the New Project Services section and the Add
Service dialog; the "Add Service" submit button can never be enabled without at least one Service
selected, so this is checked before submission, never surfaced as a raw RPC error. The underlying
`create_workstream`/`apply_template` Brand guard (from the prior pass's migration) is unchanged and
still the real enforcement backstop.

## Template architecture — history / retirement

The previous pass built a **Project Template** bundle layer (visible Admin management page, an
"Apply Template" action on a Project's Services tab, and a Template picker on New Project) on top
of the pre-existing Service Template ("recipe") concept below. The product owner has now determined
this bundle layer was more than V1 needs — see "Services & Activities" above for the corrected,
current model. This section is kept as a historical/schema record, not a description of the current
UI.

```
SERVICE TEMPLATE / recipe (templates, template_tasks, template_checklist_items)
  -> a reusable recipe for delivering ONE Service:
     - its own Service Line
     - its own recurrence (recurrence_frequency / recurrence_custom_interval_days)
     - its own default Tasks (template_tasks)
     - its own default checklists (template_checklist_items)
  -> KEPT, VALID, UNCHANGED — applied via the existing "Company -> Apply Template" flow
     (`apply_template` RPC), reachable only by direct URL to a Company's own page now that the
     "Full client record" link is gone (see "Company/Project UX consolidation" above). This is the
     ONE place default Tasks/checklists/recurrence materialize from an explicit selection — the
     new plain Project-Service-Activity association above deliberately does NOT trigger this
     (Section 11 — an explicit choice, not a silent behavior change: attaching a Service from a
     Project creates a plain Workstream + selected Activities only, with no default Tasks/
     checklists/recurrence, matching Section 1's literal "select Service, check some Activities"
     example).

PROJECT TEMPLATE (project_templates, project_template_services, project_template_activities)
  -> RETIRED FROM THE VISIBLE APP THIS PASS. Removed: the `/dashboard/projects/templates` admin
     page, the "Templates" button on `/dashboard/projects`, the "Apply Template" button/dialog on a
     Project's Services tab (`apply-project-template-dialog.tsx`, deleted — confirmed fully
     orphaned first), and the Template picker/`templateId` field on New Project
     (`ProjectFormDialog`). NOT touched: the hosted `project_templates`/`project_template_services`/
     `project_template_activities` tables, their three migrations, `use-project-templates.ts`, the
     mock/Supabase `ProjectTemplatesProvider` implementations, and the `apply_project_template`/
     `apply_service_template_to_project` SQL functions — all fully intact, now simply unreferenced
     by any UI (dormant, per the product owner's explicit "leave dormant rather than destroy"
     instruction). No historical Project row that was ever materialized from a Project Template was
     touched — its Services/Activities/Tasks remain ordinary, independent Project data, exactly as
     before.
```

**Global Service Catalog boundary (locked, not rebuilt this pass).** Adding an existing Service to
a Project ("Add Service," New Project's Services section, or the legacy Company "Apply Template")
never creates a new `service_lines` row — the provider layer exposes no create/update/delete method
for Service Lines at all, only `listServiceLines()`. A full Admin Service Catalog (create/edit
Services, active/inactive lifecycle, safe delete/archive) is the next, separately-scoped
Service-level phase.

## Remaining gaps (explicit, not hidden)

1. **Automatic Trash purge** — deliberately, permanently disabled (see "Trash retention" above);
   this is a structural FK-safety finding, not a missing feature to build later in this phase.
2. **Rich-text Description is v1 Markdown**, not a WYSIWYG editor — matches the locked instruction
   to avoid a third-party package; safe, functional, and extensible later if ever needed.
3. **Full Admin Service Catalog** (create/edit/archive global Services, safe delete lifecycle) is
   the next, separately-scoped Service-level phase — intentionally not started here.
4. **Service-based Team Lead authorization** (whether a global Service Team Lead gains any Project
   authority) remains a future Service-level-validation decision — displaying staffing data does
   not grant it today, by design.
5. **Pre-existing dead-end links to `/dashboard/companies/[id]` for non-Superadmin viewers** (a
   handful of dashboard widgets, the command palette, one keyboard shortcut) — already documented
   before this pass, explicitly out of scope per this pass's own navigation-scope boundary (Section
   25: no broader Dashboard consolidation yet).
6. **Activity Catalog is Brand-scoped, and only one seeded Brand has any Departments/Activities
   populated** — a genuine, current dependency (Case A, see "Brand dependency" above), not fixed
   this pass; unifying it across Brands is a Service-level-phase architecture decision.
7. **Service page/lifecycle redesign** (final Service status, Created-By vs. the existing
   Workstream Lead, Team Lead authority, global Service employee authorization, Activity catalog
   administration) — explicitly excluded from this pass (Section 24); begins after Project
   acceptance.
