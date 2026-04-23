import apiClient from '../services/apiClient';
import type { SprintSummary } from '../types/planning';

type PagedSprintsResponse = {
    page: number;
    pageSize: number;
    total: number;
    items: SprintSummary[];
};

function num(raw: Record<string, unknown>, ...keys: string[]): number {
    for (const k of keys) {
        const v = raw[k];
        if (v === undefined || v === null) continue;
        const n = Number(v);
        if (Number.isFinite(n)) return n;
    }
    return 0;
}

function nullableId(raw: Record<string, unknown>, ...keys: string[]): number | null {
    for (const k of keys) {
        if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
        const v = raw[k];
        if (v === undefined || v === null) return null;
        const n = Number(v);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

/** Normalizes sprint list/detail payloads (camelCase or PascalCase). */
export function normalizeSprintSummary(raw: Record<string, unknown>): SprintSummary {
    const mn = raw.managedByName ?? raw.ManagedByName;
    const managedByName =
        typeof mn === 'string' && mn.trim() !== '' ? mn.trim() : null;
    const tn = raw.teamName ?? raw.TeamName;
    const teamName =
        typeof tn === 'string' && tn.trim() !== '' ? tn.trim() : null;
    return {
        sprintID: num(raw, 'sprintID', 'SprintID') || 0,
        sprintName: String(raw.sprintName ?? raw.SprintName ?? ''),
        goal: raw.goal !== undefined ? (raw.goal as string | null) : (raw.Goal as string | null | undefined) ?? null,
        startDate:
            raw.startDate != null
                ? String(raw.startDate)
                : raw.StartDate != null
                  ? String(raw.StartDate)
                  : null,
        endDate:
            raw.endDate != null
                ? String(raw.endDate)
                : raw.EndDate != null
                  ? String(raw.EndDate)
                  : null,
        status: String(raw.status ?? raw.Status ?? ''),
        managedBy: nullableId(raw, 'managedBy', 'ManagedBy'),
        managedByName,
        teamID: nullableId(raw, 'teamID', 'TeamID'),
        teamName,
        createdAt:
            raw.createdAt != null
                ? String(raw.createdAt)
                : raw.CreatedAt != null
                  ? String(raw.CreatedAt)
                  : null,
        updatedAt:
            raw.updatedAt != null
                ? String(raw.updatedAt)
                : raw.UpdatedAt != null
                  ? String(raw.UpdatedAt)
                  : null,
        storyCount: num(raw, 'storyCount', 'StoryCount'),
        taskCount: num(raw, 'taskCount', 'TaskCount'),
    };
}

export const listSprints = async (params?: {
    status?: string;
    teamId?: number;
    managedBy?: number;
    from?: string;
    to?: string;
    search?: string;
    sortBy?: string;
    sortDirection?: string;
    page?: number;
    pageSize?: number;
}): Promise<PagedSprintsResponse> => {
    const qs = new URLSearchParams();
    if (params) {
        if (params.status) qs.set('status', params.status);
        if (params.teamId !== undefined) qs.set('teamId', String(params.teamId));
        if (params.managedBy !== undefined) qs.set('managedBy', String(params.managedBy));
        if (params.from) qs.set('from', params.from);
        if (params.to) qs.set('to', params.to);
        if (params.search) qs.set('search', params.search);
        if (params.sortBy) qs.set('sortBy', params.sortBy);
        if (params.sortDirection) qs.set('sortDirection', params.sortDirection);
        if (params.page) qs.set('page', String(params.page));
        if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    }
    const qsStr = qs.toString();
    const res = await apiClient.get<{
        page: number;
        pageSize: number;
        total: number;
        items: Record<string, unknown>[];
    }>(`/api/sprints${qsStr ? `?${qsStr}` : ''}`);
    return {
        page: res.page,
        pageSize: res.pageSize,
        total: res.total,
        items: Array.isArray(res.items) ? res.items.map((row) => normalizeSprintSummary(row)) : [],
    };
};

export const getSprintById = async (sprintId: number): Promise<SprintSummary> => {
    const raw = await apiClient.get<Record<string, unknown>>(`/api/sprints/${sprintId}`);
    return normalizeSprintSummary(raw);
};

/**
 * Fetches complete sprint details including work items and computed metrics.
 * This combines GET /api/sprints/{id} and GET /api/workitems/sprint/{sprintId}
 * to provide a full picture of the sprint's state.
 */
export const getSprintDetails = async (sprintId: number): Promise<{
    sprint: SprintSummary;
    workItems: import('../types/planning').AgendaWorkItem[];
}> => {
    // Import dynamically to avoid circular dependency
    const { getSprintWorkItems } = await import('./workItemsApi');
    
    // Fetch sprint details and work items in parallel
    const [sprintRaw, workItems] = await Promise.all([
        apiClient.get<Record<string, unknown>>(`/api/sprints/${sprintId}`),
        getSprintWorkItems(sprintId).catch(() => []), // Fallback to empty array on error
    ]);
    
    const sprint = normalizeSprintSummary(sprintRaw);
    
    return { sprint, workItems };
};

export const createSprint = async (payload: {
    sprintName: string;
    goal: string;
    startDate: string; // YYYY-MM-DD
    endDate: string; // YYYY-MM-DD
    managedBy: number;
    teamID?: number | null;
}) =>
    apiClient.post('/api/sprints', {
        sprintName: payload.sprintName,
        goal: payload.goal,
        startDate: payload.startDate,
        endDate: payload.endDate,
        managedBy: payload.managedBy,
        teamID: payload.teamID ?? null,
    });

export const patchSprint = async (sprintId: number, payload: {
    sprintName?: string | null;
    goal?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    teamID?: number | null;
    managedBy?: number | null;
}) =>
    apiClient.patch(`/api/sprints/${sprintId}`, {
        sprintName: payload.sprintName ?? null,
        goal: payload.goal ?? null,
        startDate: payload.startDate ?? null,
        endDate: payload.endDate ?? null,
        teamID: payload.teamID ?? null,
        managedBy: payload.managedBy ?? null,
    });

export const startSprint = async (sprintId: number) =>
    apiClient.put(`/api/sprints/${sprintId}/start`);

export const stopSprint = async (sprintId: number, confirm: boolean) =>
    apiClient.put(`/api/sprints/${sprintId}/stop`, { confirm });

export const completeSprint = async (sprintId: number, confirm: boolean) =>
    apiClient.put(`/api/sprints/${sprintId}/complete`, { confirm });

export const deleteSprint = async (sprintId: number) =>
    apiClient.delete(`/api/sprints/${sprintId}`);

