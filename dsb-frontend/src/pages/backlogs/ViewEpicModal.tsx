import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WorkItemHierarchyDto } from '../../types/epicHierarchy';
import type { AgendaWorkItem } from '../../types/planning';
import { getEpicHierarchy } from '../../api/epicHierarchyApi';
import { deleteWorkItem } from '../../api/workItemsApi';
import { getBoardHubConnection, ensureBoardHubStarted } from '../../services/boardHub';
import { WorkItemDetailModal } from './WorkItemDetailModal';
import { useAuth } from '../../context/AuthContext';
import '../../styles/manage sprint modal.css';
import '../../styles/work-item-modal.css';

// ─────────────────────────────────────────────
// Status / type helpers
// ─────────────────────────────────────────────

function statusClass(raw: string): string {
    const s = raw.toLowerCase();
    if (s === 'to-do' || s === 'todo') return 'msm-status--todo';
    if (s === 'ongoing') return 'msm-status--ongoing';
    if (s === 'for checking' || s === 'for-checking') return 'msm-status--checking';
    if (s === 'completed') return 'msm-status--completed';
    return '';
}

function typeChipClass(typeName: string): string {
    switch (typeName.toLowerCase()) {
        case 'epic': return 'msm-type--epic';
        case 'story': return 'msm-type--story';
        case 'task': return 'msm-type--task';
        default: return 'msm-type--other';
    }
}

// ─────────────────────────────────────────────
// Tree helpers
// ─────────────────────────────────────────────

function flattenTreeFromDto(dto: WorkItemHierarchyDto): WorkItemHierarchyDto[] {
    const out: WorkItemHierarchyDto[] = [];
    function walk(node: WorkItemHierarchyDto) {
        out.push(node);
        node.children.forEach(walk);
    }
    walk(dto);
    return out;
}

function countByType(dto: WorkItemHierarchyDto, typeName: string): number {
    let count = 0;
    function walk(node: WorkItemHierarchyDto) {
        if (node.typeName.toLowerCase() === typeName.toLowerCase()) count++;
        node.children.forEach(walk);
    }
    walk(dto);
    return count;
}

function countByTypeAndStatus(dto: WorkItemHierarchyDto, typeName: string, status: string): number {
    let count = 0;
    function walk(node: WorkItemHierarchyDto) {
        if (node.typeName.toLowerCase() === typeName.toLowerCase() && node.status.toLowerCase() === status.toLowerCase()) count++;
        node.children.forEach(walk);
    }
    walk(dto);
    return count;
}

function filterHierarchy(dto: WorkItemHierarchyDto, search: string): WorkItemHierarchyDto | null {
    const matches = dto.title.toLowerCase().includes(search) ||
        dto.status.toLowerCase().includes(search) ||
        (dto.assignedUserName?.toLowerCase().includes(search) ?? false) ||
        (dto.priority?.toLowerCase().includes(search) ?? false);

    const filteredChildren = dto.children
        .map(child => filterHierarchy(child, search))
        .filter((c): c is WorkItemHierarchyDto => c !== null);

    if (matches || filteredChildren.length > 0) {
        return { ...dto, children: filteredChildren };
    }
    return null;
}

function removeFromHierarchy(dto: WorkItemHierarchyDto | null, workItemId: number): WorkItemHierarchyDto | null {
    if (!dto) return null;
    if (dto.workItemID === workItemId) return null;
    return {
        ...dto,
        children: dto.children
            .map(c => removeFromHierarchy(c, workItemId))
            .filter((c): c is WorkItemHierarchyDto => c !== null),
    };
}

function mergeIntoHierarchy(dto: WorkItemHierarchyDto | null, workItemId: number, fields: Partial<WorkItemHierarchyDto>): WorkItemHierarchyDto | null {
    if (!dto) return null;
    if (dto.workItemID === workItemId) return { ...dto, ...fields };
    return {
        ...dto,
        children: dto.children.map(c => mergeIntoHierarchy(c, workItemId, fields)).filter((c): c is WorkItemHierarchyDto => c !== null),
    };
}

function formatDate(raw: string): string {
    try {
        return new Date(raw).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return raw;
    }
}

function findNodeById(root: WorkItemHierarchyDto, targetId: number): WorkItemHierarchyDto | null {
    if (root.workItemID === targetId) return root;
    for (const child of root.children) {
        const found = findNodeById(child, targetId);
        if (found) return found;
    }
    return null;
}

function collectSubtree(node: WorkItemHierarchyDto): WorkItemHierarchyDto[] {
    const out: WorkItemHierarchyDto[] = [];
    function walk(current: WorkItemHierarchyDto) {
        out.push(current);
        current.children.forEach(walk);
    }
    walk(node);
    return out;
}

const TrashIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M2 4h10M5 4V2.5A.5.5 0 0 1 5.5 2h3a.5.5 0 0 1 .5.5V4M6 6.5v3M8 6.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 4l.7 7.5a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L11 4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
);

// ─────────────────────────────────────────────
// Main Modal
// ─────────────────────────────────────────────

interface ViewEpicModalProps {
    epicId: number;
    onClose: () => void;
}

export function ViewEpicModal({ epicId, onClose }: ViewEpicModalProps) {
    const { user } = useAuth();
    const [hierarchy, setHierarchy] = useState<WorkItemHierarchyDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedNodes, setExpandedNodes] = useState<Set<number>>(() => new Set());
    const [detailItem, setDetailItem] = useState<AgendaWorkItem | null>(null);
    const [search, setSearch] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<{
        workItemID: number;
        title: string;
        typeName: string;
        totalToDelete: number;
        hasChildren: boolean;
        hasSprintItems: boolean;
    } | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    // ── Load hierarchy ──────────────────────
    const loadHierarchy = useCallback(async (id: number) => {
        setLoading(true);
        setError('');
        try {
            const data = await getEpicHierarchy(id);
            setHierarchy(data);
            // Auto-expand all
            const allItems = flattenTreeFromDto(data);
            setExpandedNodes(new Set(allItems.map(i => i.workItemID)));
        } catch {
            setError('Failed to load epic hierarchy.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void loadHierarchy(epicId); }, [epicId, loadHierarchy]);

    // ── SignalR real-time updates ───────────
    useEffect(() => {
        const conn = getBoardHubConnection();
        let cancelled = false;

        const handleWorkItemEvent = (eventType: string, payload: unknown) => {
            if (cancelled || payload === null || typeof payload !== 'object') return;
            const data = payload as Record<string, unknown>;
            
            // WorkItemCreated has nested structure: { workItem: { workItemID, ... }, createdAt }
            // Other events have flat structure: { workItemID, ... }
            let workItemId = Number(data.workItemID ?? data.WorkItemID ?? 0);
            if (!workItemId || workItemId <= 0) {
                const workItem = data.workItem as Record<string, unknown> | undefined;
                if (workItem) {
                    workItemId = Number(workItem.workItemID ?? workItem.WorkItemID ?? 0);
                }
            }
            if (!workItemId || workItemId <= 0) return;

            if (eventType === 'WorkItemDeleted') {
                setHierarchy(prev => removeFromHierarchy(prev, workItemId));
                return;
            }

            const updatedFields: Partial<WorkItemHierarchyDto> = {};
            const resolvedStatus = data.newStatus ?? data.status;
            if (resolvedStatus !== undefined) updatedFields.status = String(resolvedStatus);
            if (data.assignedUserName !== undefined) updatedFields.assignedUserName = data.assignedUserName as string | null;
            if (data.priority !== undefined) updatedFields.priority = data.priority as string | null;
            if (data.title !== undefined) updatedFields.title = String(data.title);
            if (data.workItemType !== undefined) updatedFields.typeName = String(data.workItemType);
            if (data.parentWorkItemID !== undefined) updatedFields.parentWorkItemID = data.parentWorkItemID as number | null;

            if (Object.keys(updatedFields).length > 0) {
                setHierarchy(prev => mergeIntoHierarchy(prev, workItemId, updatedFields));
            }
            
            // For create + status/move events, trigger full refresh so derived parent statuses
            // (e.g., Story status from child Task statuses) stay accurate in real time.
            if (eventType === 'WorkItemCreated' || eventType === 'WorkItemStatusChanged' || eventType === 'WorkItemMoved') {
                void loadHierarchy(epicId);
            }
        };

        const events = ['WorkItemUpdated', 'WorkItemStatusChanged', 'WorkItemMoved', 'WorkItemCreated', 'WorkItemDeleted'];
        const start = async () => {
            try { await ensureBoardHubStarted(); } catch { /* hub unavailable */ }
            if (cancelled) return;
            events.forEach(ev => conn.on(ev, payload => handleWorkItemEvent(ev, payload)));
        };
        void start();
        return () => { cancelled = true; events.forEach(ev => conn.off(ev)); };
    }, [epicId, loadHierarchy]);

    // ── Toggle expand/collapse ──────────────
    const toggleNode = useCallback((id: number) => {
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const expandAll = useCallback(() => {
        if (!hierarchy) return;
        const all = flattenTreeFromDto(hierarchy);
        setExpandedNodes(new Set(all.map(i => i.workItemID)));
    }, [hierarchy]);

    const collapseAll = useCallback(() => setExpandedNodes(new Set()), []);

    // ── Filtered tree ───────────────────────
    const filteredHierarchy = useMemo(() => {
        if (!hierarchy) return null;
        if (!search.trim()) return hierarchy;
        return filterHierarchy(hierarchy, search.toLowerCase());
    }, [hierarchy, search]);

    // ── Counts for sidebar ──────────────────
    const totalStories = hierarchy ? countByType(hierarchy, 'Story') : 0;
    const totalTasks = hierarchy ? countByType(hierarchy, 'Task') : 0;
    const completedStories = hierarchy ? countByTypeAndStatus(hierarchy, 'Story', 'Completed') : 0;
    const completedTasks = hierarchy ? countByTypeAndStatus(hierarchy, 'Task', 'Completed') : 0;
    const totalItems = totalStories + totalTasks;
    const doneItems = completedStories + completedTasks;
    const progressPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
    const hasChildItems = useMemo(() => {
        if (!hierarchy) return false;
        return flattenTreeFromDto(hierarchy).length > 1;
    }, [hierarchy]);
    const canDelete = user?.roleName === 'Administrator' || user?.roleName === 'Scrum Master' || user?.roleName === 'ScrumMaster';

    const requestDelete = useCallback((workItemId: number) => {
        if (!hierarchy) return;
        const target = findNodeById(hierarchy, workItemId);
        if (!target) return;
        const subtree = collectSubtree(target);
        const descendants = Math.max(0, subtree.length - 1);
        const hasSprintItems = subtree.some(n => n.sprintID != null);
        setDeleteError('');
        setDeleteTarget({
            workItemID: target.workItemID,
            title: target.title,
            typeName: target.typeName,
            totalToDelete: subtree.length,
            hasChildren: descendants > 0,
            hasSprintItems,
        });
    }, [hierarchy]);

    const handleConfirmDelete = useCallback(async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        setDeleteError('');
        try {
            await deleteWorkItem(deleteTarget.workItemID);
            if (deleteTarget.workItemID === epicId) {
                onClose();
                return;
            }
            setDeleteTarget(null);
            await loadHierarchy(epicId);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete work item.';
            setDeleteError(message);
        } finally {
            setDeleting(false);
        }
    }, [deleteTarget, epicId, loadHierarchy, onClose]);

    // ── Keyboard close ──────────────────────
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !detailItem) onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose, detailItem]);

    // ─────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────
    return (
        <>
        <div className="msm-overlay" role="dialog" aria-modal="true" aria-label="View Epic" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="msm-modal">
                {/* ── LEFT SIDEBAR (epic details) ─────── */}
                <aside className="msm-sidebar">
                    <div className="msm-sidebar-texture" />
                    <div className="msm-sidebar-glow" />

                    {/* Eyebrow + status badge */}
                    <div className="msm-sidebar-eyebrow-row">
                        <span className="msm-sidebar-eyebrow">Epic</span>
                        {hierarchy && <StatusBadge status={hierarchy.status} />}
                    </div>

                    {/* Epic name */}
                    {loading ? (
                        <h2 className="msm-sprint-name">Loading…</h2>
                    ) : (
                        <h2 className="msm-sprint-name">{hierarchy?.title ?? 'Epic'}</h2>
                    )}

                    {/* Description */}
                    {hierarchy?.description && (
                        <p className="msm-goal">{hierarchy.description}</p>
                    )}

                    {/* Progress + meta */}
                    <div className="msm-sidebar-mid">
                        {/* Progress bar */}
                        <div className="msm-progress-section">
                            <div className="msm-progress-label-row">
                                <span className="msm-progress-label">Progress</span>
                                <span className="msm-progress-pct">{progressPct}%</span>
                            </div>
                            <div className="msm-progress-track" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
                                <div className="msm-progress-fill" style={{ width: `${progressPct}%` }} />
                            </div>
                            <div className="msm-progress-sub">
                                {doneItems} / {totalItems} items done
                            </div>
                        </div>

                        {/* Meta: assignee, team, priority, counts */}
                        <div className="msm-meta-section">
                            <div className="msm-meta-row">
                                <span className="msm-meta-label">Assignee</span>
                                <span className="msm-meta-value">
                                    {hierarchy?.assignedUserName ?? 'Unassigned'}
                                </span>
                            </div>
                            {hierarchy?.teamName && (
                                <div className="msm-meta-row">
                                    <span className="msm-meta-label">Team</span>
                                    <span className="msm-meta-value">{hierarchy.teamName}</span>
                                </div>
                            )}
                            <div className="msm-meta-row">
                                <span className="msm-meta-label">Priority</span>
                                <span className="msm-meta-value">{hierarchy?.priority ?? '—'}</span>
                            </div>
                            <div className="msm-meta-row">
                                <span className="msm-meta-label">Stories</span>
                                <span className="msm-meta-value">{completedStories} / {totalStories} done</span>
                            </div>
                            <div className="msm-meta-row">
                                <span className="msm-meta-label">Tasks</span>
                                <span className="msm-meta-value">{completedTasks} / {totalTasks} done</span>
                            </div>
                            {hierarchy?.createdAt && (
                                <div className="msm-meta-row">
                                    <span className="msm-meta-label">Created</span>
                                    <span className="msm-meta-value">{formatDate(hierarchy.createdAt)}</span>
                                </div>
                            )}
                            {hierarchy?.updatedAt && (
                                <div className="msm-meta-row">
                                    <span className="msm-meta-label">Updated</span>
                                    <span className="msm-meta-value">{formatDate(hierarchy.updatedAt)}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Close button */}
                    <div className="msm-sidebar-footer">
                        {canDelete && hierarchy && (
                            <button
                                type="button"
                                className="msm-btn msm-btn--danger"
                                onClick={() => requestDelete(hierarchy.workItemID)}
                                disabled={deleting}
                                style={{ marginBottom: 8 }}
                            >
                                Delete Epic
                            </button>
                        )}
                        <button type="button" className="msm-btn msm-btn--close" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </aside>

                {/* ── RIGHT MAIN PANEL (hierarchy tree) ─ */}
                <div className="msm-main">
                    {/* Header */}
                    <div className="msm-main-header">
                        <div className="msm-main-header-left">
                            <h2 className="msm-main-title">Hierarchy</h2>
                            {hierarchy && <span className="msm-item-count">{Math.max(0, flattenTreeFromDto(hierarchy).length - 1)}</span>}
                        </div>

                        <div className="msm-main-header-right">
                            {/* Search */}
                            <div className="msm-search-wrap">
                                <svg className="msm-search-icon" width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                                    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                                    <path d="M10 10L13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                                </svg>
                                <input
                                    className="msm-search"
                                    placeholder="Search hierarchy…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    aria-label="Search hierarchy"
                                />
                            </div>

                            {/* Expand */}
                            <div className="msm-toolbar-btn-wrap">
                                <button
                                    type="button"
                                    className="msm-toolbar-btn"
                                    aria-label="Expand all"
                                    title="Expand all"
                                    onClick={expandAll}
                                >
                                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                                        <path d="M3 5l3.5 3.5L10 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </button>
                            </div>

                            {/* Collapse */}
                            <div className="msm-toolbar-btn-wrap">
                                <button
                                    type="button"
                                    className="msm-toolbar-btn"
                                    aria-label="Collapse all"
                                    title="Collapse all"
                                    onClick={collapseAll}
                                >
                                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                                        <path d="M3 8l3.5-3.5L10 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Body — tree table */}
                    <div className="msm-table-wrap">
                        {error && (
                            <div style={{ padding: '20px 18px', color: 'var(--color-error)', fontSize: '0.875rem' }}>{error}</div>
                        )}

                        {loading ? (
                            <div className="msm-loading-state">
                                <div className="msm-spinner" />
                                <span>Loading hierarchy…</span>
                            </div>
                        ) : !hasChildItems && !search.trim() ? (
                            <div className="msm-no-results">This epic currently has no child items.</div>
                        ) : filteredHierarchy ? (
                            <HierarchyTable
                                root={filteredHierarchy}
                                expandedNodes={expandedNodes}
                                onToggle={toggleNode}
                                onOpenDetail={setDetailItem}
                                canDelete={!!canDelete}
                                onRequestDelete={requestDelete}
                            />
                        ) : (
                            <div className="msm-no-results">No matching items</div>
                        )}
                    </div>
                </div>
            </div>
        </div>

        {/* ── Work Item Detail Modal ───── */}
        {detailItem && createPortal(
            <WorkItemDetailModal
                item={detailItem}
                onClose={() => setDetailItem(null)}
                canManage={false}
                canEdit={user?.roleName === 'Administrator' || user?.roleName === 'Scrum Master' || user?.roleName === 'ScrumMaster'}
                canChangeAssignee={user?.roleName === 'Administrator' || user?.roleName === 'Scrum Master' || user?.roleName === 'ScrumMaster'}
                currentUser={user ? { userID: user.userID, roleName: user.roleName } : null}
            />,
            document.body
        )}
        {deleteTarget && (
            <div className="wi-delete-overlay" role="dialog" aria-modal="true" aria-label="Delete Work Item">
                <div className="wi-delete-dialog">
                    <div className="wi-delete-icon">
                        <TrashIcon />
                    </div>
                    <h3 className="wi-delete-title">
                        Delete {deleteTarget.typeName}?
                    </h3>
                    <p className="wi-delete-message">
                        {deleteTarget.hasChildren
                            ? `This will delete "${deleteTarget.title}" and ${deleteTarget.totalToDelete - 1} child item(s).`
                            : `This will delete "${deleteTarget.title}".`}
                    </p>
                    {deleteTarget.hasSprintItems && (
                        <p className="wi-delete-message" style={{ color: 'var(--color-error)' }}>
                            One or more affected items are in a sprint. They will be removed from sprint, unassigned, then deleted.
                        </p>
                    )}
                    {deleteError && (
                        <p className="wi-delete-message" style={{ color: 'var(--color-error)' }}>
                            {deleteError}
                        </p>
                    )}
                    <div className="wi-delete-actions">
                        <button
                            type="button"
                            className="wi-delete-btn wi-delete-btn--cancel"
                            onClick={() => { if (!deleting) setDeleteTarget(null); }}
                            disabled={deleting}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="wi-delete-btn wi-delete-btn--confirm"
                            onClick={() => void handleConfirmDelete()}
                            disabled={deleting}
                        >
                            {deleting ? 'Deleting…' : 'Delete'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}

// ─────────────────────────────────────────────
// Status badge (left panel)
// ─────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    const cls = (() => {
        const s = status.toLowerCase();
        if (s === 'completed') return 'msm-sprint-badge--completed';
        if (s === 'ongoing') return 'msm-sprint-badge--active';
        return 'msm-sprint-badge--planned';
    })();
    return <span className={`msm-sprint-badge ${cls}`}>{status}</span>;
}

// ─────────────────────────────────────────────
// Hierarchy Table (right panel — table layout)
// ─────────────────────────────────────────────

function HierarchyTable({
    root,
    expandedNodes,
    onToggle,
    onOpenDetail,
    canDelete,
    onRequestDelete,
}: {
    root: WorkItemHierarchyDto;
    expandedNodes: Set<number>;
    onToggle: (id: number) => void;
    onOpenDetail: (item: AgendaWorkItem) => void;
    canDelete: boolean;
    onRequestDelete: (workItemId: number) => void;
}) {
    const flatItems = useMemo(() => flattenVisible(root, expandedNodes), [root, expandedNodes]);

    return (
        <table className="msm-table">
            <thead>
                <tr className="msm-thead-row">
                    <th className="msm-th msm-th--type">Type</th>
                    <th className="msm-th msm-th--title">Title</th>
                    <th className="msm-th msm-th--status">Status</th>
                    <th className="msm-th msm-th--assignee">Assignee</th>
                    {canDelete && <th className="msm-th msm-th--actions">Actions</th>}
                </tr>
            </thead>
            <tbody>
                {flatItems.map(row => (
                    <HierarchyRow
                        key={row.item.workItemID}
                        row={row}
                        expandedNodes={expandedNodes}
                        onToggle={onToggle}
                        onOpenDetail={onOpenDetail}
                        canDelete={canDelete}
                        onRequestDelete={onRequestDelete}
                    />
                ))}
            </tbody>
        </table>
    );
}

function flattenVisible(root: WorkItemHierarchyDto, expandedNodes: Set<number>): Array<{ item: WorkItemHierarchyDto; depth: number }> {
    const out: Array<{ item: WorkItemHierarchyDto; depth: number }> = [];
    function walk(node: WorkItemHierarchyDto, depth: number) {
        out.push({ item: node, depth });
        if (expandedNodes.has(node.workItemID)) {
            node.children.forEach(child => walk(child, depth + 1));
        }
    }
    // Do not render the epic itself in the hierarchy list.
    root.children.forEach(child => walk(child, 0));
    return out;
}

function HierarchyRow({
    row,
    expandedNodes,
    onToggle,
    onOpenDetail,
    canDelete,
    onRequestDelete,
}: {
    row: { item: WorkItemHierarchyDto; depth: number };
    expandedNodes: Set<number>;
    onToggle: (id: number) => void;
    onOpenDetail: (item: AgendaWorkItem) => void;
    canDelete: boolean;
    onRequestDelete: (workItemId: number) => void;
}) {
    const { item, depth } = row;
    const hasChildren = item.children.length > 0;
    const isExpanded = expandedNodes.has(item.workItemID);

    return (
        <tr
            className={`msm-wi-row${depth > 0 ? ` msm-wi-row--depth-${Math.min(depth, 2)}` : ''}`}
            style={{ '--msm-depth': depth } as React.CSSProperties}
        >
            {/* Type */}
            <td className="msm-td msm-td--type">
                <div className="msm-td-type-inner">
                    <span className="msm-wi-indent" style={{ width: `${depth * 14}px` }} />
                    {hasChildren ? (
                        <button
                            type="button"
                            className="msm-expand-btn"
                            onClick={() => onToggle(item.workItemID)}
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                        >
                            {isExpanded ? '▾' : '▸'}
                        </button>
                    ) : (
                        <span className="msm-expand-spacer" />
                    )}
                    <span className={`msm-type-chip ${typeChipClass(item.typeName)}`}>{item.typeName}</span>
                </div>
            </td>

            {/* Title */}
            <td className="msm-td">
                <span
                    className="msm-wi-title"
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenDetail(agendaItemFromHierarchy(item))}
                    onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') onOpenDetail(agendaItemFromHierarchy(item)); }}
                >
                    {item.title}
                </span>
            </td>

            {/* Status */}
            <td className="msm-td msm-td--status">
                <span className={`msm-status-badge ${statusClass(item.status)}`}>{item.status}</span>
            </td>

            {/* Assignee */}
            <td className="msm-td msm-td--assignee">
                <span className="msm-assignee">
                    {item.assignedUserName ?? (
                        <span className="msm-assignee--muted">Unassigned</span>
                    )}
                </span>
            </td>
            {canDelete && (
                <td className="msm-td msm-td--actions">
                    <button
                        type="button"
                        className="msm-wi-icon-btn msm-wi-icon-btn--danger"
                        title={`Delete ${item.typeName}`}
                        aria-label={`Delete ${item.typeName} ${item.title}`}
                        onClick={() => onRequestDelete(item.workItemID)}
                    >
                        <TrashIcon />
                    </button>
                </td>
            )}
        </tr>
    );
}

function agendaItemFromHierarchy(item: WorkItemHierarchyDto): AgendaWorkItem {
    return {
        workItemID: item.workItemID,
        title: item.title,
        typeName: item.typeName,
        status: item.status,
        priority: item.priority ?? null,
        dueDate: item.dueDate ?? null,
        parentWorkItemID: item.parentWorkItemID ?? null,
        sprintID: item.sprintID ?? null,
        teamID: item.teamID ?? null,
        assignedUserID: item.assignedUserID ?? null,
        assignedUserName: item.assignedUserName ?? null,
    };
}
