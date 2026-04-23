// ─────────────────────────────────────────────
// SIGNALR BROADCAST TYPES — for real-time board updates
// Aligned with backend WorkItemBroadcastDto
// ─────────────────────────────────────────────

export type WorkItemBroadcastDto = {
  workItemID: number;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  dueDate?: string | null;
  assignedUserID: number | null;
  assignedUserName?: string | null;
  workItemTypeID: number;
  workItemType: string;
  parentWorkItemID: number | null;
  teamID: number | null;
  sprintID: number | null;
  boardOrder: number;
  createdAt: string;
  updatedAt: string;
};

function pickField<T>(raw: Record<string, unknown>, camel: string, pascal: string): T | undefined {
  return (raw[camel] ?? raw[pascal]) as T | undefined;
}

export function normalizeWorkItemBroadcast(dto: unknown): WorkItemBroadcastDto | null {
  if (!dto || typeof dto !== 'object') return null;
  const raw = dto as Record<string, unknown>;
  const workItemID = Number(pickField(raw, 'workItemID', 'WorkItemID') ?? 0);
  // Some events (e.g. WorkItemStatusChanged) send `newStatus` instead of `status`.
  const status = String(
    pickField(raw, 'status', 'Status') ??
    pickField(raw, 'newStatus', 'NewStatus') ??
    ''
  );
  if (!Number.isFinite(workItemID) || workItemID <= 0 || !status.trim()) return null;

  return {
    workItemID,
    title: String(pickField(raw, 'title', 'Title') ?? ''),
    description: (pickField<string | null>(raw, 'description', 'Description') as string | null | undefined) ?? null,
    status,
    priority: (pickField<string | null>(raw, 'priority', 'Priority') as string | null | undefined) ?? null,
    dueDate: (pickField<string | null>(raw, 'dueDate', 'DueDate') as string | null | undefined) ?? null,
    assignedUserID: (pickField<number | null>(raw, 'assignedUserID', 'AssignedUserID') as number | null | undefined) ?? null,
    assignedUserName: (pickField<string | null>(raw, 'assignedUserName', 'AssignedUserName') as string | null | undefined) ?? null,
    workItemTypeID: Number(pickField(raw, 'workItemTypeID', 'WorkItemTypeID') ?? 0),
    workItemType: String(pickField(raw, 'workItemType', 'WorkItemType') ?? ''),
    parentWorkItemID: (pickField<number | null>(raw, 'parentWorkItemID', 'ParentWorkItemID') as number | null | undefined) ?? null,
    teamID: (pickField<number | null>(raw, 'teamID', 'TeamID') as number | null | undefined) ?? null,
    sprintID: (pickField<number | null>(raw, 'sprintID', 'SprintID') as number | null | undefined) ?? null,
    boardOrder: Number(pickField(raw, 'boardOrder', 'BoardOrder') ?? 0),
    createdAt: String(pickField(raw, 'createdAt', 'CreatedAt') ?? ''),
    updatedAt: String(pickField(raw, 'updatedAt', 'UpdatedAt') ?? ''),
  };
}

/**
 * Normalizes board hub event payloads where work item data may be either:
 * - the payload itself, or
 * - nested under payload.workItem / payload.WorkItem
 */
export function normalizeWorkItemFromEventPayload(payload: unknown): WorkItemBroadcastDto | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;
  const nested = raw.workItem ?? raw.WorkItem;
  return normalizeWorkItemBroadcast(nested ?? raw);
}

/** Payload for WorkItemReordered event */
export type WorkItemReorderedPayload = {
  workItem: WorkItemBroadcastDto;
  newPosition: number;
  sprintID: number;
};

/** Payload for real-time audit log broadcast to admins */
export type AuditLogBroadcastDto = {
  logID: number;
  userID: number;
  action: string;
  ipAddress: string;
  timestamp: string;
  success: boolean;
  details: string | null;
  targetType: string | null;
  targetID: number | null;
};
