import apiClient, { API_BASE_URL, ApiError } from '../services/apiClient';

export interface AuditLogRow {
    logID: number;
    userID: number;
    action: string;
    success: boolean;
    ipAddress: string;
    timestamp: string;
    targetType: string | null;
    targetID: number | null;
    details: string | null;
}

export interface PagedAuditLogs {
    page: number;
    pageSize: number;
    total: number;
    items: AuditLogRow[];
}

export interface AuditLogQuery {
    userId?: number;
    action?: string;
    success?: boolean;
    from?: string;
    to?: string;
    targetType?: string;
    targetId?: number;
    ipAddress?: string;
    page?: number;
    pageSize?: number;
}

function appendParams(search: URLSearchParams, q: AuditLogQuery): void {
    if (q.userId != null) search.set('userId', String(q.userId));
    if (q.action?.trim()) search.set('action', q.action.trim());
    if (q.success !== undefined) search.set('success', String(q.success));
    if (q.from?.trim()) search.set('from', q.from.trim());
    if (q.to?.trim()) search.set('to', q.to.trim());
    if (q.targetType?.trim()) search.set('targetType', q.targetType.trim());
    if (q.targetId != null) search.set('targetId', String(q.targetId));
    if (q.ipAddress?.trim()) search.set('ipAddress', q.ipAddress.trim());
    if (q.page != null) search.set('page', String(q.page));
    if (q.pageSize != null) search.set('pageSize', String(q.pageSize));
}

export function fetchAuditLogs(q: AuditLogQuery): Promise<PagedAuditLogs> {
    const search = new URLSearchParams();
    appendParams(search, q);
    const qs = search.toString();
    return apiClient.get<PagedAuditLogs>(`/api/audit-logs${qs ? `?${qs}` : ''}`);
}

export function auditLogsExportUrl(q: AuditLogQuery): string {
    const search = new URLSearchParams();
    appendParams(search, { ...q, page: undefined, pageSize: undefined });
    const qs = search.toString();
    return `${API_BASE_URL}/api/audit-logs/export.csv${qs ? `?${qs}` : ''}`;
}

/** Downloads CSV using cookie auth (same as apiClient). */
export async function downloadAuditLogsCsv(q: AuditLogQuery): Promise<void> {
    const url = auditLogsExportUrl(q);
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
        let message = `Export failed (${response.status})`;
        try {
            const data = (await response.json()) as { message?: string };
            if (typeof data.message === 'string') message = data.message;
        } catch {
            /* ignore */
        }
        throw new ApiError(message, response.status);
    }
    const blob = await response.blob();
    const dispo = response.headers.get('Content-Disposition');
    let fileName = 'audit-logs.csv';
    const m = dispo?.match(/filename="?([^";]+)"?/i);
    if (m?.[1]) fileName = m[1].trim();

    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
}
