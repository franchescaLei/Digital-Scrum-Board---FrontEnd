import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import apiClient from '../../services/apiClient';
import type { AgendaWorkItem, SprintSummary } from '../../types/planning';
import { priorityAccentClass } from './planningUtils';
import { lookupUsers, lookupTeams } from '../../api/lookupsApi';
import { getBoardHubConnection, ensureBoardHubStarted } from '../../services/boardHub';
import { ApiError } from '../../services/apiClient';
import { useDebounced } from './useDebounced';
import { formatDateTime, formatDate, getTodayLocal } from '../../utils/dateFormatter';
import { normalizeWorkItemFromEventPayload } from '../../types/boardSignalR';

// ─────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────

const CloseIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
);

const PlusIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
);

const EditIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M9.5 1.5l3 3L4 13H1v-3L9.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M7.5 3.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
);

const SaveIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M2 7.5l3.5 3.5L12 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const CancelIcon = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

const TrashIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M2 4h10M5 4V2.5A.5.5 0 0 1 5.5 2h3a.5.5 0 0 1 .5.5V4M6 6.5v3M8 6.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3 4l.7 7.5a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L11 4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
);

const CommentIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M12.5 1.5H1.5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2l2 2.5 2-2.5h5a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
);

const PinIcon = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M8.5 1.5l2 2-2.8 2.8.3 2.7-2 .5L4.5 8l-3 3-1-1 3-3-1.5-1.5.5-2 2.7.3L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
);

const SpinnerIcon = () => (
    <span className="wi-modal-spinner" aria-hidden="true" />
);

function toDateOnly(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const idx = trimmed.indexOf('T');
    return idx >= 0 ? trimmed.slice(0, idx) : trimmed;
}

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface CommentItem {
    commentID: number;
    workItemID: number;
    commentedBy: number;
    commentedByName?: string | null;
    commentText: string;
    createdAt: string;
    updatedAt?: string | null;
    isDeleted?: boolean | null;
    _optimistic?: boolean;
}

interface WorkItemDetails extends AgendaWorkItem {
    description?: string | null;
    comments?: CommentItem[];
    parentTitle?: string | null;
    teamName?: string | null;
    assignedUserName?: string | null;
    sprintName?: string | null;
    createdAt?: string | null;
    stories?: AgendaWorkItem[];
    tasks?: AgendaWorkItem[];
}

interface EditableFields {
    title: string;
    description: string;
    priority: string;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getInitials(name: string | null | undefined): string {
    if (!name) return '?';
    return name.split(' ').map(n => n[0] ?? '').join('').slice(0, 2).toUpperCase();
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function SectionHeading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="wi-section-heading">
            <span className="wi-section-heading-icon">{icon}</span>
            <span>{children}</span>
        </div>
    );
}

function CommentCard({
    comment,
    canEdit,
    canDelete,
    onDelete,
    onEdit,
}: {
    comment: CommentItem;
    canEdit: boolean;
    canDelete: boolean;
    onDelete: (id: number) => void;
    onEdit: (id: number, text: string) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [editText, setEditText] = useState(comment.commentText);
    const [saving, setSaving] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (editing) textareaRef.current?.focus();
    }, [editing]);

    const handleSave = async () => {
        if (!editText.trim()) return;
        setSaving(true);
        try {
            await onEdit(comment.commentID, editText.trim());
            setEditing(false);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={`wi-comment-card${comment._optimistic ? ' wi-comment-card--optimistic' : ''}`}>
            <div className="wi-comment-header">
                <div className="wi-comment-avatar">{getInitials(comment.commentedByName)}</div>
                <div className="wi-comment-meta">
                    <span className="wi-comment-author">{comment.commentedByName ?? `User #${comment.commentedBy}`}</span>
                    <span className="wi-comment-time">{formatDateTime(comment.createdAt)}</span>
                </div>
                {(canEdit || canDelete) && !comment._optimistic && (
                    <div className="wi-comment-actions">
                        {canEdit && (
                            <button
                                type="button"
                                className="wi-comment-action-btn"
                                title="Edit comment"
                                onClick={() => { setEditing(e => !e); setEditText(comment.commentText); }}
                            >
                                <EditIcon />
                            </button>
                        )}
                        {canDelete && (
                            <button
                                type="button"
                                className="wi-comment-action-btn wi-comment-action-btn--danger"
                                title="Delete comment"
                                onClick={() => onDelete(comment.commentID)}
                            >
                                <TrashIcon />
                            </button>
                        )}
                    </div>
                )}
            </div>
            {editing ? (
                <div className="wi-comment-edit-wrap">
                    <textarea
                        ref={textareaRef}
                        className="wi-comment-edit-input"
                        value={editText}
                        rows={3}
                        disabled={saving}
                        onChange={e => setEditText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') setEditing(false); }}
                    />
                    <div className="wi-comment-edit-actions">
                        <button type="button" className="wi-comment-edit-cancel" onClick={() => setEditing(false)} disabled={saving}>
                            <CancelIcon /> Discard
                        </button>
                        <button type="button" className="wi-comment-edit-save" onClick={handleSave} disabled={saving || !editText.trim()}>
                            {saving ? <><SpinnerIcon /> Saving…</> : <><SaveIcon /> Save</>}
                        </button>
                    </div>
                </div>
            ) : (
                <p className="wi-comment-text">{comment.commentText}</p>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────
// Picker Modal (generic for users/teams)
// ─────────────────────────────────────────────

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
    const [pickedId, setPickedId] = useState<number | null>(preselectedId);
    const debouncedSearch = useDebounced(search, 250);

    useEffect(() => {
        setPickedId(preselectedId);
    }, [preselectedId]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const filtered = useMemo(() => {
        if (!debouncedSearch) return items;
        const q = debouncedSearch.toLowerCase();
        return items.filter(i =>
            i.name.toLowerCase().includes(q) || i.meta.toLowerCase().includes(q)
        );
    }, [items, debouncedSearch]);

    const selected = items.find(i => i.id === pickedId);

    return (
        <div className="wi-picker-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
            <div className="wi-picker-modal" onClick={e => e.stopPropagation()}>
                <div className="wi-picker-header">
                    <h3>{title}</h3>
                    <button type="button" className="wi-picker-close" onClick={onClose} aria-label="Close">
                        <CloseIcon />
                    </button>
                </div>
                <div className="wi-picker-search">
                    <input
                        className="wi-picker-input"
                        placeholder="Search…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        autoFocus
                    />
                </div>
                <div className="wi-picker-list">
                    {loading ? (
                        <div className="wi-picker-loading">Loading…</div>
                    ) : filtered.length === 0 ? (
                        <div className="wi-picker-empty">No results.</div>
                    ) : (
                        filtered.map(item => (
                            <button
                                key={item.id}
                                type="button"
                                className={`wi-picker-item${pickedId === item.id ? ' wi-picker-item--selected' : ''}`}
                                onClick={() => setPickedId(item.id)}
                            >
                                <span className="wi-picker-item-name">{item.name}</span>
                                {item.meta && <span className="wi-picker-item-meta">{item.meta}</span>}
                            </button>
                        ))
                    )}
                </div>
                <div className="wi-picker-footer">
                    <button type="button" className="wi-picker-cancel" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="wi-picker-assign"
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

// ─────────────────────────────────────────────
// Main Modal
// ─────────────────────────────────────────────

export function WorkItemDetailModal({
    item,
    onClose,
    onSaved,
    canManage = false,
    canEdit = false,
    canChangeAssignee = false,
    currentUser = null,
    currentSprint = null,
}: {
    item: AgendaWorkItem;
    onClose: () => void;
    onSaved?: () => void;
    canManage?: boolean;
    canEdit?: boolean;
    canChangeAssignee?: boolean;
    currentUser?: { userID: number; roleName: string; teamID?: number | null } | null;
    currentSprint?: SprintSummary | null;
}) {
    // ── State ──────────────────────────────────
    const [currentSprintState, setCurrentSprintState] = useState<SprintSummary | null>(currentSprint);

    // Sync currentSprint prop to state (for when parent component refreshes sprint data)
    useEffect(() => {
        setCurrentSprintState(currentSprint);
    }, [currentSprint]);

    // Comments are allowed for:
    // - Work item assignee
    // - Sprint Manager (if the work item is in their sprint)
    // - Admin/Scrum Master
    const isSprintTeamMember = currentUser != null
        && currentSprintState?.teamID != null
        && currentUser.teamID != null
        && currentUser.teamID === currentSprintState.teamID;

    const canComment = currentUser != null && (
        currentUser.userID === item.assignedUserID ||
        currentUser.roleName.trim().toLowerCase() === 'administrator' ||
        currentUser.roleName.trim().toLowerCase() === 'scrum master' ||
        currentUser.roleName.trim().toLowerCase() === 'scrummaster' ||
        (currentSprintState != null && currentSprintState.managedBy !== null && currentUser.userID === currentSprintState.managedBy) ||
        isSprintTeamMember
    );
    const [details, setDetails] = useState<WorkItemDetails | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(true);
    const [detailsError, setDetailsError] = useState('');

    const [isEditing, setIsEditing] = useState(false);
    const [editFields, setEditFields] = useState<EditableFields>({
        title: item.title,
        description: '',
        priority: item.priority ?? 'Medium',
    });
    const [editDueDate, setEditDueDate] = useState('');
    const [editAssignee, setEditAssignee] = useState<number | null>(null);
    const [editAssigneeName, setEditAssigneeName] = useState('');
    const [editTeam, setEditTeam] = useState<number | null>(null);
    const [editTeamName, setEditTeamName] = useState('');
    const [showUserPicker, setShowUserPicker] = useState(false);
    const [showTeamPicker, setShowTeamPicker] = useState(false);
    const [pickerUsers, setPickerUsers] = useState<{ id: number; name: string; meta: string }[]>([]);
    const [pickerUsersLoading, setPickerUsersLoading] = useState(true);
    const [pickerTeams, setPickerTeams] = useState<{ id: number; name: string; meta: string }[]>([]);
    const [pickerTeamsLoading, setPickerTeamsLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [saveSuccess, setSaveSuccess] = useState(false);

    const [commentText, setCommentText] = useState('');
    const [commentLoading, setCommentLoading] = useState(false);
    const [commentError, setCommentError] = useState('');

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);

    const commentListRef = useRef<HTMLDivElement>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);

    const refreshDetails = useCallback(async () => {
        setLoadingDetails(true);
        try {
            const raw = await apiClient.get<WorkItemDetails>(`/api/workitems/${item.workItemID}/details`);
            const normalized: WorkItemDetails = {
                ...raw,
                comments: raw.comments ?? [],
            };
            setDetails(normalized);
            setEditFields({
                title: normalized.title ?? item.title,
                description: normalized.description ?? '',
                priority: normalized.priority ?? item.priority ?? 'Medium',
            });
            setEditDueDate(normalized.dueDate ?? '');
            setEditAssignee(normalized.assignedUserID ?? null);
            setEditAssigneeName(normalized.assignedUserName ?? '');
            setEditTeam(normalized.teamID ?? null);
            setEditTeamName(normalized.teamName ?? '');
        } finally {
            setLoadingDetails(false);
        }
    }, [item.workItemID, item.priority, item.title]);

    // ── Load picker data ──────────────
    useEffect(() => {
        if (!showUserPicker) return;
        let cancelled = false;
        setPickerUsersLoading(true);
        void lookupUsers({ search: '', teamId: currentSprintState?.teamID ?? undefined, limit: 200 })
            .then(users => {
                if (!cancelled) setPickerUsers([
                    { id: 0, name: '— No Assignee —', meta: '' },
                    ...users.map(u => ({
                        id: u.userID,
                        name: u.displayName || `User #${u.userID}`,
                        meta: u.emailAddress || '',
                    })),
                ]);
            })
            .catch(() => { if (!cancelled) setPickerUsers([]); })
            .finally(() => { if (!cancelled) setPickerUsersLoading(false); });
        return () => { cancelled = true; };
    }, [showUserPicker, currentSprintState?.teamID]);

    useEffect(() => {
        if (!showTeamPicker) return;
        let cancelled = false;
        setPickerTeamsLoading(true);
        void lookupTeams({ search: '', limit: 200 })
            .then(teams => {
                if (!cancelled) setPickerTeams(
                    teams.map(t => ({
                        id: t.teamID,
                        name: t.teamName.trim().toLowerCase() === 'default team'
                            ? '— Unassigned —'
                            : t.teamName,
                        meta: ''
                    }))
                );
            })
            .catch(() => { if (!cancelled) setPickerTeams([]); })
            .finally(() => { if (!cancelled) setPickerTeamsLoading(false); });
        return () => { cancelled = true; };
    }, [showTeamPicker]);

    // ── SignalR: listen for comment added ────
    useEffect(() => {
        const conn = getBoardHubConnection();
        let cancelled = false;
        const handler = (payload: Record<string, unknown>) => {
            const wid = Number(payload.workItemID ?? payload.WorkItemID ?? 0);
            if (wid !== item.workItemID) return;
            const rawComment = payload.comment as Record<string, unknown> | undefined;
            if (!rawComment) return;
            const newComment: CommentItem = {
                commentID: Number(rawComment.commentID ?? rawComment.CommentID ?? 0),
                workItemID: wid,
                commentedBy: Number(rawComment.commentedBy ?? rawComment.CommentedBy ?? 0),
                commentedByName: String(rawComment.commentedByName ?? rawComment.CommentedByName ?? ''),
                commentText: String(rawComment.commentText ?? rawComment.CommentText ?? ''),
                createdAt: String(rawComment.createdAt ?? rawComment.CreatedAt ?? ''),
                updatedAt: (rawComment.updatedAt ?? rawComment.UpdatedAt) as string | null | undefined,
                isDeleted: (rawComment.isDeleted ?? rawComment.IsDeleted) as boolean | null | undefined,
            };
            setDetails(prev => {
                if (!prev) return prev;
                const existing = prev.comments?.some(c => c.commentID === newComment.commentID);
                if (existing) return prev;
                return { ...prev, comments: [...(prev.comments ?? []), newComment] };
            });
            setTimeout(() => {
                if (commentListRef.current) {
                    commentListRef.current.scrollTop = commentListRef.current.scrollHeight;
                }
            }, 50);
        };
        const start = async () => {
            try {
                await ensureBoardHubStarted();
            } catch { /* hub unavailable */ }
            if (cancelled) return;
            conn.on('WorkItemCommentAdded', handler);
        };
        void start();
        return () => {
            cancelled = true;
            conn.off('WorkItemCommentAdded', handler);
        };
    }, [item.workItemID]);

    // ── SignalR: listen for comment edited ──
    useEffect(() => {
        const conn = getBoardHubConnection();
        let cancelled = false;
        const handler = (payload: Record<string, unknown>) => {
            const wid = Number(payload.workItemID ?? payload.WorkItemID ?? 0);
            if (wid !== item.workItemID) return;
            const cid = Number(payload.commentID ?? payload.CommentID ?? 0);
            const text = String(payload.commentText ?? payload.CommentText ?? '');
            setDetails(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    comments: (prev.comments ?? []).map(c =>
                        c.commentID === cid ? { ...c, commentText: text } : c
                    ),
                };
            });
        };
        const start = async () => {
            try {
                await ensureBoardHubStarted();
            } catch { /* hub unavailable */ }
            if (cancelled) return;
            conn.on('WorkItemCommentEdited', handler);
        };
        void start();
        return () => {
            cancelled = true;
            conn.off('WorkItemCommentEdited', handler);
        };
    }, [item.workItemID]);

    // ── SignalR: listen for comment deleted ──
    useEffect(() => {
        const conn = getBoardHubConnection();
        let cancelled = false;
        const handler = (payload: Record<string, unknown>) => {
            const wid = Number(payload.workItemID ?? payload.WorkItemID ?? 0);
            if (wid !== item.workItemID) return;
            const cid = Number(payload.commentID ?? payload.CommentID ?? 0);
            setDetails(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    comments: (prev.comments ?? []).map(c =>
                        c.commentID === cid ? { ...c, isDeleted: true } : c
                    ),
                };
            });
        };
        const start = async () => {
            try {
                await ensureBoardHubStarted();
            } catch { /* hub unavailable */ }
            if (cancelled) return;
            conn.on('WorkItemCommentDeleted', handler);
        };
        void start();
        return () => {
            cancelled = true;
            conn.off('WorkItemCommentDeleted', handler);
        };
    }, [item.workItemID]);

    // ── SignalR: listen for detail updates ──
    useEffect(() => {
        const conn = getBoardHubConnection();
        const handler = (payload: Record<string, unknown>) => {
            const wid = Number(payload.workItemID ?? payload.WorkItemID ?? 0);
            if (wid !== item.workItemID) return;
            void refreshDetails().catch(() => { /* silently fail — details still visible */ });
        };
        conn.on('WorkItemUpdated', handler);
        return () => { conn.off('WorkItemUpdated', handler); };
    }, [item.workItemID, refreshDetails]);

    // ── SignalR: listen for status changes ──
    useEffect(() => {
        const conn = getBoardHubConnection();
        const handler = (payload: Record<string, unknown>) => {
            const normalized = normalizeWorkItemFromEventPayload(payload);
            const wid = normalized?.workItemID ?? Number(payload.workItemID ?? payload.WorkItemID ?? 0);
            const parentId = normalized?.parentWorkItemID ?? Number(payload.parentWorkItemID ?? payload.ParentWorkItemID ?? 0);
            const isSelf = wid === item.workItemID;
            const isDirectChild = parentId === item.workItemID;
            const isKnownDescendant =
                (details?.stories ?? []).some(s => s.workItemID === wid) ||
                (details?.tasks ?? []).some(t => t.workItemID === wid);
            if (!isSelf && !isDirectChild && !isKnownDescendant) return;
            const newStatus = normalized?.status
                ?? (typeof payload.newStatus === 'string' ? payload.newStatus : undefined)
                ?? (typeof payload.NewStatus === 'string' ? payload.NewStatus : undefined);

            if (newStatus) {
                setDetails(prev => {
                    if (!prev) return prev;
                    return { ...prev, status: newStatus };
                });
            }
        };

        const start = async () => {
            try {
                await ensureBoardHubStarted();
            } catch { /* hub unavailable — details still visible */ }
            conn.on('WorkItemStatusChanged', handler);
        };
        void start();
        return () => { conn.off('WorkItemStatusChanged', handler); };
    }, [item.workItemID]);

    // ── SignalR: listen for work item moves (drag-and-drop on board) ──
    useEffect(() => {
        const conn = getBoardHubConnection();
        const handler = (payload: Record<string, unknown>) => {
            const normalized = normalizeWorkItemFromEventPayload(payload);
            const wid = normalized?.workItemID ?? Number(payload.workItemID ?? payload.WorkItemID ?? 0);
            const parentId = normalized?.parentWorkItemID ?? Number(payload.parentWorkItemID ?? payload.ParentWorkItemID ?? 0);

            const isSelf = wid === item.workItemID;
            const isDirectChild = parentId === item.workItemID;
            const isKnownDescendant =
                (details?.stories ?? []).some((s: AgendaWorkItem) => s.workItemID === wid) ||
                (details?.tasks ?? []).some((t: AgendaWorkItem) => t.workItemID === wid);
            if (!isSelf && !isDirectChild && !isKnownDescendant) return;
            const status = normalized?.status;
            const assignedUserName = normalized?.assignedUserName;
            const priority = normalized?.priority;
            const typeName = normalized?.workItemType;

            setDetails(prev => {
                if (!prev) return prev;
                const next: WorkItemDetails = { ...prev };
                if (status) next.status = status;
                if (assignedUserName !== undefined) next.assignedUserName = assignedUserName;
                if (priority !== undefined) next.priority = priority;
                if (typeName) next.typeName = typeName;
                return next;
            });
            // Keep Epic/Story child-derived status sections up to date.
            if (!isSelf) {
                void refreshDetails().catch(() => { /* best effort */ });
            }
        };

        const start = async () => {
            try {
                await ensureBoardHubStarted();
            } catch { /* hub unavailable — details still visible */ }
            conn.on('WorkItemMoved', handler);
        };
        void start();
        return () => { conn.off('WorkItemMoved', handler); };
    }, [details?.stories, details?.tasks, item.workItemID, refreshDetails]);

    // ── SignalR: listen for sprint lifecycle events ──
    useEffect(() => {
        const conn = getBoardHubConnection();
        const sprintId = currentSprintState?.sprintID ?? details?.sprintID ?? null;
        if (!sprintId) return;

        const handler = (payload: Record<string, unknown>) => {
            const sid = Number(payload.sprintID ?? payload.SprintID ?? 0);
            if (sid !== sprintId) return;

            // Update sprint state based on the event
            setCurrentSprintState(prev => {
                if (!prev) return prev;
                return { ...prev, status: payload.status as string };
            });
        };

        const start = async () => {
            try {
                await ensureBoardHubStarted();
            } catch { /* hub unavailable */ }
            conn.on('SprintStopped', handler);
            conn.on('SprintCompleted', handler);
            conn.on('SprintUpdated', handler);
        };
        void start();
        return () => {
            conn.off('SprintStopped', handler);
            conn.off('SprintCompleted', handler);
            conn.off('SprintUpdated', handler);
        };
    }, [currentSprintState?.sprintID, details?.sprintID]);

    // ── Load details ───────────────────────────
    useEffect(() => {
        let cancelled = false;
        setLoadingDetails(true);
        setDetailsError('');
        apiClient.get<WorkItemDetails>(`/api/workitems/${item.workItemID}/details`)
            .then(raw => {
                if (!cancelled) {
                    const normalized: WorkItemDetails = {
                        ...raw,
                        comments: raw.comments ?? [],
                    };
                    setDetails(normalized);
                    setEditFields({
                        title: normalized.title ?? item.title,
                        description: normalized.description ?? '',
                        priority: normalized.priority ?? item.priority ?? 'Medium',
                    });
                    setEditDueDate(normalized.dueDate ?? '');
                    setEditAssignee(normalized.assignedUserID ?? null);
                    const aname = normalized.assignedUserName ?? '';
                    setEditAssigneeName(aname);
                    setEditTeam(normalized.teamID ?? null);
                    const tname = normalized.teamName ?? '';
                    setEditTeamName(tname);
                }
            })
            .catch(err => {
                if (!cancelled) setDetailsError(err?.message ?? 'Failed to load work item details.');
            })
            .finally(() => {
                if (!cancelled) setLoadingDetails(false);
            });
        return () => { cancelled = true; };
    }, [item.workItemID]);

    // ── Focus title when edit mode activates ──
    useEffect(() => {
        if (isEditing) titleInputRef.current?.focus();
    }, [isEditing]);

    // ── Keyboard ───────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isEditing) { setIsEditing(false); setSaveError(''); }
                else onClose();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isEditing, onClose]);

    // ── Sprint active check ─────────────────────────
    // When sprint is active, only due date editing is allowed
    // All other fields are locked (existing permissions still apply when sprint is not active)
    const isSprintActive = currentSprintState?.status === 'Active';
    const isFieldLocked = isSprintActive; // true when sprint is active, fields should be locked

    // ── Save edits ─────────────────────────────
    const handleSave = useCallback(async () => {
        if (!editFields.title.trim()) { setSaveError('Title is required.'); return; }
        if (!editFields.description.trim()) { setSaveError('Description is required.'); return; }
        
        const dueDateValue = toDateOnly(editDueDate);
        if (dueDateValue) {
            if (dueDateValue < getTodayLocal()) {
                setSaveError('Due date cannot be in the past.');
                return;
            }

            const parentWorkItemId = details?.parentWorkItemID ?? item.parentWorkItemID ?? null;
            if (parentWorkItemId) {
                try {
                    const parent = await apiClient.get<{ dueDate?: string | null; title?: string | null }>(
                        `/api/workitems/${parentWorkItemId}`
                    );
                    const parentDueDate = toDateOnly(parent?.dueDate ?? null);
                    if (parentDueDate && dueDateValue > parentDueDate) {
                        const parentLabel = parent?.title?.trim() || `#${parentWorkItemId}`;
                        setSaveError(`Due date cannot be later than parent due date (${parentDueDate}) for ${parentLabel}.`);
                        return;
                    }
                } catch {
                    // Ignore parent lookup failures; backend validation remains authoritative.
                }
            }

            const workItemSprintId = details?.sprintID ?? item.sprintID ?? currentSprintState?.sprintID ?? null;
            const sprintStartDate = toDateOnly(currentSprintState?.startDate ?? null);
            const sprintEndDate = toDateOnly(currentSprintState?.endDate ?? null);
            if (workItemSprintId) {
                if (sprintStartDate && dueDateValue < sprintStartDate) {
                    setSaveError(`Due date must be within sprint duration (${sprintStartDate} to ${sprintEndDate ?? 'N/A'}).`);
                    return;
                }
                if (sprintEndDate && dueDateValue > sprintEndDate) {
                    setSaveError(`Due date must be within sprint duration (${sprintStartDate ?? 'N/A'} to ${sprintEndDate}).`);
                    return;
                }
            }
        }
        
        setSaving(true);
        setSaveError('');
        setSaveSuccess(false);
        try {
            const payload: Record<string, unknown> = {};
            
            // When sprint is active, only due date can be modified
            if (!isFieldLocked) {
                payload.title = editFields.title.trim();
                payload.description = editFields.description.trim();
                payload.priority = editFields.priority;
            }
            
            if (editDueDate) payload.dueDate = editDueDate;
            else payload.dueDate = null;
            
            if (canChangeAssignee) {
                if (editAssignee) {
                    payload.assignedUserID = editAssignee;
                } else if (editAssignee === null && item.assignedUserID !== null) {
                    // User explicitly cleared the assignee
                    payload.clearAssignee = true;
                }
            }
            if (canManage && !isFieldLocked) {
                if (editTeam) payload.teamID = editTeam;
                else payload.teamID = null;
            }
            await apiClient.patch(`/api/workitems/${item.workItemID}`, payload);
            setIsEditing(false);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
            // Notify parent component to refresh
            onSaved?.();
        } catch (err) {
            const e = err as { message?: string };
            setSaveError(e?.message ?? 'Failed to save changes.');
        } finally {
            setSaving(false);
        }
    }, [item.workItemID, item.parentWorkItemID, item.sprintID, editFields, editDueDate, editAssignee, editTeam, canManage, canChangeAssignee, isFieldLocked, currentSprintState, details]);

    // ── Add comment ────────────────────────────
    const handleAddComment = useCallback(async () => {
        if (!commentText.trim()) return;
        const text = commentText.trim();
        setCommentLoading(true);
        setCommentError('');
        try {
            await apiClient.post<CommentItem>(
                `/api/workitems/${item.workItemID}/comments`,
                { commentText: text }
            );
            setCommentText('');
        } catch (err) {
            const e = err as { message?: string };
            setCommentError(e?.message ?? 'Failed to add comment.');
        } finally {
            setCommentLoading(false);
        }
    }, [item.workItemID, commentText]);

    // ── Delete comment ─────────────────────────
    const handleDeleteComment = useCallback(async (commentID: number) => {
        try {
            await apiClient.delete(`/api/workitems/${item.workItemID}/comments/${commentID}`);
        } catch {
            // silently fail — SignalR will update the list
        }
    }, [item.workItemID]);

    // ── Edit comment ───────────────────────────
    const handleEditComment = useCallback(async (commentID: number, newText: string) => {
        try {
            await apiClient.patch(`/api/workitems/${item.workItemID}/comments/${commentID}`, { commentText: newText });
        } catch {
            // silently fail — SignalR will update the list
        }
    }, [item.workItemID]);

    // ── Delete work item ───────────────────────
    const handleDeleteWorkItem = useCallback(async () => {
        if (deleteConfirmText.trim().toLowerCase() !== 'delete') return;
        setDeleting(true);
        try {
            await apiClient.delete(`/api/workitems/${item.workItemID}`);
            onClose();
        } catch (err) {
            setSaveError(err instanceof ApiError ? err.message : 'Failed to delete work item.');
            setDeleting(false);
            setShowDeleteConfirm(false);
            setDeleteConfirmText('');
        }
    }, [item.workItemID, deleteConfirmText, onClose]);

    // ── Derived display values (merge details with initial item for fallback) ──
    const displayed: WorkItemDetails = details
        ? {
            ...details,
            // Fallback to initial item's sprintID if details doesn't include it
            sprintID: details.sprintID ?? item.sprintID ?? null,
            sprintName: details.sprintName ?? null,
        }
        : item as WorkItemDetails;
    const priorityCls = priorityAccentClass(isEditing ? editFields.priority : (displayed.priority ?? null));
    const typeLower = (displayed.typeName ?? 'task').toLowerCase();
    const comments = displayed.comments ?? [];
    const commentCount = comments.filter(c => !c.isDeleted).length;

    // ── Sprint active check ─────────────────────────
    // When sprint is active, only due date editing is allowed
    // All other fields are locked (existing permissions still apply when sprint is not active)
    // Note: isSprintActive and isFieldLocked are already defined above (line 647-648)

    // ── Priority color ─────────────────────────
    const priorityColor = (p: string | null | undefined) => {
        switch ((p ?? '').toLowerCase()) {
            case 'high': return 'var(--priority-high-border)';
            case 'medium': return 'var(--priority-medium-border)';
            case 'low': return 'var(--priority-low-border)';
            default: return 'var(--form-text-muted)';
        }
    };

    // ─────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────
    return (
        <div
            className="wi-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Work Item Details"
        >
            <div className="wi-modal">

                {/* ── Sidebar (left) ────────────────────── */}
                <aside className="wi-modal-sidebar">
                    {/* Label */}
                    <div className="wi-modal-label">
                        Work Item Detail View
                    </div>

                    {/* Eyebrow */}
                    <div className="wi-sidebar-eyebrow">
                        <span className={`wi-type-dot wi-type-dot--${typeLower}`} />
                        <span className="wi-sidebar-type-label">
                            {displayed.typeName ?? 'Task'}
                        </span>
                        <span className="wi-sidebar-id">#{displayed.workItemID}</span>
                    </div>

                    {/* Title */}
                    <div className="wi-sidebar-title-wrap">
                        {isEditing ? (
                            <input
                                ref={titleInputRef}
                                className="wi-sidebar-title-input"
                                value={editFields.title}
                                maxLength={200}
                                disabled={saving || isFieldLocked}
                                onChange={e => setEditFields(f => ({ ...f, title: e.target.value }))}
                                aria-label="Work item title"
                            />
                        ) : (
                            <h2 className="wi-sidebar-title">{displayed.title}</h2>
                        )}
                    </div>

                    {/* Meta grid */}
                    <div className="wi-sidebar-meta">
                        {/* Priority (editable) + Status (read-only) on same line */}
                        <div className="wi-sidebar-row">
                            <div className="wi-sidebar-field">
                                <span className="wi-sidebar-field-label">Priority</span>
                                {isEditing && canManage && !isFieldLocked ? (
                                    <select
                                        className="wi-sidebar-select"
                                        value={editFields.priority}
                                        disabled={saving}
                                        onChange={e => setEditFields(f => ({ ...f, priority: e.target.value }))}
                                    >
                                        {['Low', 'Medium', 'High'].map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                ) : (
                                    <span
                                        className={`wi-priority-badge ${priorityCls}`}
                                        style={{ color: priorityColor(displayed.priority) }}
                                    >
                                        {displayed.priority ?? '—'}
                                    </span>
                                )}
                            </div>
                            <div className="wi-sidebar-field">
                                <span className="wi-sidebar-field-label">Status</span>
                                <span className="wi-status-badge-sm">{displayed.status}</span>
                            </div>
                        </div>

                        {/* Due Date */}
                        <div className="wi-sidebar-field wi-sidebar-field--full">
                            <span className="wi-sidebar-field-label">Due Date</span>
                            {isEditing ? (
                                <input
                                    type="date"
                                    className="wi-sidebar-input"
                                    value={editDueDate}
                                    disabled={saving}
                                    onChange={e => setEditDueDate(e.target.value)}
                                    title={isSprintActive && currentSprintState?.endDate ? `Must be on or before sprint end: ${currentSprintState.endDate}` : undefined}
                                />
                            ) : (
                                <span className="wi-sidebar-field-value">{formatDate(displayed.dueDate)}</span>
                            )}
                        </div>

                        {/* Parent */}
                        <div className="wi-sidebar-field wi-sidebar-field--full">
                            <span className="wi-sidebar-field-label">Parent</span>
                            <span className="wi-sidebar-field-value">
                                {(displayed as WorkItemDetails).parentTitle
                                    ? `${(displayed as WorkItemDetails).parentTitle} (#${displayed.parentWorkItemID})`
                                    : displayed.parentWorkItemID
                                        ? `#${displayed.parentWorkItemID}`
                                        : '—'}
                            </span>
                        </div>

                        {/* Sprint */}
                        <div className="wi-sidebar-field wi-sidebar-field--full">
                            <span className="wi-sidebar-field-label">Sprint</span>
                            <span className="wi-sidebar-field-value">
                                {displayed.sprintName
                                    ? displayed.sprintName
                                    : displayed.sprintID
                                        ? `Sprint #${displayed.sprintID}`
                                        : 'Unassigned'
                                }
                            </span>
                        </div>

                        {/* Assignee */}
                        <div className="wi-sidebar-field wi-sidebar-field--full">
                            <span className="wi-sidebar-field-label">Assignee</span>
                            {isEditing && canChangeAssignee ? (
                                <div className="wi-assignee-stack">
                                    <span className="wi-sidebar-field-value">
                                        {editAssigneeName || 'Unassigned'}
                                    </span>
                                    <button
                                        type="button"
                                        className="wi-assignee-icon-btn"
                                        onClick={() => setShowUserPicker(true)}
                                        title={editAssignee ? 'Change assignee' : 'Assign assignee'}
                                        aria-label={editAssignee ? 'Change assignee' : 'Assign assignee'}
                                    >
                                        {editAssignee ? <EditIcon /> : <PlusIcon />}
                                    </button>
                                </div>
                            ) : (
                                <span className="wi-sidebar-field-value">
                                    {(displayed as WorkItemDetails).assignedUserName
                                        ?? (displayed.assignedUserID ? `User #${displayed.assignedUserID}` : 'Unassigned')}
                                </span>
                            )}
                        </div>

                        {/* Team */}
                        <div className="wi-sidebar-field wi-sidebar-field--full">
                            <span className="wi-sidebar-field-label">Team</span>
                            {isEditing && canManage && !isFieldLocked ? (
                                <div className="wi-assignee-stack">
                                    <span className="wi-sidebar-field-value">
                                        {editTeamName || 'Unassigned'}
                                    </span>
                                    <button
                                        type="button"
                                        className="wi-assignee-icon-btn"
                                        onClick={() => setShowTeamPicker(true)}
                                        title={editTeam ? 'Change team' : 'Assign team'}
                                        aria-label={editTeam ? 'Change team' : 'Assign team'}
                                    >
                                        {editTeam ? <EditIcon /> : <PlusIcon />}
                                    </button>
                                </div>
                            ) : (
                                <span className="wi-sidebar-field-value">
                                    {(displayed as WorkItemDetails).teamName
                                        ?? (displayed.teamID ? `Team #${displayed.teamID}` : 'Unassigned')}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Spacer */}
                    <div style={{ flex: 1 }} />

                    {/* Sidebar actions */}
                    {canEdit && (
                        <div className="wi-sidebar-actions wi-sidebar-actions--row">
                            <button
                                type="button"
                                className="wi-action-btn wi-action-btn--save"
                                onClick={handleSave}
                                disabled={!isEditing || saving}
                                aria-busy={saving}
                            >
                                {saving ? <><SpinnerIcon /> Saving…</> : <><SaveIcon /> Save</>}
                            </button>
                            <button
                                type="button"
                                className="wi-action-btn wi-action-btn--edit"
                                onClick={() => setIsEditing(true)}
                                disabled={isEditing || saving}
                            >
                                <EditIcon /> Edit
                            </button>
                        </div>
                    )}

                    {/* Delete button (Admin/SM only) */}
                    {canManage && (
                        <div className="wi-sidebar-actions wi-sidebar-actions--row" style={{ marginTop: 6 }}>
                            <button
                                type="button"
                                className="wi-action-btn wi-action-btn--delete"
                                onClick={() => setShowDeleteConfirm(true)}
                                disabled={deleting}
                            >
                                <TrashIcon /> Delete
                            </button>
                        </div>
                    )}
                </aside>

                {/* ── Main content (right) ──────────────── */}
                <div className="wi-modal-main">
                    {/* Header bar */}
                    <div className="wi-modal-topbar">
                        <div className="wi-topbar-left">
                            {saveSuccess && (
                                <span className="wi-save-toast">
                                    <SaveIcon /> Changes saved
                                </span>
                            )}
                        </div>
                        <button
                            type="button"
                            className="wi-modal-close-btn"
                            onClick={onClose}
                            aria-label="Close"
                        >
                            <CloseIcon />
                        </button>
                    </div>

                    {/* Error banners */}
                    {saveError && (
                        <div className="wi-error-banner" role="alert">{saveError}</div>
                    )}

                    {loadingDetails ? (
                        <div className="wi-loading-state">
                            <SpinnerIcon />
                            <span>Loading details…</span>
                        </div>
                    ) : detailsError ? (
                        <div className="wi-error-banner wi-error-banner--page" role="alert">{detailsError}</div>
                    ) : (
                        <div className="wi-modal-scroll">

                            {/* ── Description section ─────────────────────── */}
                            <section className="wi-section">
                                <SectionHeading icon={
                                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                                        <rect x="1" y="1" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2" />
                                        <path d="M3.5 4.5h6M3.5 6.5h5M3.5 8.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                                    </svg>
                                }>
                                    Description
                                </SectionHeading>

                                {isEditing ? (
                                    <textarea
                                        className="wi-description-editor"
                                        value={editFields.description}
                                        rows={6}
                                        disabled={saving || isFieldLocked}
                                        placeholder="Add a description…"
                                        maxLength={2000}
                                        onChange={e => setEditFields(f => ({ ...f, description: e.target.value }))}
                                        aria-label="Description"
                                    />
                                ) : (
                                    <div className="wi-description-view">
                                        {(displayed as WorkItemDetails).description
                                            ? <p className="wi-description-text">{(displayed as WorkItemDetails).description}</p>
                                            : <p className="wi-description-empty">No description provided.</p>
                                        }
                                    </div>
                                )}
                            </section>

                            {/* ── Comments section ─────────────────────── */}
                            <section className="wi-section wi-section--comments">
                                <div className="wi-comments-header">
                                    <SectionHeading icon={<CommentIcon />}>
                                        Comments
                                        {commentCount > 0 && (
                                            <span className="wi-comment-count">{commentCount}</span>
                                        )}
                                    </SectionHeading>
                                </div>

                                {/* Comment list */}
                                <div className="wi-comment-list" ref={commentListRef}>
                                    {commentError && (
                                        <div className="wi-error-banner" role="alert">{commentError}</div>
                                    )}
                                    {comments.filter(c => !c.isDeleted).length === 0 ? (
                                        <div className="wi-comment-empty-state">
                                            <CommentIcon />
                                            <span>No comments yet. Be the first to add one.</span>
                                        </div>
                                    ) : (
                                        comments
                                            .filter(c => !c.isDeleted)
                                            .map(comment => (
                                                <CommentCard
                                                    key={comment.commentID}
                                                    comment={comment}
                                                    canEdit={comment.commentedBy === currentUser?.userID}
                                                    canDelete={comment.commentedBy === currentUser?.userID || canManage}
                                                    onDelete={handleDeleteComment}
                                                    onEdit={handleEditComment}
                                                />
                                            ))
                                    )}
                                </div>

                                {/* Comment composer */}
                                {canComment && (
                                    <div className="wi-comment-composer">
                                        <div className="wi-composer-avatar">
                                            <PinIcon />
                                        </div>
                                        <div className="wi-composer-input-wrap">
                                            <textarea
                                                className="wi-composer-input"
                                                placeholder="Write a comment…"
                                                value={commentText}
                                                rows={1}
                                                disabled={commentLoading}
                                                onChange={e => setCommentText(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                                        e.preventDefault();
                                                        void handleAddComment();
                                                    }
                                                }}
                                                aria-label="Add a comment"
                                            />
                                            <div className="wi-composer-footer">
                                                <span className="wi-composer-hint">Ctrl+Enter to submit</span>
                                                <button
                                                    type="button"
                                                    className="wi-composer-submit"
                                                    onClick={() => void handleAddComment()}
                                                    disabled={commentLoading || !commentText.trim()}
                                                    aria-busy={commentLoading}
                                                >
                                                    {commentLoading
                                                        ? <><SpinnerIcon /> Posting…</>
                                                        : <><CommentIcon /> Add Comment</>
                                                    }
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </section>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Delete Confirmation Modal ──────────── */}
            {showDeleteConfirm && (
                <div className="wi-delete-overlay" role="dialog" aria-modal="true" aria-label="Delete Work Item">
                    <div className="wi-delete-dialog">
                        <div className="wi-delete-icon">
                            <TrashIcon />
                        </div>
                        <h3 className="wi-delete-title">Delete Work Item?</h3>
                        <p className="wi-delete-message">
                            {details?.typeName?.toLowerCase() === 'epic' || details?.typeName?.toLowerCase() === 'story'
                                ? 'This will also delete all child work items. This action cannot be undone.'
                                : 'This action cannot be undone.'}
                        </p>
                        <div className="wi-delete-confirm">
                            <label className="wi-delete-label" htmlFor="wi-delete-confirm">
                                Type <strong>Delete</strong> to confirm:
                            </label>
                            <input
                                id="wi-delete-confirm"
                                className="wi-delete-input"
                                value={deleteConfirmText}
                                onChange={e => setDeleteConfirmText(e.target.value)}
                                placeholder="Delete"
                                autoFocus
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && deleteConfirmText.trim().toLowerCase() === 'delete') {
                                        void handleDeleteWorkItem();
                                    }
                                }}
                            />
                        </div>
                        <div className="wi-delete-actions">
                            <button
                                type="button"
                                className="wi-delete-btn wi-delete-btn--cancel"
                                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                                disabled={deleting}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="wi-delete-btn wi-delete-btn--confirm"
                                onClick={() => void handleDeleteWorkItem()}
                                disabled={deleteConfirmText.trim().toLowerCase() !== 'delete' || deleting}
                            >
                                {deleting ? 'Deleting…' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── User Picker Modal ───────────────────── */}
            {showUserPicker && (
                <PickerModal
                    title="Assign User"
                    onClose={() => setShowUserPicker(false)}
                    onPick={(id, name) => {
                        setEditAssignee(id === 0 ? null : id);
                        setEditAssigneeName(id === 0 ? '' : name);
                        setShowUserPicker(false);
                    }}
                    items={pickerUsers}
                    loading={pickerUsersLoading}
                    preselectedId={editAssignee}
                />
            )}

            {/* ── Team Picker Modal ───────────────────── */}
            {showTeamPicker && (
                <PickerModal
                    title="Assign Team"
                    onClose={() => setShowTeamPicker(false)}
                    onPick={(id, name) => {
                        setEditTeam(id);
                        setEditTeamName(name === '— Unassigned —' ? '' : name);
                        setShowTeamPicker(false);
                    }}
                    items={pickerTeams}
                    loading={pickerTeamsLoading}
                    preselectedId={editTeam}
                />
            )}
        </div>
    );
}