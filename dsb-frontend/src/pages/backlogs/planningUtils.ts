import type { AgendaWorkItem, SprintSummary } from '../../types/planning';
import type { UserProfile } from '../../types/auth';
import { isElevatedWorkspaceRole } from '../../utils/userProfile';
import { formatDateRange } from '../../utils/dateFormatter';

export const STORY_TYPE = 'Story';
export const TASK_TYPE = 'Task';

export function normTypeName(w: Pick<AgendaWorkItem, 'typeName'>): string {
    return (w.typeName ?? '').trim().toLowerCase();
}

export { formatDateRange };

export function canManageSprint(me: UserProfile | null, sprint: SprintSummary) {
    if (!me) return false;
    if (isElevatedWorkspaceRole(me)) return true;
    if (me.userID && sprint.managedBy !== null && sprint.managedBy === me.userID) return true;
    return false;
}

/**
 * Can edit sprint metadata (name, goal, dates, manager, team).
 * Only Admin/Scrum Master can change the sprint's manager and team.
 */
export function canEditSprintMetadata(me: UserProfile | null, _sprint: SprintSummary) {
    if (!me) return false;
    return isElevatedWorkspaceRole(me);
}

/**
 * Can change work item assignees within a sprint.
 * Allowed for: Admin/Scrum Master, Sprint Manager, or the work item assignee.
 */
export function canChangeWorkItemAssignee(
    me: UserProfile | null,
    sprint: SprintSummary,
    workItemAssignedTo: number | null
) {
    if (!me) return false;
    if (isElevatedWorkspaceRole(me)) return true;
    if (sprint.managedBy !== null && me.userID === sprint.managedBy) return true;
    if (workItemAssignedTo !== null && me.userID === workItemAssignedTo) return true;
    return false;
}

/**
 * Can comment on a work item in the sprint.
 * Allowed for: Admin/Scrum Master, Sprint Manager, or the work item assignee.
 */
export function canCommentOnWorkItem(
    me: UserProfile | null,
    sprint: SprintSummary | null,
    workItemAssignedTo: number | null
) {
    if (!me) return false;
    if (isElevatedWorkspaceRole(me)) return true;
    if (sprint != null && sprint.managedBy !== null && me.userID === sprint.managedBy) return true;
    if (workItemAssignedTo !== null && me.userID === workItemAssignedTo) return true;
    return false;
}

/**
 * Can start/stop a sprint.
 * Allowed for: Admin/Scrum Master, Sprint Manager.
 */
export function canStartStopSprint(me: UserProfile | null, sprint: SprintSummary) {
    if (!me) return false;
    if (isElevatedWorkspaceRole(me)) return true;
    if (sprint.managedBy !== null && me.userID === sprint.managedBy) return true;
    return false;
}

/**
 * Can delete a sprint.
 * Only Admin/Scrum Master can delete.
 */
export function canDeleteSprint(me: UserProfile | null, _sprint: SprintSummary) {
    if (!me) return false;
    return isElevatedWorkspaceRole(me);
}

export function sprintManagerLabel(s: SprintSummary): string {
    const n = s.managedByName?.trim();
    if (n) return n;
    return 'TBD';
}

export function priorityAccentClass(priority: string | null | undefined): string {
    switch ((priority ?? '').toLowerCase()) {
        case 'high': return 'wi-accent--high';
        case 'medium': return 'wi-accent--medium';
        case 'low': return 'wi-accent--low';
        default: return 'wi-accent--default';
    }
}

export function statusAccentClass(status: string | null | undefined): string {
    switch ((status ?? '').toLowerCase()) {
        case 'todo': return 'wi-status--todo';
        case 'ongoing':
        case 'inprogress':
        case 'in progress': return 'wi-status--ongoing';
        case 'forchecking':
        case 'for checking':
        case 'review': return 'wi-status--review';
        case 'completed':
        case 'done': return 'wi-status--completed';
        default: return 'wi-status--default';
    }
}

export function sprintStatusClass(status: string): string {
    switch (status.toLowerCase()) {
        case 'active': return 'sprint-badge--active';
        case 'planned': return 'sprint-badge--planned';
        case 'completed': return 'sprint-badge--completed';
        default: return 'sprint-badge--planned';
    }
}
