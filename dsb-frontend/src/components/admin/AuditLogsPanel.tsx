import { useCallback, useEffect, useState, useRef } from 'react';
import '../../styles/admin.css';
import {
    downloadAuditLogsCsv,
    fetchAuditLogs,
    type AuditLogRow,
    type AuditLogQuery,
} from '../../api/auditLogsApi';
import { ApiError } from '../../services/apiClient';
import { formatDateTime } from '../../utils/dateFormatter';
import { Pagination } from '../common/Pagination';
import { getNotificationHubConnection, startNotificationHub } from '../../services/notificationHub';
import type { AuditLogBroadcastDto } from '../../types/boardSignalR';

// ── Known audit action types (derived from backend controllers/services)
const AUDIT_ACTIONS = [
    'LOGIN', 'LOGOUT', 'UNLOCK_ACCOUNT',
    'Sprint.Create', 'Sprint.Update', 'Sprint.Start', 'Sprint.Stop', 'Sprint.Complete', 'Sprint.Delete',
    'WorkItem.Create', 'WorkItem.Update', 'WorkItem.Delete', 'WorkItem.Comment',
    'WorkItem.Comment.Edit', 'WorkItem.Comment.Delete', 'WorkItem.StatusChange',
    'WorkItem.RemoveFromSprint', 'WorkItem.MoveBoardStatus', 'WorkItem.ReorderBoardPosition',
] as const;

function truncate(s: string, max: number): string {
    if (s.length <= max) return s;
    return `${s.slice(0, max - 1)}…`;
}

export function AuditLogsPanel() {
    const [userId, setUserId] = useState('');
    const [action, setAction] = useState('');
    const [actionInput, setActionInput] = useState('');
    const [actionListOpen, setActionListOpen] = useState(false);
    const actionComboRef = useRef<HTMLDivElement>(null);
    const [successFilter, setSuccessFilter] = useState<'all' | 'ok' | 'fail'>('all');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [targetType, setTargetType] = useState('');
    const [targetId, setTargetId] = useState('');
    const [ipAddress, setIpAddress] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);

    const [rows, setRows] = useState<AuditLogRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);
    /** Debounce timer ref for auto-filtering */
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    /** Preserve scroll position when changing pages. */
    const tableContainerRef = useRef<HTMLDivElement>(null);
    /** Track if this is the initial load (to show loading indicator) vs pagination (keep showing old data). */
    const [isInitialLoad, setIsInitialLoad] = useState(true);

    const buildQuery = useCallback((): AuditLogQuery => {
        const q: AuditLogQuery = { page, pageSize };
        const uid = userId.trim() ? parseInt(userId.trim(), 10) : NaN;
        if (!Number.isNaN(uid)) q.userId = uid;
        if (action.trim()) q.action = action.trim();
        if (successFilter === 'ok') q.success = true;
        if (successFilter === 'fail') q.success = false;
        if (from.trim()) q.from = new Date(from).toISOString();
        if (to.trim()) q.to = new Date(to).toISOString();
        if (targetType.trim()) q.targetType = targetType.trim();
        const tid = targetId.trim() ? parseInt(targetId.trim(), 10) : NaN;
        if (!Number.isNaN(tid)) q.targetId = tid;
        if (ipAddress.trim()) q.ipAddress = ipAddress.trim();
        return q;
    }, [userId, action, successFilter, from, to, targetType, targetId, ipAddress, page, pageSize]);

    const load = useCallback(async () => {
        // Preserve scroll position before data changes
        const container = tableContainerRef.current;
        const scrollTop = container?.scrollTop ?? 0;

        // Only show full-screen loading on initial load
        if (isInitialLoad) {
            setLoading(true);
        }
        setError(null);
        try {
            const res = await fetchAuditLogs(buildQuery());
            setRows(res.items);
            setTotal(res.total);

            // Restore scroll position after DOM updates
            requestAnimationFrame(() => {
                if (container) {
                    container.scrollTop = scrollTop;
                }
            });
        } catch (e) {
            setRows([]);
            setTotal(0);
            setError(e instanceof ApiError ? e.message : 'Failed to load audit logs.');
        } finally {
            setLoading(false);
            setIsInitialLoad(false);
        }
    }, [buildQuery, isInitialLoad]);

    useEffect(() => {
        void load();
    }, [load]);

    // ── Auto-fetch when filters change (debounced)
    const filterValues = [userId, action, successFilter, from, to, targetType, targetId, ipAddress];
    useEffect(() => {
        setPage(1);
    }, filterValues);

    const filterDeps = JSON.stringify(filterValues);
    useEffect(() => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            if (isInitialLoad) {
                setLoading(true);
            }
            setError(null);
            const q = buildQuery();
            fetchAuditLogs(q)
                .then(res => {
                    setRows(res.items);
                    setTotal(res.total);
                })
                .catch(e => {
                    setRows([]);
                    setTotal(0);
                    setError(e instanceof ApiError ? e.message : 'Failed to load audit logs.');
                })
                .finally(() => {
                    setLoading(false);
                    setIsInitialLoad(false);
                });
        }, 350);
        return () => clearTimeout(debounceRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterDeps]);

    // ── Close action dropdown on outside click
    useEffect(() => {
        const onMouseDown = (e: MouseEvent) => {
            const row = actionComboRef.current;
            if (!row || row.contains(e.target as Node)) return;
            setActionListOpen(false);
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, []);

    // ── SignalR: real-time audit log broadcast
    useEffect(() => {
        let cancelled = false;
        void startNotificationHub().then(() => {
            if (cancelled) return;
            const conn = getNotificationHubConnection();
            conn.on('AuditLogCreated', (entry: AuditLogBroadcastDto) => {
                const newRow: AuditLogRow = {
                    logID: entry.logID,
                    userID: entry.userID,
                    action: entry.action,
                    ipAddress: entry.ipAddress,
                    timestamp: entry.timestamp,
                    success: entry.success,
                    details: entry.details,
                    targetType: entry.targetType,
                    targetID: entry.targetID,
                };
                setRows(prev => [newRow, ...prev]);
                setTotal(prev => prev + 1);
            });
        });
        return () => {
            cancelled = true;
            getNotificationHubConnection().off('AuditLogCreated');
        };
    }, []);

    // Sync action input display with action filter value
    useEffect(() => {
        setActionInput(action);
    }, [action]);

    const onExport = async () => {
        setExporting(true);
        try {
            const q = buildQuery();
            await downloadAuditLogsCsv({ ...q, page: undefined, pageSize: undefined });
        } catch (e) {
            console.error(e);
            setError(e instanceof ApiError ? e.message : 'Export failed.');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="app-animate-in">
            <div className="page-header">
                <div>
                    <span className="page-eyebrow">Administration</span>
                    <h1 className="page-title">Audit Logs</h1>
                    <p className="page-subtitle">
                        Paged view of entries from <code>/api/audit-logs</code> (same filters as CSV export).
                    </p>
                </div>
            </div>

            <div className="app-card" style={{ marginBottom: 16 }}>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                        gap: 12,
                        alignItems: 'end',
                    }}
                >
                    <div className="adm-field" style={{ margin: 0 }}>
                        <label className="adm-label" htmlFor="audit-user-id">
                            User ID
                        </label>
                        <input
                            id="audit-user-id"
                            className="input"
                            inputMode="numeric"
                            value={userId}
                            onChange={(e) => setUserId(e.target.value)}
                            placeholder="Any"
                        />
                    </div>
                    <div className="adm-field" style={{ margin: 0 }}>
                        <label className="adm-label" htmlFor="audit-action">
                            Action
                        </label>
                        <div ref={actionComboRef} className={`bl-combo${actionListOpen ? ' bl-combo--open' : ''}`}>
                            <div className="bl-combo__field">
                                <input
                                    id="audit-action"
                                    className="input bl-combo__input"
                                    value={actionInput}
                                    onChange={(e) => {
                                        setActionInput(e.target.value);
                                        setAction(e.target.value);
                                    }}
                                    onFocus={() => setActionListOpen(true)}
                                    placeholder="e.g. LOGIN"
                                />
                                <span className="bl-combo__chevron" aria-hidden>
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </span>
                            </div>
                            {actionListOpen && (
                                <div className="bl-combo-dropdown" role="listbox" aria-label="Audit actions">
                                    {AUDIT_ACTIONS.filter(a =>
                                        a.toLowerCase().includes(actionInput.toLowerCase())
                                    ).length === 0 ? (
                                        <div className="bl-combo-dropdown-msg">No matches.</div>
                                    ) : (
                                        AUDIT_ACTIONS
                                            .filter(a => a.toLowerCase().includes(actionInput.toLowerCase()))
                                            .map(a => (
                                                <button
                                                    key={a}
                                                    type="button"
                                                    role="option"
                                                    className="bl-combo-option"
                                                    onMouseDown={e => e.preventDefault()}
                                                    onClick={() => {
                                                        setAction(a);
                                                        setActionInput(a);
                                                        setActionListOpen(false);
                                                    }}
                                                >
                                                    <span className="bl-combo-option__title">{a}</span>
                                                </button>
                                            ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="adm-field" style={{ margin: 0 }}>
                        <label className="adm-label" htmlFor="audit-success">
                            Success
                        </label>
                        <select
                            id="audit-success"
                            className="input"
                            value={successFilter}
                            onChange={(e) => setSuccessFilter(e.target.value as 'all' | 'ok' | 'fail')}
                        >
                            <option value="all">All</option>
                            <option value="ok">Success only</option>
                            <option value="fail">Failed only</option>
                        </select>
                    </div>
                    <div className="adm-field" style={{ margin: 0 }}>
                        <label className="adm-label" htmlFor="audit-from">
                            From (local)
                        </label>
                        <input
                            id="audit-from"
                            className="input"
                            type="datetime-local"
                            value={from}
                            onChange={(e) => setFrom(e.target.value)}
                        />
                    </div>
                    <div className="adm-field" style={{ margin: 0 }}>
                        <label className="adm-label" htmlFor="audit-to">
                            To (local)
                        </label>
                        <input
                            id="audit-to"
                            className="input"
                            type="datetime-local"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                        />
                    </div>
                    <div className="adm-field" style={{ margin: 0 }}>
                        <label className="adm-label" htmlFor="audit-target-type">
                            Target type
                        </label>
                        <input
                            id="audit-target-type"
                            className="input"
                            value={targetType}
                            onChange={(e) => setTargetType(e.target.value)}
                            placeholder="e.g. User"
                        />
                    </div>
                    <div className="adm-field" style={{ margin: 0 }}>
                        <label className="adm-label" htmlFor="audit-target-id">
                            Target ID
                        </label>
                        <input
                            id="audit-target-id"
                            className="input"
                            inputMode="numeric"
                            value={targetId}
                            onChange={(e) => setTargetId(e.target.value)}
                            placeholder="Any"
                        />
                    </div>
                    <div className="adm-field" style={{ margin: 0 }}>
                        <label className="adm-label" htmlFor="audit-ip">
                            IP address
                        </label>
                        <input
                            id="audit-ip"
                            className="input"
                            value={ipAddress}
                            onChange={(e) => setIpAddress(e.target.value)}
                            placeholder="Contains…"
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            className="adm-btn adm-btn--ghost audit-export-btn"
                            disabled={exporting}
                            onClick={() => void onExport()}
                        >
                            {!exporting && (
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                    <path d="M7 1.5v7M4.5 6l2.5 2.5L9.5 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M2.5 9.5v2h9v-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            )}
                            {exporting ? 'Exporting…' : 'Export CSV'}
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="app-card" style={{ marginBottom: 16, borderColor: 'var(--accent-red)' }}>
                    <p style={{ margin: 0, color: 'var(--accent-red)' }}>{error}</p>
                </div>
            )}

            <div className="app-card" ref={tableContainerRef} style={{ overflow: 'auto' }}>
                {isInitialLoad && loading ? (
                    <p style={{ margin: 0, color: 'var(--page-sub-color)' }}>Loading…</p>
                ) : rows.length === 0 && !loading ? (
                    <div className="empty-state" style={{ padding: '32px 0' }}>
                        <h3 style={{ marginBottom: 8 }}>No rows</h3>
                        <p style={{ margin: 0 }}>Adjust filters or change page.</p>
                    </div>
                ) : (
                    <div style={{ position: 'relative' }}>
                        {loading && (
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    padding: '8px 12px',
                                    background: 'var(--accent-gold-light)',
                                    color: 'var(--accent-gold)',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    textAlign: 'center',
                                    zIndex: 10,
                                    borderBottom: '1px solid var(--accent-gold)',
                                }}
                            >
                                Loading…
                            </div>
                        )}
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--divider)' }}>
                                <th style={{ padding: '8px 10px' }}>Time (PHT)</th>
                                <th style={{ padding: '8px 10px' }}>User</th>
                                <th style={{ padding: '8px 10px' }}>Action</th>
                                <th style={{ padding: '8px 10px' }}>OK</th>
                                <th style={{ padding: '8px 10px' }}>Target</th>
                                <th style={{ padding: '8px 10px' }}>IP</th>
                                <th style={{ padding: '8px 10px' }}>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.logID} style={{ borderBottom: '1px solid var(--divider)' }}>
                                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                                        {formatDateTime(r.timestamp)}
                                    </td>
                                    <td style={{ padding: '8px 10px' }}>{r.userID}</td>
                                    <td style={{ padding: '8px 10px' }}>{r.action}</td>
                                    <td style={{ padding: '8px 10px' }}>{r.success ? 'Yes' : 'No'}</td>
                                    <td style={{ padding: '8px 10px' }}>
                                        {r.targetType ?? '—'}
                                        {r.targetID != null ? ` #${r.targetID}` : ''}
                                    </td>
                                    <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>
                                        {r.ipAddress ?? '—'}
                                    </td>
                                    <td style={{ padding: '8px 10px', maxWidth: 320 }} title={r.details ?? ''}>
                                        {truncate((r.details ?? '').trim(), 120)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                )}

                {total > 0 && (
                    <Pagination
                        currentPage={page}
                        pageSize={pageSize}
                        total={total}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                        pageSizeOptions={[10, 25, 50, 100]}
                    />
                )}
            </div>
        </div>
    );
}
