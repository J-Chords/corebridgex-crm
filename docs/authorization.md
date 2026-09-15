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
| `canManageCompanies` | Create/edit — Team Lead or Admin (Employee read-only) |
| `assignableStaffFor` | Who a viewer may assign to a company |

### Project

| Function | Gates |
|---|---|
| `canAccessProject` | Admin → all; Internal-company projects → all; Team Lead → owner or any member is a direct report; else → viewer is owner or member |
| `canManageProjects` | Project record create/edit/renew — **Admin (superadmin) only**, deliberately narrower than `canManageCompanies` |
| `canCreateWorkstreamInProject` | "+ Add Service" inside a Project — Team Lead or Admin |
| `canProgressProjectIssue` / `canEditProjectIssueDetails` | Admin, or the issue's creator/assignee |
| `canEditProjectComment` / `canDeleteProjectComment` | Own comment, or Admin for delete |

### Service (Workstream)

| Function | Gates |
|---|---|
| `canAccessWorkstream` | Same three-tier shape, scoped by `leadUserId`/`team` membership |
| `canManageWorkstreams` | Editing an *existing* Service's general fields (lead, team, recurrence, status, identity) — **Admin only** |
| `canCreateWorkstream` | Creating a new Service — Team Lead or Admin |
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
