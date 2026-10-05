# Authorization Model

## The three roles

`Role = "employee" | "supervisor" | "superadmin"` (`src/lib/data/types/role.ts`), stored on `User.role`. There is no fourth role.

UI labels (`src/lib/data/role-labels.ts`) are **deliberately decoupled** from the DB values — never render `user.role` raw:

| DB value | UI label |
|---|---|
| `employee` | **Employee** |
| `supervisor` | **Team Lead** |
| `superadmin` | **Admin** |

Two capability flags exist on `User` that are explicitly *not* roles: `reportingReviewAccess` (an orthogonal Client Report review/finalize capability, grantable to anyone) and `mustChangePassword` (forced first-login gate).

## Core role primitives

All in `src/lib/data/permissions.ts`, and all fold in an `active` check — a deactivated user loses their role-based privileges immediately, not just on the hosted side:

```ts
isSuperadmin(user) = user.role === "superadmin" && user.active
isSupervisor(user) = user.role === "supervisor" && user.active
isEmployee(user)   = user.role === "employee" && user.active

managesUser(manager, target) =
  isSuperadmin(manager)
  || (manager.id === target.id && manager.active)   // self
  || (isSupervisor(manager) && target.supervisorId === manager.id)  // direct report
```

`managesUser` is the single building block behind almost every "who can see/manage whom" rule in the app — it is a plain **org-chart relationship** (`target.supervisorId === manager.id`), never Project or Service membership. When you see "Team Lead scope," it means this function, applied to `allUsers`.

## The three-tier visibility pattern

The same shape repeats across Company, Project, Workstream(Service), Task, Daily Update, and Time Entry visibility:

- **Admin (superadmin)** — sees everything, org-wide.
- **Team Lead (supervisor)** — sees themself plus their direct reports (via `managesUser`), scoped further by whatever entity-specific relationship applies (project membership, workstream team/lead, task assignment, etc.).
- **Employee** — sees only their own directly-relevant records (their own tasks, their own time, their own company access).

## Full permission function catalog

Every exported function in `permissions.ts`, grouped by domain. Logic is paraphrased from the verified source; treat this table as a map to the file, not a replacement for reading the actual function when precision matters.

### Company

| Function | Gates |
|---|---|
| `visibleCompanyIds(viewer, allUsers)` | Admin → `"all"`; Team Lead → union of assigned companies across self + reports; Employee → own assigned companies. Internal company always included. |
| `canAccessCompany` | Single-company check against the above |
| `canManageCompanies` | Create/edit — Team Lead or Admin (Employee read-only). Note: both Company screens additionally hard-redirect any non-Superadmin away (Phase 8B), so `canManageCompanies`' nominal Team-Lead inclusion is currently unreachable in the UI — the function itself hasn't been narrowed to match. |
| `assignableStaffFor` | Who a viewer may assign to a company |
| Company contract-date post-creation correction (`contract_start_date`/`renewal_date`) | Phase 6A (CD-215) — **Admin/superadmin-only**, enforced by a hosted `BEFORE UPDATE` trigger (`enforce_company_contract_date_protection`) independent of `canManageCompanies`/RLS. A non-admin caller changing either value is rejected outright. |

### Project

| Function | Gates |
|---|---|
| `canAccessProject` | Admin → all; Internal-company projects → all; Team Lead → owner, an Additional Team Lead, or any member/Additional-TL is a direct report (Phase 4 added the Additional-TL branches); else → viewer is owner, an Additional Team Lead, or a member |
| `canManageProjects` | Legacy Admin-only Project gate — kept for historical/global-list purposes, **do not use for per-Project checks** (superseded by `canManageProjectRecord` below for anything Project-specific, since Phase 3/CD-208) |
| `canCreateProject` | Phase 3 (CD-208) — who may create a Project at all: **Admin or Team Lead**, never Employee. A Team Lead creator always becomes the new Project's `ownerId` (server-enforced, never client-chosen). Additional Team Lead selection is explicitly NOT part of creation (Phase 4) — added afterward through the Project staffing UI. |
| `canManageProjectRecord(viewer, project)` | Phase 3/4 (CD-208) — the real per-Project write boundary: `isSuperadmin(viewer) \|\| (isSupervisor(viewer) && (project.ownerId === viewer.id \|\| project.additionalTeamLeadUserIds.includes(viewer.id)))`. An Additional Team Lead (Phase 4, `project_team_leads`) gets the exact same management authority as the Primary TL (`ownerId`) — the sole exception is `ownerId` itself, which stays Admin-only to change (`update_project_record`). Deliberately narrower than `canAccessProject` (read) — direct-report visibility, `project_members`/`projectRole` (data-only), global Template staffing ("Works In Templates"), and `workstream.leadUserId` ("Project Template Lead") all grant **zero** Project-management authority here. Mirrored server-side by the hosted `can_manage_project(uuid)` SQL function — gates the Project Edit button/dialog, Add Template, Administrative Details' edit affordances, Activity configuration (`canConfigureWorkstreamActivities`, Phase 4 parity fix), and the Project/Workstream staffing RPCs below. Name/Partner Brand/Owner stay Admin-only to change even for an owning or Additional Team Lead. |
| `add_project_team_lead` / `remove_project_team_lead` / `add_project_member` / `remove_project_member` / `update_workstream_staffing` | Phase 4 — narrow SECURITY DEFINER RPCs (mirrored by mock provider methods of the same name), each gated by `can_manage_project`/`canManageProjectRecord` and requiring the Project to be Active. An Additional Team Lead may add/remove another Additional Team Lead but never remove themselves; Admin and the Primary TL have no such restriction. Target eligibility: Additional TL — active Supervisor, never the Project's own owner (enforced at the DB level by a trigger, not just these RPCs); Project Member — active Employee or Supervisor, no direct-report restriction; Workstream Lead/Team via `update_workstream_staffing` — unchanged from `create_workstream`'s own rule (self or an active direct report for a Team Lead caller). |
| `listProjectContractPeriods` | Phase 6A (CD-215) — read follows ordinary `can_access_project`, same as the rest of a Project's data; never widened. |
| `create_initial_project_contract_period` | Phase 6A (CD-215) — **Admin/superadmin-only**, independent of `canManageProjectRecord` (an Additional/Primary Team Lead cannot call this, even though they can manage most other Project data). Records the first period for a Project with no existing chain; `period_end` always computed server-side. |
| `renew_project_contract_period` | Phase 6B (CD-216) — **Admin/superadmin-only**. Records the successor of a Project's current leaf period; both dates always server-derived (never accepted from the caller). Requires the Project's lifecycle to be Active or On Hold (Completed/Canceled/Archived/Trash all rejected) and an existing recorded chain. Locks the Project row so two concurrent renewal attempts on the same Project serialize rather than race. |
| `delete_latest_project_contract_period` | Phase 6B (CD-216) — **Admin/superadmin-only**. Removes ONLY the current leaf period of a Project's chain (a period with a successor is rejected outright — the chain can never be left disconnected); removing a Project's sole root period is allowed. Lifecycle status is deliberately NOT checked — correcting mistaken history is independent of renewal eligibility. |
| `correct_initial_project_contract_period_start` | Phase 6B (CD-216) — **Admin/superadmin-only**. Corrects the root period's `period_start` ONLY while it remains the Project's sole recorded period (`period_end` always recomputed server-side; `created_at`/`created_by` untouched) — rejected outright once any renewal history exists. Never changes `Project.contractStartDate` ("Client Since") — a separate fact. |
| Project contract-date post-creation correction (`contract_start_date`/`contract_months`/`contract_end_date` via `update_project_record`) | Phase 6A (CD-215) — **Admin/superadmin-only**, enforced inside `update_project_record` itself: a non-admin caller supplying a changed value for any of the three is rejected outright (not silently ignored). This is narrower than `canManageProjectRecord`'s usual Team-Lead-inclusive boundary — a real, deliberate exception for contract fields specifically. |
| `canCreateWorkstreamInProject` | Defined but **no longer called anywhere** (CD-217 parity fix, see below) — kept only as a named, documented historical artifact; do not wire it back up without re-deriving the same ownership scoping `canManageProjectRecord` already provides. |
| Project-aware `createWorkstream` authorization (mock `mockWorkstreamsProvider.createWorkstream`, hosted `create_workstream`'s Supervisor branch) | **Admin, or the Project's owner/an Additional Team Lead** (`canManageProjectRecord`/`can_manage_project(p_project_id)`) — **not** "any Team Lead." Hosted has always enforced this (`create_workstream` requires `p_project_id` and calls `can_manage_project` for a Supervisor caller). CD-217 found mock's own enforcement for this exact branch was the broader, non-owner-scoped `canCreateWorkstreamInProject` (`isSupervisor \|\| isSuperadmin`, no ownership check at all) — a genuine, pre-existing mock/hosted parity gap, invisible in practice because the one existing caller ("+ Add Template" on the Project Services tab, `add-project-service-dialog.tsx`) already gates its own button with the correct `canManageProjectRecord`. Closed by switching the mock check to `canManageProjectRecord(viewer, project)`, matching hosted exactly — this changes no reachable product behavior through that existing UI, only closes a direct-call/API-level gap, and is required for CD-217's own new Project-level Apply Template (which reuses this same `createWorkstream` call) to correctly reject an unrelated Team Lead. |
| **Project-level Apply Template** (`src/app/dashboard/projects/[id]/page.tsx`'s Templates tab, new in CD-217) | Gated by the same `canManageProjectRecord(viewer, project)` as every other Project-management action on that page — **Admin, or this Project's owner/an Additional Team Lead**. Backed by `apply_service_template_to_project`/`applyServiceTemplateToProject`, which CD-217 also hardened: its merge-into-an-existing-Service branch previously had **no authorization check at all** (only the create branch was protected, indirectly via `create_workstream`) — any caller, including Employee, could merge Activities into an existing Project Service merely by naming it. Closed by adding `can_manage_project(p_project_id)`/`canManageProjectRecord(viewer, project)` immediately before the merge/create branch split in both mock and hosted, so both branches now share one boundary. This is Apply-Template authorization specifically — it grants nothing toward global Template create/edit/delete/configuration, which stays `canManageAdminUsers`-gated (Admin-only), untouched. |
| `canProgressProjectIssue` / `canEditProjectIssueDetails` | Admin, or the issue's creator/assignee |
| `canEditProjectComment` / `canDeleteProjectComment` | Own comment, or Admin for delete |

### Service (Workstream)

| Function | Gates |
|---|---|
| `canAccessWorkstream` | Same three-tier shape, scoped by `leadUserId`/`team` membership |
| `canManageWorkstreams` | Editing an *existing* Service's general fields (lead, team, recurrence, status, identity) — **Admin only**. Also gates the entire Company-detail page's "Apply template" and "Add Template" buttons/dialogs — **both Admin-only, unchanged**. The Company-detail page itself (`src/app/dashboard/companies/[id]/page.tsx:80-86`) is additionally gated Superadmin-only at the page level ("Company administrative pages are Superadmin-only now"), so Team Lead cannot reach either button regardless. CD-217 (Bug ticket) briefly moved the Company-level "Apply template" button to `canCreateWorkstream` to authorize Team Lead there, then reverted that change once the page-level gate proved it couldn't actually deliver Team Lead access through this surface — the Product Owner redirected Team Lead Apply-Template access to a new, separate **Project-level** entry point instead (see `canManageProjectRecord`/the Project-aware `createWorkstream` row below); Company administration stays Admin-only end to end, unchanged from before CD-217. |
| `canCreateWorkstream` | Creating a new Service from the Company-level legacy path (no Project) — Team Lead or Admin. Unaffected by CD-217; not used by the new Project-level Apply Template (see below). |
| `canConfigureWorkstreamActivities(viewer, workstream, allUsers, project)` | Admin → true; Team Lead → must manage the Service's *Project* lead AND have Project access; else → false. **Never** consults `ServiceStaffing`/Global Team Lead status. |
| `canViewTeamActivityPage` (and its two predecessors, `canViewTeamUpdatesPage`/`canViewTeamTimePage`, kept for reference) | Team Lead or Admin — byte-identical predicate across all three |

### Task

| Function | Gates |
|---|---|
| `canAccessTask` | **Read** visibility (Admin all; Team Lead any assignee on their team, or unassigned + company access; Employee own assignments + company access) |
| `canAccessTaskDirectly` | **Mutation** authorization — same current shape as `canAccessTask`, but semantically the one to use for any write, kept distinct on purpose |
| `canEditTask` / `canDeleteTask` | Admin always; Team Lead via `canAccessTaskDirectly`; Employee only a self-added task they created |
| `canProgressTask` | Status/checklist changes — Admin always; Team Lead via `canAccessTaskDirectly`; Employee only if assigned |
| `canLogTime` | Only your own assigned tasks |
| `canCreateHandoff` / `canAcknowledgeHandoff` | Legacy — no live creation UI remains (see `domain-model.md`) |

### Daily Update

| Function | Gates |
|---|---|
| `canViewDailyUpdate` | Owner; Employee never sees another's; else `managesUser` |
| `canEditDailyUpdate` / `canReopenDailyUpdate` | Owner only, and only while draft / confirmed respectively |
| `canReviewDailyUpdate` | Confirmed + not already reviewed + not your own + (`managesUser` or Admin) |

### Time Entry

| Function | Gates |
|---|---|
| `canViewTimeForUser` | Self, or `managesUser` |
| `canCorrectTimeEntry` | **Never self-service, even for Admin** — always a second party, and never an Employee |
| `canEditVisitEntry` / `canDeleteVisitEntry` | Own Visit Entry; delete also allows Admin |

### Admin

| Function | Gates |
|---|---|
| `canInviteUsers` / `canManageAdminUsers` / `canViewOrgCounts` / `canEditOwnProfile` | All Admin (superadmin) only |
| `hasReportingReviewAccess` | Admin always, or the orthogonal `reportingReviewAccess` flag |

### Reports & Documents

Accomplishments Report and Client Report each have their own owner/view/edit/finalize/trash/restore functions, all following the same self-or-`managesUser` shape. Documents follow a **read-broad, write-narrow** split: `canAccessDocumentRecord` (broad, mirrors Task/Project read access) vs. `canManageDocument` (narrow — composes `canAccessTaskDirectly` for Task-linked documents, since uploading/deleting is a mutation, not a read). This broad-read/narrow-write split is a reusable pattern worth recognizing elsewhere in the codebase, not a one-off.

## Known gaps and dead code (documented, not hidden)

- **`canConfigureWorkstreamActivities` app-layer/RLS parity — RESOLVED, but the source comment is stale.** The doc comment directly above `canConfigureWorkstreamActivities` in `permissions.ts` still says the hosted `workstream_activities_write` RLS policy "still technically permits an Employee-as-lead write" and that closing it was out of scope for that pass. That was true when the comment was written, but migration `20260910090000_employee_service_activity_authorization_parity.sql` (applied to hosted, part of CD-162) subsequently removed the Employee-as-lead clause from exactly the three places the comment describes: the `workstream_activities_write` RLS policy itself, `create_workstream()`, and `create_task()`'s `may_extend_activities` check — all three now match the app layer (Team Lead/Admin only). No later migration reintroduces or touches any of the three. **Current state: app layer and hosted RLS agree — there is no live parity gap.** The `permissions.ts` comment itself was not edited (this was a documentation-only pass; see `decisions.md`) — treat updating that comment as a small, low-risk follow-up cleanup whenever someone is next in that file, not an active security concern.
- **Dead permission functions** (exported, zero call sites found anywhere in `src/` as of this audit): `canManageTeam`, `canViewUserReport`, `canGenerateClientFacingReport`. The latter two look superseded by `canViewAccomplishmentsReport`/`canGenerateClientReport`. Safe to ignore; confirm with a fresh grep before removing.

## RLS pattern (hosted Supabase)

Two coexisting patterns, not one uniform rule:

1. **Simple single-table CRUD** — direct `INSERT`/`UPDATE` grants to `authenticated`, gated by an RLS policy that calls a `can_access_*()`/role-helper SQL function (e.g. `companies_insert`, `tasks_update`).
2. **Complex or invariant-sensitive mutations** — no direct grant at all; funneled through `SECURITY DEFINER` RPCs (`create_workstream`, `create_task`, `start_timer`/`stop_timer`, `set_project_status`, `delete_task`, `correct_time_entry`, etc.), which re-validate authorization themselves before mutating.

Do not assume "everything goes through an RPC" — verify per-table. See `data-and-supabase.md` for the migration-by-migration detail.

**Phase 3 (CD-208) followed pattern 2 deliberately, not pattern 1**: rather than widen `projects_update`/`project_groups_write_admin` RLS to admit Supervisor directly (which can't safely protect individual fields like Name/Partner Brand/Owner), a Team Lead's Project edits now route through new `SECURITY DEFINER` RPCs — `update_project_record` (field-level protection enforced in the function body), `apply_project_templates` (atomic multi-Template application, `can_manage_project`-gated), `create_project_group` (Admin-or-Supervisor). The underlying `projects_update`/`project_groups_write_admin` RLS policies themselves stay exactly Superadmin-only, unchanged — a raw client call bypassing these RPCs still can't touch either table as a Supervisor.
