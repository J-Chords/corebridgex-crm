# Decision Log

Durable architectural and product decisions a future contributor needs to know, so they aren't accidentally reversed. Not a full history — see the historical documents indexed in `README.md` for the exhaustive record. Each entry: **Decision / Why / Consequences**.

---

### Locked hierarchy: Project → Service → Activity → Task → Checklist

**Decision**: This is the final, accepted product hierarchy. No Subtask level exists.
**Why**: A Subtask concept (`tasks.parent_task_id`) was built, then deliberately removed — the Product Owner's final call, recorded verbatim in the removal migration: *"THERE ARE NO SUBTASKS IN COREBRIDGE X."*
**Consequences**: Unexpected additional work becomes another ordinary Task, never a nested item. Do not reintroduce task nesting. See `domain-model.md`.

---

### "Service" is the only visible term; "Workstream" stays internal

**Decision**: Every user-facing surface says "Service." "Workstream" is confined to code (types, table names, routes, RPC/RLS names).
**Why**: Product terminology was locked to match how the business actually talks about client work, without forcing a full schema rename.
**Consequences**: New UI copy must never say "Workstream." New code may freely use `Workstream`/`workstream*` identifiers — that's expected and correct.

---

### Global staffing never implies Project-level authority

**Decision**: "Global Team Lead" (Services Led) and "Works In Services" are org-wide, per-catalog-Service-Line relationships. They never automatically grant leadership or team membership on any specific Project's Service instance.
**Why**: Explicit product decision, stated directly in code: *"a global Team Lead relationship grants no automatic Project authority in V1."*
**Consequences**: Adding someone to a Project's Service (as lead or team member) is always a separate, explicit action — never inferred from their global staffing record. See `domain-model.md`'s comparison table.

---

### Comments is the one canonical discussion mechanism; Notes and Handoff authoring are retired

**Decision**: New Task/Project discussion happens in Comments. Creating a new "Task Note" or a new "Task Handoff" is retired — no UI exists to author either.
**Why**: Consolidation of what had become three overlapping discussion mechanisms into one.
**Consequences**: Historical Notes/Handoff data is preserved read-only, not deleted. Ownership transfer today is "change Assignee(s) + add a Comment," not a Handoff record. Company-level Notes ("Client Context") is a separate, still-live feature — don't confuse the two.

---

### Team Activity is a UI/navigation merge, not a data-model merge

**Decision**: `/dashboard/team-activity` replaced two separate pages (Team Updates, Team Time), sharing one roster/date/selection shell. `daily_updates` and `time_entries` remain two entirely separate tables/models.
**Why**: The two old pages shared ~70% identical chrome (roster card, date stepper, empty states) despite representing genuinely different business concepts — merging the shell removed real duplication without forcing an unnatural data-model merge.
**Consequences**: Don't look for a unified "team activity" table — there isn't one. Old bookmarks to the two retired routes still work via a 307 redirect (temporary, not cached hard) to the correct tab of the new page.

---

### Local calendar-date semantics, not UTC slicing, for "which day does this belong to"

**Decision**: Any code answering "what calendar day is this for the user" must use `src/lib/planner-dates.ts`'s helpers (`dateKeyFromTimestamp`, `localDayBoundsUtc`, `todayDateOnly`, `parseDateOnly`) — never a raw `.toISOString().slice(0, 10)`.
**Why**: A real defect (found during CD-190 stabilization): a manually-logged "Duration" mode time entry, anchored at local midnight, was misclassified onto the *previous* calendar day for any positive-UTC-offset user, because the reading code took a naive UTC-string-slice instead of converting back to local time. See `troubleshooting.md` for the full mechanism.
**Consequences**: The fix was applied narrowly (mock/Supabase time-entry date-scoped queries, My Day's Today card, the manual time-entry dialog's date handling) — it was **not** applied to the many other UTC-slice call sites across the app (due-date/overdue classification, various default-date fields) that share the same anti-pattern but weren't in scope for that fix. Tracked as its own follow-up ticket (CD-193, `Corebridge X — Normalize local-date handling across task and dashboard date surfaces`) — see `current-state.md`. Don't assume every UTC-slice call site has been fixed; check each one.

---

### Project vs. Company: Project is the visible client workspace; Company is the technical record underneath

**Decision**: `/dashboard/projects` is the one primary destination for every role. `/dashboard/companies` still exists and still holds the real underlying data/RLS, but is no longer a primary nav item and is reachable mainly by direct URL for Admin-level technical administration.
**Why**: Simplification pass — most day-to-day editing (brand, status, contacts) now happens inline on a Project's own Overview tab via the same dialogs Company detail uses, so visiting Company detail directly became rare.
**Consequences**: Company as a concept/table/RLS boundary is not deprecated — don't remove it. It's demoted in navigation prominence, not in architecture.

---

### Read-broad, write-narrow authorization split (Documents, and a reusable pattern elsewhere)

**Decision**: For Task-linked Documents, viewing/downloading uses the broad `canAccessTask` check; uploading, editing metadata, soft-deleting, and restoring use the narrower `canAccessTaskDirectly`.
**Why**: Viewing is safe to extend to anyone with legitimate visibility into a Task's hierarchy; mutating is a stricter boundary.
**Consequences**: This pattern (broad read / narrow write) recurs elsewhere in the authorization model — recognize it rather than treating each occurrence as a one-off when reviewing new permission functions.

---

### Deactivating a user must revoke role-based privileges everywhere, not just at the DB layer

**Decision**: Every core role-check function (`isSuperadmin`, `isSupervisor`, `isEmployee`, `managesUser`) folds in an `active` check.
**Why**: A defense-in-depth gap was found where several RLS policies/RPCs gated access via a raw `<column> = auth.uid()` ownership check that never called a role-helper function at all — meaning a deactivated user's existing ownership could still pass. Fixed via a canonical `is_current_user_active()` SQL helper composed into every authorization entry point.
**Consequences**: When adding a new permission check (app-layer or RLS), compose the existing active-user helpers rather than writing a fresh ownership check from scratch.

---

### No AI/assistant attribution in Git history

**Decision**: Commits never include `Co-Authored-By: Claude`, `Co-Authored-By: ChatGPT`, or any other AI/model/assistant attribution trailer. Normal human authorship (the actual developer) is the sole Git author/committer.
**Why**: Explicit, repeated Product Owner instruction across this project's development.
**Consequences**: Any tooling or workflow that auto-inserts AI attribution trailers must be disabled/overridden for this repo. If you find a historical commit with such a trailer, it was a mistake later corrected (see the CD-162 branch-history cleanup, which rewrote two commits specifically to strip trailers while preserving content, order, and human authorship).
