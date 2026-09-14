"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useTask } from "@/lib/data/hooks/use-tasks";
import { useTaskTimer } from "@/lib/data/hooks/use-task-timer";
import { useCompanyLookups } from "@/lib/data/hooks/use-companies";
import { canEditTask, canProgressTask } from "@/lib/data/permissions";
import { tasksProvider } from "@/lib/data/providers";
import type { TaskWithRelations } from "@/lib/data/providers/tasks-provider";
import type { TaskStatus, User } from "@/lib/data/types";
import { CompanyProjectAvatar } from "@/components/companies/company-project-avatar";
import { TaskStatusAvatar } from "@/components/tasks/task-status-avatar";
import { isLikelyInternalTask } from "@/lib/data/identity-color";
import { workstreamDisplayHeading } from "@/lib/data/workstream-name";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskActionsMenu } from "@/components/tasks/task-actions-menu";
import { TaskDetailContent } from "@/components/tasks/task-detail-content";
import { TaskTimerControl } from "@/components/tasks/task-timer-control";
import { TaskPropertiesRail } from "@/components/tasks/task-properties-rail";
import { Button } from "@/components/ui/button";

/**
 * MVP Gap Closure (boss feedback) — a Task can now be opened from several different origin screens
 * (Tasks list, My Day Today/Week/Month, a Project's Tasks tab), so a hardcoded
 * `href="/dashboard/tasks"` would silently strand a My Day visitor on the generic Tasks list instead
 * of returning them to My Day. `router.back()` (falling back to the Tasks list only when there's no
 * in-app history, e.g. a direct link or a new tab) returns to wherever the visitor actually came
 * from, preserving that screen's own filter/view state exactly as left. The label is deliberately
 * generic ("Back", not "Back to tasks") rather than guessing/naming a specific destination — the
 * browser has no reliable, low-complexity way to know in advance which of several possible origin
 * screens `back()` will land on, and a generic label is truthful regardless of which one it is.
 */
function BackLink({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push("/dashboard/tasks");
        }
      }}
      className={`flex items-center text-sm text-muted-foreground hover:underline ${className}`}
    >
      <ArrowLeft className="mr-1 inline size-3.5" aria-hidden="true" />
      Back
    </button>
  );
}

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { task, isLoading, notFound, refresh } = useTask(id);

  if (!user) return null;

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (notFound || !task) {
    return (
      <div className="flex flex-col items-start gap-3">
        <BackLink />
        <p className="text-sm text-muted-foreground">
          This task doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
      </div>
    );
  }

  return <LoadedTaskDetailPage task={task} user={user} refresh={refresh} />;
}

/**
 * Bug fix (Phase 11) — the empty-UUID crash (`invalid input syntax for type uuid: ""`, reproduced
 * via `listTimeEntriesForTask`) came from calling `useTaskTimer(task?.id ?? "", ...)` unconditionally
 * at the top of `TaskDetailPage`, before `task` was guaranteed to exist. Splitting the timer-owning
 * content into this child component, which only ever mounts once `task` is a real, loaded object,
 * guarantees `useTaskTimer`/`useTaskTimeEntries` never run with an empty id — while still satisfying
 * the Rules of Hooks (this component's own hooks are always called consistently, since it's never
 * rendered without a real `task`).
 *
 * Phase 12B — two-column workspace layout (Part 25): a main work-area column (`TaskDetailContent`)
 * and a right property rail (`TaskPropertiesRail` + the rail-variant `TaskTimerControl`). Status-
 * change state/logic lives here now, since the rail's compact status control needs it —
 * `canProgressTask`/`updateTaskStatus` themselves are completely unchanged.
 */
function LoadedTaskDetailPage({ task, user, refresh }: { task: TaskWithRelations; user: User; refresh: () => void }) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  // The ONE authoritative timer instance for this page, shared by the right rail's timer widget and
  // the Time Activity history section below (via TaskDetailContent) — see use-task-timer.ts.
  const timer = useTaskTimer(task.id, task.assignees.map((a) => a.id));
  // Phase 13 security hardening — see task-actions-menu.tsx's own comment on why `assignableStaff`
  // is the right "allUsers" convenience list for this UI-only gate.
  const { assignableStaff } = useCompanyLookups();
  const assigneeIds = task.assignees.map((a) => a.id);
  const canEdit = canEditTask(user, { ...task, assigneeIds }, assignableStaff);
  const canProgress = canProgressTask(user, { assigneeIds, companyId: task.companyId }, assignableStaff);
  async function applyStatusChange(status: TaskStatus, statusReason?: string) {
    setStatusPending(true);
    try {
      await tasksProvider.updateTaskStatus(user, task.id, status, statusReason);
      refresh();
    } finally {
      setStatusPending(false);
    }
  }

  function handleStatusChange(status: string | null, statusReason?: string) {
    if (!status) return;
    void applyStatusChange(status as TaskStatus, statusReason);
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink className="w-fit" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <CompanyProjectAvatar
              companyId={task.company.id}
              companyName={task.company.name}
              size="sm"
              isInternal={isLikelyInternalTask(task)}
            />
            {/* Phase 13B final boss-feedback pass — Company name is the daily operational identity
                (never the redundant "Company → Project-with-year" chain); it still links to the
                Task's own Project, just labeled by the name people actually recognize. */}
            {task.workstream.projectId ? (
              <Link href={`/dashboard/projects/${task.workstream.projectId}`} className="font-medium text-foreground hover:underline">
                {task.company.name}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{task.company.name}</span>
            )}
            <span className="text-muted-foreground/60">→</span>
            {/* Product Owner acceptance correction, Section 9 — Project → Service → Activity is the
                primary hierarchy and must read immediately. MVP Gap Closure — the Project-Service
                qualifier/reference is no longer surfaced here at all (previously a hover tooltip):
                it had no demonstrable current-MVP workflow on a read-only page like this one, and
                only invited "what does this year-based reference mean?" confusion. Data is never
                removed — it's still a genuine, editable field on Edit Service itself. */}
            <Link href={`/dashboard/workstreams/${task.workstream.id}`} className="hover:underline">
              {workstreamDisplayHeading(task.workstream.name, task.workstream.serviceLineName)}
            </Link>
            {task.activity && (
              <>
                <span className="text-muted-foreground/60">→</span>
                <span>{task.activity.name}</span>
              </>
            )}
          </div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-semibold">
            <TaskStatusAvatar title={task.title} status={task.status} />
            <span className="truncate">{task.title}</span>
          </h1>
        </div>
        <div className="flex items-center gap-1">
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
          )}
          <TaskActionsMenu
            task={task}
            hideEditItem
            onEdit={() => setEditOpen(true)}
            onDeleted={() => {
              router.push(task.workstream.projectId ? `/dashboard/projects/${task.workstream.projectId}?tab=tasks` : "/dashboard/tasks");
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="order-2 lg:order-1">
          <TaskDetailContent task={task} onChanged={refresh} timer={timer} />
        </div>
        <div className="order-1 flex flex-col gap-5 lg:order-2 lg:border-l lg:pl-6">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Properties</span>
            <TaskPropertiesRail
              task={task}
              canProgress={canProgress}
              onStatusChange={handleStatusChange}
              statusPending={statusPending}
              timer={timer}
            />
          </div>
          <TaskTimerControl timer={timer} taskId={task.id} companyId={task.companyId} onTaskChanged={refresh} />
        </div>
      </div>

      {canEdit && (
        <TaskFormDialog open={editOpen} onOpenChange={setEditOpen} mode="edit" task={task} onSaved={refresh} />
      )}
    </div>
  );
}
