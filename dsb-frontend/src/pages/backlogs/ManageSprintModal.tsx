/**
 * ManageSprintModal.tsx
 * ─────────────────────────────────────────────
 * Full-featured sprint management modal for the Digital Scrum Board.
 * Matches system theme: brand-panel dark on left, form-panel on right.
 *
 * Features
 *  ┌ Left panel  ─ Sprint details, inline editing, role-gated controls
 *  └ Right panel ─ Hierarchical Epic → Story → Task work-item list
 *                  with search, sort, filter, and per-item quick-edit
 *
 * SignalR hooks are wired but not connected (stubs only); replace
 * the `useSprintHubEvents` body when the backend is ready.
 *
 * Role-based access
 *   Administrator / Scrum Master → full edit
 *   Sprint Manager (owner)       → edit sprint fields, manage items
 *   Everyone else                → read-only
 */

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FormEvent,
} from 'react';
import type { UserProfile } from '../../types/auth';
import type { AgendaWorkItem, SprintSummary } from '../../types/planning';
import { isElevatedWorkspaceRole } from '../../utils/userProfile';
import { canEditSprintMetadata } from './planningUtils';
import { patchSprint as patchSprintApi, getSprintDetails } from '../../api/sprintsApi';
import { getBoardHubConnection, ensureBoardHubStarted } from '../../services/boardHub';
import { lookupUsers, lookupTeams } from '../../api/lookupsApi';
import '../../styles/manage sprint modal.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SprintWorkItemNode {
    item: AgendaWorkItem & { assignedUserName?: string | null };
    children: SprintWorkItemNode[];
}

export interface ManageSprintModalProps {
    /** The sprint being managed (new interface) */
    sprint?: SprintSummary;
    /** All work items currently assigned to this sprint (new interface) */
    workItems?: AgendaWorkItem[];
    /** Current signed-in user */
    me: UserProfile | null;
    /** Called when the user saves sprint details (new interface) */
    onSave?: (patch: SprintPatch) => Promise<void>;
    /** Called when the user closes without saving */
    onClose: () => void;
    /** Called when "Add Work Item" is clicked */
    onAddWorkItem?: () => void;
    /** Called when a work item's quick-edit is triggered */
    onQuickEditWorkItem?: (workItemId: number) => void;
    /** Called when a work item is removed from sprint */
    onRemoveWorkItem?: (workItemId: number, typeName?: string) => void;
    
    /** Legacy props from BacklogsPage (old interface) */
    manageSprintId?: number; // The sprint ID from parent
    manageSprintData?: SprintSummary | null; // Full sprint data from list endpoint
    manageSprintName?: string;
    setManageSprintName?: (value: string) => void;
    manageGoal?: string;
    setManageGoal?: (value: string) => void;
    manageStartDate?: string;
    setManageStartDate?: (value: string) => void;
    manageEndDate?: string;
    setManageEndDate?: (value: string) => void;
    manageManagedBy?: number | null;
    setManageManagedBy?: (value: number | null) => void;
    manageTeamId?: number | null;
    setManageTeamId?: (value: number | null) => void;
    manageLoading?: boolean;
    manageError?: string;
}

export interface SprintPatch {
    sprintName?: string;
    goal?: string;
    startDate?: string | null;
    endDate?: string | null;
    managedBy?: number | null;
    teamID?: number | null;
}

type SortKey = 'type' | 'title' | 'status' | 'dueDate' | 'assignee';
type FilterType = 'All' | 'Story' | 'Task';
type FilterStatus = 'All' | 'Todo' | 'Ongoing' | 'ForChecking' | 'Completed';

/** SignalR SprintUpdated event payload */
interface SprintUpdatedPayload {
    sprintID?: number;
    SprintID?: number;
    sprintName?: string;
    SprintName?: string;
    goal?: string | null;
    Goal?: string | null;
    startDate?: string | null;
    StartDate?: string | null;
    endDate?: string | null;
    EndDate?: string | null;
    status?: string;
    Status?: string;
    managedBy?: number | null;
    ManagedBy?: number | null;
    managedByName?: string | null;
    ManagedByName?: string | null;
    teamID?: number | null;
    TeamID?: number | null;
    teamName?: string | null;
    TeamName?: string | null;
}

/** SignalR WorkItemAssignedToSprint / WorkItemRemovedFromSprint payload */
interface WorkItemSprintPayload {
    workItemID?: number;
    WorkItemID?: number;
    title?: string;
    Title?: string;
    status?: string;
    Status?: string;
    priority?: string | null;
    Priority?: string | null;
    dueDate?: string | null;
    DueDate?: string | null;
    assignedUserID?: number | null;
    AssignedUserID?: number | null;
    assignedUserName?: string | null;
    AssignedUserName?: string | null;
    parentWorkItemID?: number | null;
    ParentWorkItemID?: number | null;
    teamID?: number | null;
    TeamID?: number | null;
    sprintID?: number | null;
    SprintID?: number | null;
    workItemType?: string;
    WorkItemType?: string;
}

// ─── SignalR hook ─────────────────────────────────────────────────────────────

/**
 * Hook for SignalR sprint-hub events.
 * Listens for sprint updates and work item changes from other users.
 *
 * @param sprintId  The sprint to subscribe to
 * @param handlers  Callbacks fired on each hub event
 */
function useSprintHubEvents(
    sprintId: number,
    handlers: {
        onSprintUpdated?: (patch: Partial<SprintSummary>) => void;
        onWorkItemAdded?: (item: AgendaWorkItem) => void;
        onWorkItemRemoved?: (workItemId: number) => void;
        onWorkItemUpdated?: (item: AgendaWorkItem) => void;
        onWorkItemStatusChanged?: (workItemId: number, newStatus: string) => void;
        onWorkItemMoved?: (item: AgendaWorkItem) => void;
    },
) {
    useEffect(() => {
        if (!sprintId) return;

        const conn = getBoardHubConnection();
        if (!conn) return;

        let cancelled = false;

        const onSprintUpdated = (payload: SprintUpdatedPayload) => {
            const patch: Partial<SprintSummary> = {};
            if (payload.sprintName ?? payload.SprintName) {
                patch.sprintName = payload.sprintName ?? payload.SprintName;
            }
            if (payload.goal !== undefined || payload.Goal !== undefined) {
                patch.goal = payload.goal ?? payload.Goal ?? null;
            }
            if (payload.startDate !== undefined || payload.StartDate !== undefined) {
                patch.startDate = payload.startDate ?? payload.StartDate ?? null;
            }
            if (payload.endDate !== undefined || payload.EndDate !== undefined) {
                patch.endDate = payload.endDate ?? payload.EndDate ?? null;
            }
            handlers.onSprintUpdated?.(patch);
        };
        const onWorkItemAdded = (payload: WorkItemSprintPayload) => {
            const item: AgendaWorkItem = {
                workItemID: Number(payload.workItemID ?? payload.WorkItemID ?? 0),
                title: String(payload.title ?? payload.Title ?? ''),
                typeName: String(payload.workItemType ?? payload.WorkItemType ?? 'Task'),
                status: String(payload.status ?? payload.Status ?? ''),
                priority: (payload.priority ?? payload.Priority) ?? null,
                dueDate: (payload.dueDate ?? payload.DueDate) ?? null,
                parentWorkItemID: (payload.parentWorkItemID ?? payload.ParentWorkItemID) ?? null,
                sprintID: (payload.sprintID ?? payload.SprintID) ?? null,
                teamID: (payload.teamID ?? payload.TeamID) ?? null,
                assignedUserID: (payload.assignedUserID ?? payload.AssignedUserID) ?? null,
                assignedUserName: (payload.assignedUserName ?? payload.AssignedUserName) ?? null,
            };
            handlers.onWorkItemAdded?.(item);
        };
        const onWorkItemRemoved = (payload: WorkItemSprintPayload) => {
            const workItemId = Number(payload.workItemID ?? payload.WorkItemID ?? 0);
            handlers.onWorkItemRemoved?.(workItemId);
        };
        const onWorkItemUpdated = (payload: WorkItemSprintPayload) => {
            const item: AgendaWorkItem = {
                workItemID: Number(payload.workItemID ?? payload.WorkItemID ?? 0),
                title: String(payload.title ?? payload.Title ?? ''),
                typeName: String(payload.workItemType ?? payload.WorkItemType ?? 'Task'),
                status: String(payload.status ?? payload.Status ?? ''),
                priority: (payload.priority ?? payload.Priority) ?? null,
                dueDate: (payload.dueDate ?? payload.DueDate) ?? null,
                parentWorkItemID: (payload.parentWorkItemID ?? payload.ParentWorkItemID) ?? null,
                sprintID: (payload.sprintID ?? payload.SprintID) ?? null,
                teamID: (payload.teamID ?? payload.TeamID) ?? null,
                assignedUserID: (payload.assignedUserID ?? payload.AssignedUserID) ?? null,
                assignedUserName: (payload.assignedUserName ?? payload.AssignedUserName) ?? null,
            };
            handlers.onWorkItemUpdated?.(item);
        };

        const onWorkItemStatusChanged = (payload: Record<string, unknown>) => {
            const workItemId = Number(payload.workItemID ?? 0);
            const newStatus = String(payload.newStatus ?? '');
            handlers.onWorkItemStatusChanged?.(workItemId, newStatus);
        };

        const onWorkItemMoved = (payload: Record<string, unknown>) => {
            const item: AgendaWorkItem = {
                workItemID: Number(payload.workItemID ?? 0),
                title: String(payload.title ?? ''),
                typeName: String(payload.workItemType ?? payload.WorkItemType ?? 'Task'),
                status: String(payload.status ?? ''),
                priority: (payload.priority as string | null | undefined) ?? null,
                dueDate: (payload.dueDate as string | null | undefined) ?? null,
                parentWorkItemID: (payload.parentWorkItemID as number | null | undefined) ?? null,
                sprintID: (payload.sprintID as number | null | undefined) ?? null,
                teamID: (payload.teamID as number | null | undefined) ?? null,
                assignedUserID: (payload.assignedUserID as number | null | undefined) ?? null,
                assignedUserName: (payload.assignedUserName as string | null | undefined) ?? null,
            };
            handlers.onWorkItemMoved?.(item);
        };

        conn.on('SprintUpdated', onSprintUpdated);
        conn.on('WorkItemAssignedToSprint', onWorkItemAdded);
        conn.on('WorkItemRemovedFromSprint', onWorkItemRemoved);
        conn.on('WorkItemUpdated', onWorkItemUpdated);
        conn.on('WorkItemStatusChanged', onWorkItemStatusChanged);
        conn.on('WorkItemMoved', onWorkItemMoved);

        // Start the connection and join the sprint group
        const startAndJoin = async () => {
            try {
                await ensureBoardHubStarted();
            } catch {
                return; // Hub unavailable — modal still works, just no real-time updates
            }
            if (cancelled) return;

            try { await conn.invoke('JoinSprintBoard', sprintId); } catch { /* ignore */ }
        };

        void startAndJoin();

        return () => {
            cancelled = true;
            conn.off('SprintUpdated', onSprintUpdated);
            conn.off('WorkItemAssignedToSprint', onWorkItemAdded);
            conn.off('WorkItemRemovedFromSprint', onWorkItemRemoved);
            conn.off('WorkItemUpdated', onWorkItemUpdated);
            conn.off('WorkItemStatusChanged', onWorkItemStatusChanged);
            conn.off('WorkItemMoved', onWorkItemMoved);
            conn.invoke('LeaveSprintBoard', sprintId).catch(() => {});
        };
    }, [sprintId, handlers]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    } catch {
        return iso;
    }
}

function normalizeStatus(s: string): string {
    switch (s.toLowerCase().replace(/\s/g, '')) {
        case 'todo': return 'To-do';
        case 'ongoing':
        case 'inprogress': return 'Ongoing';
        case 'forchecking':
        case 'review': return 'For Checking';
        case 'completed':
        case 'done': return 'Completed';
        default: return s;
    }
}

function statusClass(s: string): string {
    switch (s.toLowerCase().replace(/\s/g, '')) {
        case 'todo': return 'msm-status--todo';
        case 'ongoing':
        case 'inprogress': return 'msm-status--ongoing';
        case 'forchecking':
        case 'review': return 'msm-status--checking';
        case 'completed':
        case 'done': return 'msm-status--completed';
        default: return '';
    }
}

function buildTree(items: AgendaWorkItem[]): SprintWorkItemNode[] {
    const map = new Map<number, SprintWorkItemNode>();
    const roots: SprintWorkItemNode[] = [];

    for (const item of items) {
        map.set(item.workItemID, { item, children: [] });
    }

    for (const item of items) {
        const node = map.get(item.workItemID)!;
        const parent = item.parentWorkItemID ? map.get(item.parentWorkItemID) : null;
        if (parent) {
            parent.children.push(node);
        } else {
            roots.push(node);
        }
    }

    return roots;
}

function flattenTree(nodes: SprintWorkItemNode[]): AgendaWorkItem[] {
    const out: AgendaWorkItem[] = [];
    function walk(node: SprintWorkItemNode) {
        out.push(node.item);
        node.children.forEach(walk);
    }
    nodes.forEach(walk);
    return out;
}

function canEdit(me: UserProfile | null, sprint: SprintSummary | undefined): boolean {
    if (!me || !sprint) return false;
    if (isElevatedWorkspaceRole(me)) return true;
    if (sprint.managedBy != null && me.userID === sprint.managedBy) return true;
    return false;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

// ── Status badge
function StatusBadge({ status }: { status: string }) {
    return (
        <span className={`msm-status-badge ${statusClass(status)}`}>
            {normalizeStatus(status)}
        </span>
    );
}

// ── Sprint status badge (planned / active / completed)
function SprintStatusBadge({ status }: { status: string }) {
    const cls = (() => {
        switch (status.toLowerCase()) {
            case 'active': return 'msm-sprint-badge--active';
            case 'planned': return 'msm-sprint-badge--planned';
            case 'completed': return 'msm-sprint-badge--completed';
            default: return 'msm-sprint-badge--planned';
        }
    })();
    return <span className={`msm-sprint-badge ${cls}`}>{status}</span>;
}

// ── Type chip
function TypeChip({ type }: { type: string }) {
    const t = type.toLowerCase();
    const cls =
        t === 'story' ? 'msm-type--story' :
            t === 'task' ? 'msm-type--task' :
                t === 'epic' ? 'msm-type--epic' : 'msm-type--other';
    return <span className={`msm-type-chip ${cls}`}>{type.toUpperCase()}</span>;
}

// ── Inline field error
function FieldError({ message }: { message?: string }) {
    if (!message) return null;
    return (
        <div className="msm-field-error" role="alert">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
                <line x1="6" y1="4" x2="6" y2="6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="6" cy="8.5" r="0.5" fill="currentColor" />
            </svg>
            {message}
        </div>
    );
}

// ── Single work-item row (recursive for children)
function WorkItemRow({
    node,
    depth,
    expandedIds,
    onToggle,
    onQuickEdit,
    onRemove,
    onAssignUser,
    canManage,
    searchLower,
    users,
    quickEditMode = false,
    isSprintActive = false,
}: {
    node: SprintWorkItemNode;
    depth: number;
    expandedIds: Set<number>;
    onToggle: (id: number) => void;
    onQuickEdit?: (id: number) => void;
    onRemove?: (id: number, typeName?: string) => void;
    onAssignUser?: (workItemId: number, userId: number | null) => void;
    canManage: boolean;
    searchLower: string;
    users?: Array<{ userID: number; displayName: string }>;
    quickEditMode?: boolean;
    isSprintActive?: boolean;
}) {
    const { item, children } = node;
    const isExpanded = expandedIds.has(item.workItemID);
    const hasChildren = children.length > 0;
    const [showAssignPicker, setShowAssignPicker] = useState(false);

    const titleMatch = searchLower
        ? item.title.toLowerCase().includes(searchLower)
        : true;

    const anyChildMatch = searchLower
        ? flattenTree(children).some(c => c.title.toLowerCase().includes(searchLower))
        : true;

    if (searchLower && !titleMatch && !anyChildMatch) return null;

    const currentAssignee = (item as AgendaWorkItem & { assignedUserName?: string | null }).assignedUserName
        ?? (item.assignedUserID ? `User #${item.assignedUserID}` : null);

    const pickerUsers = useMemo(() => {
        if (!users) return [];
        return [
            { id: 0, name: '— Unassigned —', meta: '' },
            ...users.map(u => ({ id: u.userID, name: u.displayName, meta: '' })),
        ];
    }, [users]);

    return (
        <>
            <tr
                className={`msm-wi-row msm-wi-row--depth-${Math.min(depth, 2)}`}
                style={{ '--msm-depth': depth } as React.CSSProperties}
            >
                {/* Expand toggle + type */}
                <td className="msm-td msm-td--type">
                    <div className="msm-td-type-inner">
                        {depth > 0 && (
                            <span className="msm-wi-indent" aria-hidden="true" />
                        )}
                        {hasChildren ? (
                            <button
                                type="button"
                                className="msm-expand-btn"
                                onClick={() => onToggle(item.workItemID)}
                                aria-label={isExpanded ? 'Collapse' : 'Expand'}
                            >
                                <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 10 10"
                                    fill="none"
                                    style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s ease' }}
                                >
                                    <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                        ) : (
                            <span className="msm-expand-spacer" aria-hidden="true" />
                        )}
                        <TypeChip type={item.typeName ?? 'Task'} />
                    </div>
                </td>

                {/* Title */}
                <td className="msm-td msm-td--title">
                    <span className="msm-wi-title">{item.title}</span>
                </td>

                {/* Status */}
                <td className="msm-td msm-td--status">
                    <StatusBadge status={item.status} />
                </td>

                {/* Due date */}
                <td className="msm-td msm-td--due">
                    <span className="msm-wi-due">{formatDate(item.dueDate)}</span>
                </td>

                {/* Assignee + actions inline */}
                <td className="msm-td msm-td--assignee">
                    {canManage && onAssignUser && quickEditMode ? (
                        <div className="msm-wi-assignee-inline">
                            <span className="msm-wi-assignee-name">
                                {currentAssignee ?? 'Unassigned'}
                            </span>
                            <div className="msm-wi-assignee-actions">
                                <button
                                    type="button"
                                    className="msm-wi-icon-btn"
                                    onClick={() => setShowAssignPicker(true)}
                                    title={item.assignedUserID ? 'Change assignee' : 'Assign'}
                                >
                                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                        <path d="M9.5 1.5l3 3L4 13H1v-3L9.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                                    </svg>
                                </button>
                                {onRemove && (
                                    <button
                                        type="button"
                                        className="msm-wi-icon-btn msm-wi-icon-btn--danger"
                                        onClick={() => onRemove(item.workItemID, item.typeName ?? undefined)}
                                        disabled={isSprintActive}
                                        title={isSprintActive ? 'Cannot remove work items while sprint is active' : 'Remove from sprint'}
                                    >
                                        <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                                            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <span className="msm-wi-assignee">
                            {currentAssignee ?? '—'}
                        </span>
                    )}
                </td>
            </tr>

            {/* Assignee picker modal */}
            {showAssignPicker && onAssignUser && (
                <PickerModal
                    title="Change Assignee"
                    onClose={() => setShowAssignPicker(false)}
                    onPick={(id, _name) => {
                        onAssignUser(item.workItemID, id === 0 ? null : id);
                        setShowAssignPicker(false);
                    }}
                    items={pickerUsers}
                    loading={false}
                    preselectedId={item.assignedUserID}
                />
            )}

            {/* Children (recursive) */}
            {isExpanded && children.map(child => (
                <WorkItemRow
                    key={child.item.workItemID}
                    node={child}
                    depth={depth + 1}
                    expandedIds={expandedIds}
                    onToggle={onToggle}
                    onQuickEdit={onQuickEdit}
                    onRemove={onRemove}
                    onAssignUser={onAssignUser}
                    canManage={canManage}
                    searchLower={searchLower}
                    users={users}
                    quickEditMode={quickEditMode}
                    isSprintActive={isSprintActive}
                />
            ))}
        </>
    );
}

// ─── Picker Modal (for manager and team selection) ───────────────────────────

function PickerModal({
    title,
    onClose,
    onPick,
    items,
    loading,
    preselectedId,
}: {
    title: string;
    onClose: () => void;
    onPick: (id: number, name: string) => void;
    items: { id: number; name: string; meta: string }[];
    loading: boolean;
    preselectedId: number | null;
}) {
    const [search, setSearch] = useState('');

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const filtered = useMemo(() => {
        if (!search.trim()) return items;
        const q = search.toLowerCase();
        return items.filter(i =>
            i.name.toLowerCase().includes(q) || i.meta.toLowerCase().includes(q)
        );
    }, [items, search]);

    const [pickedId, setPickedId] = useState<number | null>(preselectedId);
    useEffect(() => {
        setPickedId(preselectedId);
    }, [preselectedId]);

    const selected = items.find(i => i.id === pickedId);

    return (
        <div className="msm-picker-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
            <div className="msm-picker-modal" onClick={e => e.stopPropagation()}>
                <div className="msm-picker-header">
                    <h3>{title}</h3>
                    <button type="button" className="msm-picker-close" onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </div>
                <div className="msm-picker-search">
                    <input
                        className="msm-picker-input"
                        placeholder="Search…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        autoFocus
                    />
                </div>
                <div className="msm-picker-list">
                    {loading ? (
                        <div className="msm-picker-loading">Loading…</div>
                    ) : filtered.length === 0 ? (
                        <div className="msm-picker-empty">No results.</div>
                    ) : (
                        filtered.map(item => (
                            <button
                                key={item.id}
                                type="button"
                                className={`msm-picker-item${pickedId === item.id ? ' msm-picker-item--selected' : ''}`}
                                onClick={() => setPickedId(item.id)}
                            >
                                <span className="msm-picker-item-name">{item.name}</span>
                                {item.meta && <span className="msm-picker-item-meta">{item.meta}</span>}
                            </button>
                        ))
                    )}
                </div>
                <div className="msm-picker-footer">
                    <button type="button" className="msm-btn msm-btn--cancel" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="msm-btn msm-btn--save"
                        disabled={!selected}
                        onClick={() => selected && onPick(selected.id, selected.name)}
                    >
                        {preselectedId ? 'Update' : 'Assign'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function ManageSprintModal({
    // New interface props
    sprint,
    workItems = [],
    me,
    onSave,
    onClose,
    onAddWorkItem,
    onQuickEditWorkItem,
    onRemoveWorkItem,
    // Legacy interface props from BacklogsPage
    manageSprintId,
    manageSprintData,
    manageSprintName,
    setManageSprintName,
    manageGoal,
    setManageGoal,
    manageStartDate,
    setManageStartDate,
    manageEndDate,
    setManageEndDate,
    manageManagedBy: _manageManagedBy,
    setManageManagedBy,
    manageTeamId: _manageTeamId,
    setManageTeamId,
    manageLoading: _manageLoading,
    manageError: _manageError,
}: ManageSprintModalProps) {

    // Determine if we're using legacy mode (from BacklogsPage) or new mode
    const isLegacyMode = manageSprintName !== undefined;
    
    // Build a synthetic sprint object for legacy mode
    // Use manageSprintData if available (has status, managedByName, etc from list endpoint)
    const effectiveSprint: SprintSummary | undefined = isLegacyMode
        ? (manageSprintData ?? {
            // Fallback to partial data if manageSprintData not provided
            sprintID: manageSprintId ?? 0,
            sprintName: manageSprintName ?? '',
            goal: manageGoal ?? null,
            startDate: manageStartDate ?? null,
            endDate: manageEndDate ?? null,
            status: 'Planned',
            managedBy: _manageManagedBy ?? null,
            managedByName: null,
            teamID: _manageTeamId ?? null,
            storyCount: 0,
            taskCount: 0,
          })
        : sprint;

    if (!effectiveSprint) {
        return null; // Should not happen, but guard against it
    }

    const userCanEdit = canEdit(me, effectiveSprint);
    const isSprintActive = effectiveSprint.status === 'Active';

    // ── Local sprint-detail state (left panel) ──────────────────────────────
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [activeSprintError, setActiveSprintError] = useState('');

    // Initialize from props (supports both interfaces)
    const [name, setName] = useState(effectiveSprint.sprintName ?? '');
    const [goal, setGoal] = useState(effectiveSprint.goal ?? '');
    const [startDate, setStartDate] = useState(effectiveSprint.startDate ?? '');
    const [endDate, setEndDate] = useState(effectiveSprint.endDate ?? '');
    const [teamID, setTeamID] = useState<number | null>(effectiveSprint.teamID ?? null);
    const [teamName, setTeamName] = useState<string | null>((effectiveSprint as SprintSummary & { teamName?: string }).teamName ?? null);
    const [managedBy, setManagedBy] = useState<number | null>(effectiveSprint.managedBy ?? null);
    const [managedByName, setManagedByName] = useState<string | null>((effectiveSprint as SprintSummary & { managedByName?: string }).managedByName ?? null);

    const [nameError, setNameError] = useState('');
    const [dateError, setDateError] = useState('');
    const [goalError, setGoalError] = useState('');

    // ── Users for assignee resolution (must be before useSprintHubEvents) ───
    const [users, setUsers] = useState<Array<{ userID: number; displayName: string }>>([]);
    const usersRef = useRef(users);
    useEffect(() => { usersRef.current = users; }, [users]);

    // ── Live items (SignalR-ready local state) ──────────────────────────────
    const [liveItems, setLiveItems] = useState<AgendaWorkItem[]>(workItems);
    const [dataLoading, setDataLoading] = useState(false);
    const [dataError, setDataError] = useState('');

    // ── Fetch actual sprint data from backend on mount ──────────────────────
    useEffect(() => {
        // Only fetch if we have a valid sprint ID
        const sprintId = effectiveSprint?.sprintID;
        if (!sprintId || sprintId <= 0) return;

        let cancelled = false;

        const fetchSprintData = async () => {
            setDataLoading(true);
            setDataError('');
            try {
                const { sprint, workItems: fetchedItems } = await getSprintDetails(sprintId);

                if (!cancelled) {
                    // Update local state with fetched data
                    setName(sprint.sprintName ?? '');
                    setGoal(sprint.goal ?? '');
                    setStartDate(sprint.startDate ?? '');
                    setEndDate(sprint.endDate ?? '');
                    setTeamID(sprint.teamID ?? null);
                    const rawTeamName = (sprint as SprintSummary & { teamName?: string | null }).teamName;
                    setTeamName(
                        rawTeamName && rawTeamName.trim().toLowerCase() === 'default team'
                            ? 'Unassigned'
                            : (rawTeamName ?? null)
                    );
                    setManagedBy(sprint.managedBy ?? null);
                    setManagedByName((sprint as SprintSummary & { managedByName?: string | null }).managedByName ?? null);
                    setLiveItems(fetchedItems);

                    // If in legacy mode, also update parent component's state
                    if (isLegacyMode) {
                        if (setManageSprintName) setManageSprintName(sprint.sprintName ?? '');
                        if (setManageGoal) setManageGoal(sprint.goal ?? '');
                        if (setManageStartDate) setManageStartDate(sprint.startDate ?? '');
                        if (setManageEndDate) setManageEndDate(sprint.endDate ?? '');
                        if (setManageTeamId) setManageTeamId(sprint.teamID ?? null);
                        if (setManageManagedBy) setManageManagedBy(sprint.managedBy ?? null);
                    }
                }
            } catch (err) {
                if (!cancelled) {
                    const errorMsg = err instanceof Error ? err.message : 'Failed to load sprint details';
                    setDataError(errorMsg);
                    console.error('Failed to fetch sprint details:', err);
                }
            } finally {
                if (!cancelled) {
                    setDataLoading(false);
                }
            }
        };

        fetchSprintData();

        return () => {
            cancelled = true;
        };
        // Only depend on sprintId, not effectiveSprint object (which changes every render)
    }, [effectiveSprint?.sprintID, isLegacyMode, setManageSprintName, setManageGoal, setManageStartDate, setManageEndDate, setManageTeamId]);

    // Sync workItems prop only if no data has been fetched yet
    useEffect(() => {
        if (liveItems.length === 0 && workItems.length > 0) {
            setLiveItems(workItems);
        }
    }, [workItems, liveItems.length]);

    // ── SignalR hooks - listen for external changes ─────────────────────────
    useSprintHubEvents(effectiveSprint.sprintID, {
        onSprintUpdated: (patch) => {
            if (patch.sprintName) {
                setName(patch.sprintName);
                if (isLegacyMode && setManageSprintName) {
                    setManageSprintName(patch.sprintName);
                }
            }
            if (patch.goal !== undefined) {
                const newGoal = patch.goal ?? '';
                setGoal(newGoal);
                if (isLegacyMode && setManageGoal) {
                    setManageGoal(newGoal);
                }
            }
            if (patch.startDate !== undefined) {
                const newStart = patch.startDate ?? '';
                setStartDate(newStart);
                if (isLegacyMode && setManageStartDate) {
                    setManageStartDate(newStart);
                }
            }
            if (patch.endDate !== undefined) {
                const newEnd = patch.endDate ?? '';
                setEndDate(newEnd);
                if (isLegacyMode && setManageEndDate) {
                    setManageEndDate(newEnd);
                }
            }
            if (patch.teamID !== undefined) {
                const newTeamID = patch.teamID ?? null;
                setTeamID(newTeamID);
                if (isLegacyMode && setManageTeamId) {
                    setManageTeamId(newTeamID);
                }
            }
            // Handle manager changes from SignalR broadcast
            if (patch.managedBy !== undefined) {
                const newManagedBy = patch.managedBy ?? null;
                setManagedBy(newManagedBy);
            }
            if (patch.managedByName !== undefined) {
                const newManagedByName = patch.managedByName ?? null;
                setManagedByName(newManagedByName);
            }
            if (patch.teamName !== undefined) {
                const newTeamName = patch.teamName ?? null;
                setTeamName(newTeamName);
            }
        },
        onWorkItemAdded: (item) =>
            setLiveItems(prev => prev.some(i => i.workItemID === item.workItemID) ? prev : [...prev, item]),
        onWorkItemRemoved: (id) =>
            setLiveItems(prev => prev.filter(i => i.workItemID !== id)),
        onWorkItemUpdated: (item) =>
            setLiveItems(prev => prev.map(i => {
                if (i.workItemID !== item.workItemID) return i;
                const resolvedName = item.assignedUserID
                    ? (usersRef.current.find(u => u.userID === item.assignedUserID)?.displayName ?? null)
                    : null;
                return {
                    ...i,
                    ...item,
                    typeName: item.typeName || i.typeName,
                    parentWorkItemID: item.parentWorkItemID ?? i.parentWorkItemID,
                    assignedUserName: resolvedName ?? i.assignedUserName,
                };
            })),
        onWorkItemStatusChanged: (workItemId, newStatus) =>
            setLiveItems(prev => prev.map(i =>
                i.workItemID === workItemId ? { ...i, status: newStatus } : i
            )),
        onWorkItemMoved: (item) =>
            setLiveItems(prev => prev.map(i => {
                if (i.workItemID !== item.workItemID) return i;
                return {
                    ...i,
                    ...item,
                    typeName: item.typeName || i.typeName,
                    parentWorkItemID: item.parentWorkItemID ?? i.parentWorkItemID,
                    assignedUserName: item.assignedUserName ?? i.assignedUserName,
                };
            })),
    });

    useEffect(() => {
        if (!userCanEdit) return;

        let cancelled = false;
        const fetchUsers = async () => {
            try {
                const userList = await lookupUsers({ search: '', teamId: teamID, limit: 200 });
                if (!cancelled) {
                    setUsers(userList.map(u => ({
                        userID: u.userID,
                        displayName: u.displayName || `User #${u.userID}`
                    })));
                }
            } catch (err) {
                console.warn('Failed to load users for assignment:', err);
            }
        };
        fetchUsers();
        return () => { cancelled = true; };
    }, [userCanEdit, teamID]);

    // ── Sprint manager and team picker state ────────────────────────────────
    const canEditSprintMeta = canEditSprintMetadata(me, effectiveSprint);
    const canEditSprintTeam =
        canEditSprintMeta || (me?.userID != null && effectiveSprint.managedBy === me.userID);
    const [showManagerPicker, setShowManagerPicker] = useState(false);
    const [showTeamPicker, setShowTeamPicker] = useState(false);
    const [pickerUsers, setPickerUsers] = useState<Array<{ id: number; name: string; meta: string }>>([]);
    const [pickerTeams, setPickerTeams] = useState<Array<{ id: number; name: string; meta: string }>>([]);
    const [pickerLoading, setPickerLoading] = useState(false);

    useEffect(() => {
        if (!showManagerPicker && !showTeamPicker) return;

        let cancelled = false;
        const loadData = async () => {
            setPickerLoading(true);
            try {
                if (showManagerPicker) {
                    const userList = await lookupUsers({ search: '', limit: 200 });
                    if (!cancelled) {
                        setPickerUsers([
                            { id: 0, name: '— No Manager —', meta: '' },
                            ...userList.map(u => ({
                                id: u.userID,
                                name: u.displayName || `User #${u.userID}`,
                                meta: u.emailAddress || ''
                            }))
                        ]);
                    }
                }
                if (showTeamPicker) {
                    const teamList = await lookupTeams({ search: '', limit: 200 });
                    if (!cancelled) {
                        setPickerTeams([
                            ...teamList.map(t => ({
                                id: t.teamID,
                                name: t.teamName.trim().toLowerCase() === 'default team'
                                    ? '— Unassigned —'
                                    : t.teamName,
                                meta: ''
                            }))
                        ]);
                    }
                }
            } catch (err) {
                console.warn('Failed to load picker data:', err);
            } finally {
                if (!cancelled) setPickerLoading(false);
            }
        };
        loadData();
        return () => { cancelled = true; };
    }, [showManagerPicker, showTeamPicker]);

    // ── Handler: Assign/Reassign work item to user ──────────────────────────
    const handleAssignUser = useCallback(async (workItemId: number, userId: number | null) => {
        if (!effectiveSprint.sprintID) return;
        
        try {
            // Use PATCH endpoint to update work item assignee
            await import('../../api/workItemsApi').then(({ patchWorkItem }) => 
                patchWorkItem(workItemId, { 
                    assignedUserID: userId,
                    clearAssignee: userId === null 
                })
            );
            
            // Update local state immediately
            setLiveItems(prev => prev.map(item => 
                item.workItemID === workItemId 
                    ? { 
                        ...item, 
                        assignedUserID: userId, 
                        assignedUserName: userId ? (users.find(u => u.userID === userId)?.displayName ?? null) : null 
                      }
                    : item
            ));
        } catch (err) {
            console.error('Failed to assign work item:', err);
            setDataError(err instanceof Error ? err.message : 'Failed to assign user');
        }
    }, [effectiveSprint.sprintID, users]);

    // ── Work-item list state (right panel) ─────────────────────────────────
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('type');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [filterType, setFilterType] = useState<FilterType>('All');
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('All');
    const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
    const [quickEditMode, setQuickEditMode] = useState(false);
    const [filterMenuOpen, setFilterMenuOpen] = useState(false);
    const [sortMenuOpen, setSortMenuOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);
    const sortRef = useRef<HTMLDivElement>(null);

    // ── Close menus on outside click ────────────────────────────────────────
    useEffect(() => {
        if (!filterMenuOpen && !sortMenuOpen) return;
        const onDown = (e: MouseEvent) => {
            if (filterRef.current?.contains(e.target as Node)) return;
            if (sortRef.current?.contains(e.target as Node)) return;
            setFilterMenuOpen(false);
            setSortMenuOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [filterMenuOpen, sortMenuOpen]);

    // ── Escape key ──────────────────────────────────────────────────────────
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (editing) { cancelEdit(); } else { onClose(); }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [editing, onClose]);

    // ── Derived tree + filtered/sorted list ────────────────────────────────
    const tree = useMemo(() => buildTree(liveItems), [liveItems]);

    const filteredTree = useMemo<SprintWorkItemNode[]>(() => {
        let nodes = tree;

        if (filterType !== 'All') {
            const ft = filterType.toLowerCase();
            nodes = nodes.filter(n =>
                n.item.typeName?.toLowerCase() === ft ||
                n.children.some(c => c.item.typeName?.toLowerCase() === ft)
            );
        }

        if (filterStatus !== 'All') {
            const fs = filterStatus.toLowerCase();
            nodes = nodes.filter(n =>
                n.item.status.toLowerCase().replace(/\s/g, '') === fs ||
                n.children.some(c => c.item.status.toLowerCase().replace(/\s/g, '') === fs)
            );
        }

        if (sortKey) {
            nodes = [...nodes].sort((a, b) => {
                let av = '', bv = '';
                switch (sortKey) {
                    case 'type': av = a.item.typeName ?? ''; bv = b.item.typeName ?? ''; break;
                    case 'title': av = a.item.title; bv = b.item.title; break;
                    case 'status': av = a.item.status; bv = b.item.status; break;
                    case 'dueDate': av = a.item.dueDate ?? ''; bv = b.item.dueDate ?? ''; break;
                    case 'assignee':
                        av = (a.item as AgendaWorkItem & { assignedUserName?: string }).assignedUserName ?? '';
                        bv = (b.item as AgendaWorkItem & { assignedUserName?: string }).assignedUserName ?? '';
                        break;
                }
                const cmp = av.localeCompare(bv);
                return sortDir === 'asc' ? cmp : -cmp;
            });
        }

        return nodes;
    }, [tree, filterType, filterStatus, sortKey, sortDir]);

    const searchLower = search.trim().toLowerCase();

    // ── Toggle row expansion ────────────────────────────────────────────────
    const toggleExpand = useCallback((id: number) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }, []);

    const expandAll = () => {
        const ids = new Set<number>();
        const walk = (nodes: SprintWorkItemNode[]) => {
            for (const n of nodes) {
                if (n.children.length > 0) ids.add(n.item.workItemID);
                walk(n.children);
            }
        };
        walk(tree);
        setExpandedIds(ids);
    };

    const collapseAll = () => setExpandedIds(new Set());

    // ── Edit flow ───────────────────────────────────────────────────────────
    const beginEdit = () => {
        setName(effectiveSprint.sprintName ?? '');
        setGoal(effectiveSprint.goal ?? '');
        setStartDate(effectiveSprint.startDate ?? '');
        setEndDate(effectiveSprint.endDate ?? '');
        setNameError(''); setDateError(''); setGoalError(''); setSaveError(''); setActiveSprintError('');
        setEditing(true);
    };

    const cancelEdit = () => {
        setEditing(false);
        setNameError(''); setDateError(''); setGoalError(''); setSaveError(''); setActiveSprintError('');
    };

    const validate = (): boolean => {
        let ok = true;
        if (!name.trim()) { setNameError('Sprint name is required.'); ok = false; }
        else if (name.length > 100) { setNameError('Max 100 characters.'); ok = false; }
        else setNameError('');

        if (!goal.trim()) { setGoalError('Sprint goal is required.'); ok = false; }
        else if (goal.length > 255) { setGoalError('Max 255 characters.'); ok = false; }
        else setGoalError('');

        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            setDateError('End date must be on or after start date.'); ok = false;
        } else setDateError('');

        return ok;
    };

    const handleSave = async (e: FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        if (isSprintActive) {
            const nameChanged = name.trim() !== (effectiveSprint.sprintName ?? '').trim();
            const goalChanged = goal.trim() !== (effectiveSprint.goal ?? '').trim();
            const startChanged = startDate !== (effectiveSprint.startDate ?? '');
            if (nameChanged || goalChanged || startChanged) {
                setActiveSprintError('Cannot edit sprint details while the sprint is active (except changing sprint manager/team). Stop the sprint first for other edits.');
                return;
            }
            setActiveSprintError('');
        }

        setSaving(true);
        setSaveError('');
        try {
            // Build the patch payload - only include managedBy and teamID if user has permission
            const patch: SprintPatch = {
                sprintName: name.trim(),
                goal: goal.trim(),
                startDate: startDate || null,
                endDate: endDate || null,
            };

            if (canEditSprintMeta) {
                patch.managedBy = managedBy;
            }
            if (canEditSprintTeam) {
                patch.teamID = teamID;
            }

            // Call the API to update the sprint
            if (effectiveSprint.sprintID > 0) {
                if (onSave) {
                    // New interface: use the callback
                    await onSave(patch);
                } else {
                    // Direct API call: backend will handle notifications and SignalR broadcast
                    await patchSprintApi(effectiveSprint.sprintID, {
                        sprintName: patch.sprintName,
                        goal: patch.goal,
                        startDate: patch.startDate,
                        endDate: patch.endDate,
                        managedBy: patch.managedBy ?? null,
                        teamID: patch.teamID ?? null,
                    });
                }
            }

            setEditing(false);
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Failed to save sprint.');
        } finally {
            setSaving(false);
        }
    };

    // ── Derived display values ──────────────────────────────────────────────
    const displayName = editing ? name : effectiveSprint.sprintName;
    const displayGoal = editing ? goal : (effectiveSprint.goal ?? '—');
    const displayStart = editing ? startDate : effectiveSprint.startDate;
    const displayEnd = editing ? endDate : effectiveSprint.endDate;

    const totalItems = liveItems.length;
    const doneItems = liveItems.filter(i =>
        ['completed', 'done'].includes(i.status.toLowerCase())
    ).length;
    const progressPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
    
    // Use backend counts if available, fallback to computed from liveItems
    const backendStoryCount = effectiveSprint.storyCount ?? 0;
    const backendTaskCount = effectiveSprint.taskCount ?? 0;
    
    // Compute actual counts from liveItems for real-time accuracy
    const computedStoryCount = liveItems.filter(i => 
        i.typeName?.toLowerCase() === 'story'
    ).length;
    const computedTaskCount = liveItems.filter(i => 
        i.typeName?.toLowerCase() === 'task'
    ).length;
    
    // Prefer computed counts from actual items, fallback to backend counts
    const displayStoryCount = computedStoryCount > 0 ? computedStoryCount : backendStoryCount;
    const displayTaskCount = computedTaskCount > 0 ? computedTaskCount : backendTaskCount;

    // ─── Render ─────────────────────────────────────────────────────────────
    return (
        <div
            className="msm-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="msm-title"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="msm-modal" onMouseDown={(e) => e.stopPropagation()}>

                {/* ── Loading Overlay ────────────────────────────────────────── */}
                {dataLoading && (
                    <div className="msm-loading-overlay" role="status" aria-live="polite">
                        <div className="msm-loading-spinner" aria-hidden="true" />
                        <p className="msm-loading-text">Loading sprint details…</p>
                    </div>
                )}

                {/* ── Error Banner ───────────────────────────────────────────── */}
                {(dataError || _manageError) && (
                    <div className="msm-error-banner" role="alert">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M8 5v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            <circle cx="8" cy="11" r="0.75" fill="currentColor" />
                        </svg>
                        <span>{dataError || _manageError}</span>
                        <button 
                            type="button" 
                            className="msm-error-dismiss"
                            onClick={() => { setDataError(''); }}
                            aria-label="Dismiss error"
                        >
                            ×
                        </button>
                    </div>
                )}

                {/* ── LEFT PANEL ─────────────────────────────────────────────── */}
                <aside className={`msm-sidebar${editing ? ' msm-sidebar--editing' : ''}`}>
                    {/* Dot-grid texture overlay */}
                    <div className="msm-sidebar-texture" aria-hidden="true" />
                    <div className="msm-sidebar-glow" aria-hidden="true" />

                    {/* Top: eyebrow + status */}
                    <div className="msm-sidebar-top">
                        <div className="msm-sidebar-eyebrow-row">
                            <span className="msm-sidebar-eyebrow">Sprint Settings</span>
                            <SprintStatusBadge status={effectiveSprint.status} />
                        </div>

                        {/* Sprint name */}
                        {editing ? (
                            <div className="msm-edit-field">
                                <input
                                    id="msm-name"
                                    className={`msm-name-input${nameError ? ' msm-input--error' : ''}`}
                                    value={name}
                                    maxLength={100}
                                    disabled={saving || isSprintActive}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Sprint name…"
                                    aria-label="Sprint name"
                                />
                                <FieldError message={nameError} />
                            </div>
                        ) : (
                            <h1 id="msm-title" className="msm-sprint-name">{displayName}</h1>
                        )}

                        {/* Date range */}
                        {editing ? (
                            <div className="msm-dates-row">
                                <div className="msm-edit-field msm-edit-field--half">
                                    <label className="msm-edit-label" htmlFor="msm-start">Start</label>
                                    <input
                                        id="msm-start"
                                        type="date"
                                        className="msm-date-input"
                                        value={startDate}
                                        disabled={saving || isSprintActive}
                                        onChange={e => setStartDate(e.target.value)}
                                    />
                                </div>
                                <div className="msm-edit-field msm-edit-field--half">
                                    <label className="msm-edit-label" htmlFor="msm-end">End</label>
                                    <input
                                        id="msm-end"
                                        type="date"
                                        className="msm-date-input"
                                        value={endDate}
                                        disabled={saving}
                                        onChange={e => setEndDate(e.target.value)}
                                    />
                                </div>
                            </div>
                        ) : (
                            <p className="msm-date-range">
                                {formatDate(displayStart)} — {formatDate(displayEnd)}
                            </p>
                        )}
                        {dateError && <FieldError message={dateError} />}

                        {/* Goal */}
                        {editing ? (
                            <div className="msm-edit-field" style={{ marginTop: 10 }}>
                                <label className="msm-edit-label" htmlFor="msm-goal">Goal</label>
                                <textarea
                                    id="msm-goal"
                                    className={`msm-goal-input${goalError ? ' msm-input--error' : ''}`}
                                    value={goal}
                                    rows={3}
                                    maxLength={255}
                                    disabled={saving || isSprintActive}
                                    onChange={e => setGoal(e.target.value)}
                                    placeholder="What will the team deliver?"
                                />
                                <FieldError message={goalError} />
                            </div>
                        ) : (
                            <p className="msm-goal">{displayGoal}</p>
                        )}
                    </div>

                    {/* Middle: progress + meta */}
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

                        {/* Meta: manager + team */}
                        <div className="msm-meta-section">
                            <div className="msm-meta-row msm-meta-row--stack">
                                <span className="msm-meta-label">Managed By</span>
                                <span className="msm-meta-value">
                                    {editing && canEditSprintMeta ? (
                                        <>
                                            <span className="msm-meta-value-text">
                                                {managedByName ?? (managedBy ? `User #${managedBy}` : 'Unassigned')}
                                            </span>
                                            <button
                                                type="button"
                                                className="msm-meta-icon-btn"
                                                onClick={() => setShowManagerPicker(true)}
                                                title={managedBy ? 'Change manager' : 'Assign manager'}
                                                aria-label={managedBy ? 'Change sprint manager' : 'Assign sprint manager'}
                                            >
                                                {managedBy ? (
                                                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                                        <path d="M9.5 1.5l3 3L4 13H1v-3L9.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                                                    </svg>
                                                ) : (
                                                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                                        <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                                    </svg>
                                                )}
                                            </button>
                                        </>
                                    ) : (
                                        managedByName ?? (managedBy ? `User #${managedBy}` : 'Unassigned')
                                    )}
                                </span>
                            </div>
                            <div className="msm-meta-row msm-meta-row--stack">
                                <span className="msm-meta-label">Team</span>
                                <span className="msm-meta-value">
                                    {editing && canEditSprintTeam ? (
                                        <>
                                            <span className="msm-meta-value-text">
                                                {teamName ?? (teamID ? `Team #${teamID}` : 'Unassigned')}
                                            </span>
                                            <button
                                                type="button"
                                                className="msm-meta-icon-btn"
                                                onClick={() => setShowTeamPicker(true)}
                                                title={teamID ? 'Change team' : 'Assign team'}
                                                aria-label={teamID ? 'Change sprint team' : 'Assign sprint team'}
                                            >
                                                {teamID ? (
                                                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                                        <path d="M9.5 1.5l3 3L4 13H1v-3L9.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                                                    </svg>
                                                ) : (
                                                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                                        <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                                    </svg>
                                                )}
                                            </button>
                                        </>
                                    ) : (
                                        teamName ?? (teamID ? `Team #${teamID}` : 'Unassigned')
                                    )}
                                </span>
                            </div>
                            <div className="msm-meta-row">
                                <span className="msm-meta-label">Stories</span>
                                <span className="msm-meta-value">{displayStoryCount}</span>
                            </div>
                            <div className="msm-meta-row">
                                <span className="msm-meta-label">Tasks</span>
                                <span className="msm-meta-value">{displayTaskCount}</span>
                            </div>
                        </div>
                    </div>

                    {/* Active sprint error */}
                    {activeSprintError && (
                        <div className="msm-save-error" role="alert">{activeSprintError}</div>
                    )}

                    {/* Save error */}
                    {saveError && (
                        <div className="msm-save-error" role="alert">{saveError}</div>
                    )}

                    {/* Bottom: action buttons */}
                    <div className="msm-sidebar-footer">
                        {userCanEdit && !editing && (
                            <button type="button" className="msm-btn msm-btn--edit" onClick={beginEdit}>
                                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                    <path d="M9.5 1.5l3 3L4 13H1v-3L9.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                                </svg>
                                Edit Sprint
                            </button>
                        )}
                        {editing && (
                            <div className="msm-edit-actions">
                                <button type="button" className="msm-btn msm-btn--cancel" onClick={cancelEdit} disabled={saving}>
                                    Cancel
                                </button>
                                <button type="button" className="msm-btn msm-btn--save" onClick={handleSave} disabled={saving} aria-busy={saving}>
                                    {saving ? (
                                        <><span className="msm-spinner" aria-hidden="true" /> Saving…</>
                                    ) : (
                                        <><svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                            <path d="M2 7.5l3.5 3.5L12 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg> Save</>
                                    )}
                                </button>
                            </div>
                        )}
                        <button type="button" className="msm-btn msm-btn--close" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </aside>

                {/* ── RIGHT PANEL ────────────────────────────────────────────── */}
                <div className="msm-main">
                    {/* Header */}
                    <div className="msm-main-header">
                        <div className="msm-main-header-left">
                            <h2 className="msm-main-title">Work Item List</h2>
                            <span className="msm-item-count">{liveItems.length}</span>
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
                                    placeholder="Search items…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    aria-label="Search work items"
                                />
                            </div>

                            {/* Sort menu */}
                            <div className="msm-toolbar-btn-wrap" ref={sortRef}>
                                <button
                                    type="button"
                                    className={`msm-toolbar-btn${sortMenuOpen ? ' msm-toolbar-btn--active' : ''}`}
                                    aria-label="Sort work items"
                                    title="Sort"
                                    onClick={() => { setFilterMenuOpen(false); setSortMenuOpen(v => !v); }}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                        <path d="M7 11l5-5 5 5M7 13l5 5 5-5" />
                                    </svg>
                                </button>
                                {sortMenuOpen && (
                                    <div className="msm-dropdown" role="menu">
                                        <span className="msm-dropdown-label">Sort by</span>
                                        {(['type', 'title', 'status', 'dueDate', 'assignee'] as SortKey[]).map(k => (
                                            <button
                                                key={k}
                                                type="button"
                                                role="menuitem"
                                                className={`msm-dropdown-option${sortKey === k ? ' msm-dropdown-option--active' : ''}`}
                                                onClick={() => { setSortKey(k); setSortMenuOpen(false); }}
                                            >
                                                {k === 'dueDate' ? 'Due Date' : k.charAt(0).toUpperCase() + k.slice(1)}
                                                {sortKey === k && (
                                                    <span className="msm-dropdown-check">✓</span>
                                                )}
                                            </button>
                                        ))}
                                        <div className="msm-dropdown-divider" />
                                        <span className="msm-dropdown-label">Direction</span>
                                        <button type="button" role="menuitem" className={`msm-dropdown-option${sortDir === 'asc' ? ' msm-dropdown-option--active' : ''}`} onClick={() => { setSortDir('asc'); setSortMenuOpen(false); }}>
                                            Ascending {sortDir === 'asc' && <span className="msm-dropdown-check">✓</span>}
                                        </button>
                                        <button type="button" role="menuitem" className={`msm-dropdown-option${sortDir === 'desc' ? ' msm-dropdown-option--active' : ''}`} onClick={() => { setSortDir('desc'); setSortMenuOpen(false); }}>
                                            Descending {sortDir === 'desc' && <span className="msm-dropdown-check">✓</span>}
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Filter menu */}
                            <div className="msm-toolbar-btn-wrap" ref={filterRef}>
                                <button
                                    type="button"
                                    className={`msm-toolbar-btn${filterMenuOpen ? ' msm-toolbar-btn--active' : ''}`}
                                    aria-label="Filter work items"
                                    title="Filter"
                                    onClick={() => { setSortMenuOpen(false); setFilterMenuOpen(v => !v); }}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                        <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
                                    </svg>
                                </button>
                                {filterMenuOpen && (
                                    <div className="msm-dropdown" role="menu">
                                        <span className="msm-dropdown-label">Type</span>
                                        {(['All', 'Story', 'Task'] as FilterType[]).map(t => (
                                            <button key={t} type="button" role="menuitem"
                                                className={`msm-dropdown-option${filterType === t ? ' msm-dropdown-option--active' : ''}`}
                                                onClick={() => { setFilterType(t); }}>
                                                {t} {filterType === t && <span className="msm-dropdown-check">✓</span>}
                                            </button>
                                        ))}
                                        <div className="msm-dropdown-divider" />
                                        <span className="msm-dropdown-label">Status</span>
                                        {(['All', 'Todo', 'Ongoing', 'ForChecking', 'Completed'] as FilterStatus[]).map(s => (
                                            <button key={s} type="button" role="menuitem"
                                                className={`msm-dropdown-option${filterStatus === s ? ' msm-dropdown-option--active' : ''}`}
                                                onClick={() => { setFilterStatus(s); }}>
                                                {s === 'ForChecking' ? 'For Checking' : s}
                                                {filterStatus === s && <span className="msm-dropdown-check">✓</span>}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Expand / collapse all */}
                            <button type="button" className="msm-toolbar-btn" title="Expand all" onClick={expandAll}>
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                    <path d="M2 5h10M2 9h10M5 2v10M9 2v10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                </svg>
                            </button>
                            <button type="button" className="msm-toolbar-btn" title="Collapse all" onClick={collapseAll}>
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                    <path d="M2 7h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="msm-table-wrap">
                        {liveItems.length === 0 ? (
                            <div className="msm-empty">
                                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                                    <rect x="4" y="4" width="24" height="24" rx="4" stroke="currentColor" strokeWidth="1.3" strokeDasharray="3 3" />
                                    <path d="M11 16h10M16 11v10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                </svg>
                                <p>No work items assigned to this sprint.</p>
                                {userCanEdit && onAddWorkItem && (
                                    <button type="button" className="msm-btn msm-btn--add" onClick={onAddWorkItem}>
                                        Add your first item
                                    </button>
                                )}
                            </div>
                        ) : (
                            <table className="msm-table" aria-label="Sprint work items">
                                <thead>
                                    <tr className="msm-thead-row">
                                        <th className="msm-th msm-th--type" scope="col">Type</th>
                                        <th className="msm-th msm-th--title" scope="col">Work Item Title</th>
                                        <th className="msm-th msm-th--status" scope="col">Status</th>
                                        <th className="msm-th msm-th--due" scope="col">Due Date</th>
                                        <th className="msm-th msm-th--assignee" scope="col">Assignee</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredTree.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="msm-no-results">
                                                No items match your filters.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredTree.map(node => (
                                            <WorkItemRow
                                                key={node.item.workItemID}
                                                node={node}
                                                depth={0}
                                                expandedIds={expandedIds}
                                                onToggle={toggleExpand}
                                                onQuickEdit={userCanEdit ? onQuickEditWorkItem : undefined}
                                                onRemove={userCanEdit ? onRemoveWorkItem : undefined}
                                                onAssignUser={userCanEdit ? handleAssignUser : undefined}
                                                canManage={userCanEdit}
                                                searchLower={searchLower}
                                                users={userCanEdit ? users : undefined}
                                                quickEditMode={quickEditMode}
                                                isSprintActive={isSprintActive}
                                            />
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Footer actions */}
                    {userCanEdit && (
                        <div className="msm-main-footer">
                            <button
                                type="button"
                                className={`msm-btn ${quickEditMode ? 'msm-btn--save' : 'msm-btn--quick-edit'}`}
                                onClick={() => setQuickEditMode(v => !v)}
                            >
                                {quickEditMode ? (
                                    <>
                                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                            <path d="M2 7.5l3.5 3.5L12 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        Done Editing
                                    </>
                                ) : (
                                    <>
                                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                            <path d="M2 10h10M2 7h7M2 4h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                                        </svg>
                                        Quick Edit Work Items
                                    </>
                                )}
                            </button>
                            {onAddWorkItem && (
                                <button type="button" className="msm-btn msm-btn--add" onClick={onAddWorkItem}>
                                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                        <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                    </svg>
                                    Add Work Item
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Manager Picker Modal */}
            {showManagerPicker && (
                <PickerModal
                    title="Change Sprint Manager"
                    onClose={() => setShowManagerPicker(false)}
                    onPick={(id, name) => {
                        setManagedBy(id === 0 ? null : id);
                        setManagedByName(id === 0 ? null : name);
                        setShowManagerPicker(false);
                    }}
                    items={pickerUsers}
                    loading={pickerLoading}
                    preselectedId={managedBy}
                />
            )}

            {/* Team Picker Modal */}
            {showTeamPicker && (
                <PickerModal
                    title="Change Sprint Team"
                    onClose={() => setShowTeamPicker(false)}
                    onPick={(id, name) => {
                        setTeamID(id);
                        setTeamName(name === '— Unassigned —' ? 'Unassigned' : name);
                        setShowTeamPicker(false);
                    }}
                    items={pickerTeams}
                    loading={pickerLoading}
                    preselectedId={teamID}
                />
            )}
        </div>
    );
}