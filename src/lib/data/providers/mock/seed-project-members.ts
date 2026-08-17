import type { ProjectMember } from "../../types";
import { seedProjects } from "./seed-projects";
import { seedUsers } from "./seed-users";
import { seedWorkstreams } from "./seed-workstreams";
import { seedWorkstreamMembers } from "./seed-workstream-members";
import { seedTasks } from "./seed-tasks";
import { seedTaskAssignees } from "./seed-task-assignees";

/**
 * Deterministic backfill, mirroring the real hosted migration's own logic exactly
 * (20260815090001_projects_backfill.sql) — derives legitimate current operational access from
 * every relevant relationship (assignedCompanyIds ~ user_companies, Workstream lead, Workstream
 * members, Task assignees, Task creator, Task status-changer), deduplicated per Project.
 */
function companyIdsForWorkstream(workstreamId: string): string | undefined {
  return seedWorkstreams.find((w) => w.id === workstreamId)?.companyId;
}

export const seedProjectMembers: ProjectMember[] = seedProjects.flatMap((project) => {
  const userIds = new Set<string>();

  for (const user of seedUsers) {
    if (user.assignedCompanyIds.includes(project.companyId)) userIds.add(user.id);
  }
  for (const workstream of seedWorkstreams) {
    if (workstream.companyId === project.companyId) userIds.add(workstream.leadUserId);
  }
  for (const member of seedWorkstreamMembers) {
    if (companyIdsForWorkstream(member.workstreamId) === project.companyId) userIds.add(member.userId);
  }
  for (const task of seedTasks) {
    if (task.companyId !== project.companyId) continue;
    userIds.add(task.createdById);
    if (task.statusChangedById) userIds.add(task.statusChangedById);
  }
  for (const assignee of seedTaskAssignees) {
    const task = seedTasks.find((t) => t.id === assignee.taskId);
    if (task?.companyId === project.companyId) userIds.add(assignee.userId);
  }

  return Array.from(userIds).map((userId) => ({ projectId: project.id, userId }));
});
