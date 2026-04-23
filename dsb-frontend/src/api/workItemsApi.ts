import apiClient from '../services/apiClient';
import type {
    AgendaWorkItem,
    EpicTile,
    AgendaSprint,
    WorkItemDetails,
} from '../types/planning';

function pickField<T>(raw: Record<string, unknown>, camel: string, pascal: string): T | undefined {
    const v = raw[camel] ?? raw[pascal];
    return v as T | undefined;
}

function normalizeAgendaWorkItem(raw: Record<string, unknown>): AgendaWorkItem {
    return {
        workItemID: Number(pickField(raw, 'workItemID', 'WorkItemID') ?? 0),
        title: String(pickField(raw, 'title', 'Title') ?? ''),
        typeName: String(pickField(raw, 'typeName', 'TypeName') ?? ''),
        status: String(pickField(raw, 'status', 'Status') ?? ''),
        priority: (pickField<string | null>(raw, 'priority', 'Priority') as string | null | undefined) ?? null,
        dueDate: (pickField<string | null>(raw, 'dueDate', 'DueDate') as string | null | undefined) ?? null,
        parentWorkItemID:
            (pickField<number | null>(raw, 'parentWorkItemID', 'ParentWorkItemID') as number | null | undefined) ??
            null,
        sprintID: (pickField<number | null>(raw, 'sprintID', 'SprintID') as number | null | undefined) ?? null,
        teamID: (pickField<number | null>(raw, 'teamID', 'TeamID') as number | null | undefined) ?? null,
        assignedUserID:
            (pickField<number | null>(raw, 'assignedUserID', 'AssignedUserID') as number | null | undefined) ?? null,
        assignedUserTeamId:
            (pickField<number | null>(raw, 'assignedUserTeamId', 'AssignedUserTeamId') as number | null | undefined) ?? null,
    };
}

function normalizeAgendaSprint(raw: Record<string, unknown>): AgendaSprint {
    const nested = raw.workItems ?? raw.WorkItems;
    const workItems = Array.isArray(nested)
        ? (nested as Record<string, unknown>[]).map(normalizeAgendaWorkItem)
        : [];
    return {
        sprintID: Number(pickField(raw, 'sprintID', 'SprintID') ?? 0),
        sprintName: String(pickField(raw, 'sprintName', 'SprintName') ?? ''),
        status: String(pickField(raw, 'status', 'Status') ?? ''),
        startDate: (pickField<string | null>(raw, 'startDate', 'StartDate') as string | null | undefined) ?? null,
        endDate: (pickField<string | null>(raw, 'endDate', 'EndDate') as string | null | undefined) ?? null,
        workItems,
    };
}

function normalizeAgendasPayload(raw: Record<string, unknown>): {
    sprints: AgendaSprint[];
    workItems: AgendaWorkItem[];
} {
    const wi = raw.workItems ?? raw.WorkItems;
    const sp = raw.sprints ?? raw.Sprints;
    const workItems = Array.isArray(wi)
        ? (wi as Record<string, unknown>[]).map(normalizeAgendaWorkItem)
        : [];
    const sprints = Array.isArray(sp) ? (sp as Record<string, unknown>[]).map(normalizeAgendaSprint) : [];
    return { sprints, workItems };
}

export const getEpicTiles = async (params?: {
    search?: string;
    sortBy?: string;
    sortDirection?: string;
}): Promise<EpicTile[]> => {
    const search = params?.search ?? '';
    const sortBy = params?.sortBy ?? '';
    const sortDirection = params?.sortDirection ?? '';
    const qs = new URLSearchParams({
        search,
        sortBy,
        sortDirection,
    });
    return apiClient.get<EpicTile[]>(`/api/workitems/epics?${qs.toString()}`);
};

export const getBacklogItems = async (): Promise<AgendaWorkItem[]> =>
    apiClient.get<AgendaWorkItem[]>('/api/workitems/backlog');

export const getAgendasFiltered = async (params: {
    status?: string;
    priority?: string;
    workItemType?: string;
    teamId?: number;
    assigneeId?: number;
    sortBy?: string;
    sortDirection?: string;
}): Promise<{ sprints: AgendaSprint[]; workItems: AgendaWorkItem[] }> => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.priority) qs.set('priority', params.priority);
    if (params.workItemType) qs.set('workItemType', params.workItemType);
    if (params.teamId !== undefined) qs.set('teamId', String(params.teamId));
    if (params.assigneeId !== undefined) qs.set('assigneeId', String(params.assigneeId));
    if (params.sortBy) qs.set('sortBy', params.sortBy);
    if (params.sortDirection) qs.set('sortDirection', params.sortDirection);

    const resp = await apiClient.get<Record<string, unknown>>(`/api/workitems/agendas?${qs.toString()}`);
    return normalizeAgendasPayload(resp);
};

export const getSprintWorkItems = async (sprintId: number): Promise<AgendaWorkItem[]> =>
    apiClient.get<AgendaWorkItem[]>(`/api/workitems/sprint/${sprintId}`);

export const getTasksByParentId = async (parentId: number): Promise<AgendaWorkItem[]> =>
    apiClient.get<AgendaWorkItem[]>(`/api/workitems/tasks/by-parent?parentId=${parentId}`);

export const assignToSprint = async (workItemId: number, sprintId: number) =>
    apiClient.put(`/api/workitems/${workItemId}/assign-sprint`, { sprintID: sprintId });

export const removeFromSprint = async (workItemId: number) =>
    apiClient.put(`/api/workitems/${workItemId}/remove-sprint`);

export const deleteWorkItem = async (workItemId: number) =>
    apiClient.delete(`/api/workitems/${workItemId}`);

export const patchWorkItem = async (workItemId: number, payload: {
    title?: string;
    description?: string | null;
    status?: string;
    priority?: string | null;
    dueDate?: string | null;
    assignedUserID?: number | null;
    clearAssignee?: boolean;
    teamID?: number | null;
    parentWorkItemID?: number | null;
    sprintID?: number | null;
}) =>
    apiClient.patch(`/api/workitems/${workItemId}`, {
        ...(payload.title && { title: payload.title }),
        ...(payload.description !== undefined && { description: payload.description }),
        ...(payload.status && { status: payload.status }),
        ...(payload.priority !== undefined && { priority: payload.priority }),
        ...(payload.dueDate !== undefined && { dueDate: payload.dueDate }),
        ...(payload.assignedUserID !== undefined && { assignedUserID: payload.assignedUserID }),
        ...(payload.clearAssignee && { clearAssignee: payload.clearAssignee }),
        ...(payload.teamID !== undefined && { teamID: payload.teamID }),
        ...(payload.parentWorkItemID !== undefined && { parentWorkItemID: payload.parentWorkItemID }),
        ...(payload.sprintID !== undefined && { sprintID: payload.sprintID }),
    });

export const getWorkItemDetails = async (workItemId: number): Promise<WorkItemDetails> =>
    apiClient.get<WorkItemDetails>(`/api/workitems/${workItemId}/details`);

export type WorkItemParentOption = {
    workItemID: number;
    title: string;
    typeName: string;
    dueDate: string | null;
};

function normalizeWorkItemParent(raw: Record<string, unknown>): WorkItemParentOption {
    return {
        workItemID: Number(pickField(raw, 'workItemID', 'WorkItemID') ?? 0),
        title: String(pickField(raw, 'title', 'Title') ?? ''),
        typeName: String(pickField(raw, 'type', 'Type') ?? ''),
        dueDate: (pickField<string | null>(raw, 'dueDate', 'DueDate') as string | null | undefined) ?? null,
    };
}

/** Parent work items allowed for Story (Epics) or Task (Epics + Stories). */
export const getWorkItemParents = async (forType: 'Story' | 'Task'): Promise<WorkItemParentOption[]> => {
    const qs = new URLSearchParams({ forType });
    const resp = await apiClient.get<Record<string, unknown>[]>(`/api/workitems/parents?${qs.toString()}`);
    if (!Array.isArray(resp)) return [];
    return resp.map(r => normalizeWorkItemParent(r));
};

// Used by "Add Item" modal
export const createWorkItem = async (payload: {
    type: 'Epic' | 'Story' | 'Task';
    title: string;
    description: string;
    priority: 'Low' | 'Medium' | 'High';
    parentWorkItemID?: number | null;
    teamID?: number | null;
    assignedUserID?: number | null;
    dueDate?: string | null;
}) =>
    apiClient.post('/api/workitems', {
        type: payload.type,
        title: payload.title,
        description: payload.description,
        priority: payload.priority,
        parentWorkItemID: payload.parentWorkItemID ?? null,
        teamID: payload.teamID ?? null,
        assignedUserID: payload.assignedUserID ?? null,
        dueDate: payload.dueDate ?? null,
    });

// Used by sprint work-item assignee actions
export const updateWorkItem = async (workItemId: number, payload: {
    assignedUserID?: number | null;
    title?: string | null;
    description?: string | null;
    priority?: string | null;
    parentWorkItemID?: number | null;
    teamID?: number | null;
}) =>
    apiClient.patch(`/api/workitems/${workItemId}`, payload);

