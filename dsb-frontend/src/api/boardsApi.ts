import apiClient from '../services/apiClient';
import type { ActiveBoard, BoardResponse } from '../types/board';

function pickField<T>(raw: Record<string, unknown>, camel: string, pascal: string): T | undefined {
  return (raw[camel] ?? raw[pascal]) as T | undefined;
}

function normalizeWorkItem(raw: Record<string, unknown>) {
  return {
    workItemID: Number(pickField(raw, 'workItemID', 'WorkItemID') ?? 0),
    title: String(pickField(raw, 'title', 'Title') ?? ''),
    status: String(pickField(raw, 'status', 'Status') ?? ''),
    typeName: (pickField<string | null>(raw, 'typeName', 'TypeName') as string | null | undefined) ?? null,
    priority: (pickField<string | null>(raw, 'priority', 'Priority') as string | null | undefined) ?? null,
    assignedUserID: (pickField<number | null>(raw, 'assignedUserID', 'AssignedUserID') as number | null | undefined) ?? null,
    assignedUserName: (pickField<string | null>(raw, 'assignedUserName', 'AssignedUserName') as string | null | undefined) ?? null,
    teamID: (pickField<number | null>(raw, 'teamID', 'TeamID') as number | null | undefined) ?? null,
    commentCount: Number(pickField(raw, 'commentCount', 'CommentCount') ?? 0),
    dueDate: (pickField<string | null>(raw, 'dueDate', 'DueDate') as string | null | undefined) ?? null,
    boardOrder: (pickField<number | null>(raw, 'boardOrder', 'BoardOrder') as number | null | undefined) ?? undefined,
  };
}

function normalizeBoardResponse(raw: Record<string, unknown>): BoardResponse {
  const toArray = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]).map(normalizeWorkItem) : []);
  return {
    sprintID: Number(pickField(raw, 'sprintID', 'SprintID') ?? 0),
    sprintName: String(pickField(raw, 'sprintName', 'SprintName') ?? ''),
    sprintManagerId: (pickField<number | null>(raw, 'sprintManagerId', 'SprintManagerId') as number | null | undefined) ?? null,
    sprintManagerName: (pickField<string | null>(raw, 'sprintManagerName', 'SprintManagerName') as string | null | undefined) ?? null,
    sprintTeamID: (pickField<number | null>(raw, 'sprintTeamID', 'SprintTeamID') as number | null | undefined) ?? null,
    sprintTeamName: (pickField<string | null>(raw, 'sprintTeamName', 'SprintTeamName') as string | null | undefined) ?? null,
    todo: toArray(raw.todo ?? raw.Todo),
    ongoing: toArray(raw.ongoing ?? raw.Ongoing),
    forChecking: toArray(raw.forChecking ?? raw.ForChecking),
    completed: toArray(raw.completed ?? raw.Completed),
  };
}

export async function getActiveBoards(): Promise<ActiveBoard[]> {
  return apiClient.get<ActiveBoard[]>('/api/boards/active');
}

export async function getBoard(sprintId: number): Promise<BoardResponse> {
  const resp = await apiClient.get<Record<string, unknown>>(`/api/boards/${sprintId}`);
  return normalizeBoardResponse(resp);
}

export async function moveWorkItem(workItemId: number, newStatus: string): Promise<void> {
  await apiClient.patch(`/api/boards/workitems/${workItemId}/move`, { newStatus });
}