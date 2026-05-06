/**
 * BacklogsV2.tsx
 * ─────────────────────────────────────────────
 * Redesigned Planning Workspace page.
 * All logic, API calls, permissions, and modals
 * are preserved from BacklogsPage.tsx. Only the
 * layout, CSS, and presentation layer is new.
 */

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';
import { StatusBanner } from '../components/auth/CountdownBanner';
import { Pagination } from '../components/common/Pagination';
import { ApiError } from '../services/apiClient';
import { getCurrentUser } from '../api/authApi';
import {
    getEpicTiles,
    getAgendasFiltered,
    getSprintWorkItems,
    getTasksByParentId,
    assignToSprint,
    removeFromSprint,
    updateWorkItem,
} from '../api/workItemsApi';
import {
    completeSprint,
    deleteSprint,
    listSprints,
    patchSprint,
    startSprint,
    stopSprint,
} from '../api/sprintsApi';
import { formatDate } from '../utils/dateFormatter';
import { lookupUsers, type UserLookup } from '../api/lookupsApi';
import type { AgendaWorkItem, EpicTile, SprintSummary } from '../types/planning';
import type { UserProfile } from '../types/auth';
import {
    AssigneePickerModal,
    CreateEpicModal,
    CreateSprintModal,
    CreateWorkItemModal,
    DeleteSprintConfirmModal,
    ManageSprintModal,
    ViewEpicModal,
    WorkItemDetailModal,
    STORY_TYPE,
    TASK_TYPE,
    normTypeName,
    formatDateRange,
    canManageSprint,
    canStartStopSprint,
    canDeleteSprint,
    sprintManagerLabel,
    TooltipIcon,
    useDebounced,
    type AddItemTarget,
} from './backlogs';
import { getBoardHubConnection, ensureBoardHubStarted } from '../services/boardHub';
import { getNotificationHubConnection, startNotificationHub } from '../services/notificationHub';
import '../styles/admin.css';
import '../styles/backlogs.css';
import '../styles/backlogs-story-pills.css';
import '../styles/work-item-modal.css';
import '../styles/backlogs-v2.css';

// ─────────────────────────────────────────────
// Helpers (copied from BacklogsPage)
// ─────────────────────────────────────────────

function sprintIdFromBoardPayload(payload: unknown): number | undefined {
    if (payload == null || typeof payload !== 'object') return undefined;
    const o = payload as Record<string, unknown>;
    for (const c of [o.sprintID, o.SprintID, o.oldSprintID, o.OldSprintID]) {
        if (typeof c === 'number' && c > 0) return c;
    }
    return undefined;
}

function isPlanningNotificationPayload(dto: unknown): boolean {
    if (!dto || typeof dto !== 'object') return false;
    const o = dto as Record<string, unknown>;
    const sid = o.relatedSprintID ?? o.RelatedSprintID;
    const wid = o.relatedWorkItemID ?? o.RelatedWorkItemID;
    if (typeof sid === 'number' && sid > 0) return true;
    if (typeof wid === 'number' && wid > 0) return true;
    const type = String(o.notificationType ?? o.NotificationType ?? '').toLowerCase();
    return type.includes('sprint') || type.includes('workitem') || type.includes('assign') || type.includes('backlog') || type.includes('comment');
}

function relatedSprintIdFromNotification(dto: unknown): number | undefined {
    if (!dto || typeof dto !== 'object') return undefined;
    const o = dto as Record<string, unknown>;
    const sid = o.relatedSprintID ?? o.RelatedSprintID;
    return typeof sid === 'number' && sid > 0 ? sid : undefined;
}

type StatusState = { kind: 'none' } | { kind: 'error'; message: string } | { kind: 'success'; message: string };

// Assignee color from team name
function getTeamAccentColor(teamName: string | null): string {
    if (!teamName || teamName.trim().toLowerCase() === 'default team') return '#6B7280';
    const n = teamName.toLowerCase();
    const hint = (re: RegExp, color: string): string | null => (re.test(n) ? color : null);
    return (
        hint(/\b(purple|violet|grape|lavender|plum)\b/, '#7C3AED') ??
        hint(/\b(indigo)\b/, '#4F46E5') ??
        hint(/\b(blue|azure|navy|cobalt|sapphire)\b/, '#2563EB') ??
        hint(/\b(cyan|teal|turquoise|aqua)\b/, '#0D9488') ??
        hint(/\b(green|emerald|forest|jade|mint|sage|olive)\b/, '#059669') ??
        hint(/\b(lime)\b/, '#65A30D') ??
        hint(/\b(yellow|lemon|canary|sun)\b/, '#CA8A04') ??
        hint(/\b(orange|tangerine|coral|peach|apricot)\b/, '#EA580C') ??
        hint(/\b(red|crimson|ruby|cherry|scarlet|brick)\b/, '#DC2626') ??
        hint(/\b(pink|rose|magenta|fuchsia|blush)\b/, '#DB2777') ??
        hint(/\b(brown|coffee|mocha|tan|bronze|cocoa)\b/, '#92400E') ??
        hint(/\b(gray|grey|silver|slate|stone|ash)\b/, '#64748B') ??
        hint(/\b(black|onyx|ebony)\b/, '#475569') ??
        hint(/\b(white|pearl|ivory)\b/, '#94A3B8') ??
        hint(/\b(gold|amber)\b/, 'var(--accent-gold)') ??
        (() => {
            const palette = ['var(--accent-gold)', '#7C3AED', '#2563EB', '#059669', '#DB2777', '#EA580C', '#0D9488', '#CA8A04', '#4F46E5', '#DC2626'];
            let h = 0;
            for (let i = 0; i < n.length; i++) h = n.charCodeAt(i) + ((h << 5) - h);
            return palette[Math.abs(h) % palette.length];
        })()
    );
}

function getInitials(name?: string | null): string {
    if (!name) return '?';
    return name.split(' ').map(n => n[0] ?? '').join('').slice(0, 2).toUpperCase();
}

// function priorityDotStyle(priority: string | null | undefined): string {
//     switch ((priority ?? '').toLowerCase()) {
//         case 'critical': return '#dc2626';
//         case 'high': return '#ea580c';
//         case 'medium': return '#ca8a04';
//         case 'low': return '#16a34a';
//         default: return 'var(--page-sub-color)';
//     }
// }

function priorityChipClass(priority: string | null | undefined): string {
    switch ((priority ?? '').toLowerCase()) {
        case 'critical': return 'bv2-wi-priority-chip--critical';
        case 'high': return 'bv2-wi-priority-chip--high';
        case 'medium': return 'bv2-wi-priority-chip--medium';
        case 'low': return 'bv2-wi-priority-chip--low';
        default: return 'bv2-wi-priority-chip--default';
    }
}

function priorityBorderClass(priority: string | null | undefined): string {
    switch ((priority ?? '').toLowerCase()) {
        case 'critical': return 'bv2-wi-row--critical';
        case 'high': return 'bv2-wi-row--high';
        case 'medium': return 'bv2-wi-row--medium';
        case 'low': return 'bv2-wi-row--low';
        default: return '';
    }
}

function sprintBadgeClass(status: string): string {
    switch (status.toLowerCase()) {
        case 'active': return 'bv2-sp-badge--active';
        case 'planned': return 'bv2-sp-badge--planned';
        case 'completed': return 'bv2-sp-badge--completed';
        default: return 'bv2-sp-badge--planned';
    }
}

// ─────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────

const SearchIcon = ({ size = 13 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
);

const ChevronRightIcon = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const ChevronDownIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const FilterIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
    </svg>
);

const SortIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 11l5-5 5 5M7 13l5 5 5-5" />
    </svg>
);

const PlusIcon = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
        <path d="M6.5 1.5v10M1.5 6.5h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
);

const DotsIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <circle cx="7" cy="3" r="1" fill="currentColor" />
        <circle cx="7" cy="7" r="1" fill="currentColor" />
        <circle cx="7" cy="11" r="1" fill="currentColor" />
    </svg>
);

// ─────────────────────────────────────────────
// Epics Section
// ─────────────────────────────────────────────

interface EpicsDrawerProps {
    epics: EpicTile[];
    loading: boolean;
    error: string;
    search: string;
    onSearchChange: (v: string) => void;
    sortBy: string;
    onSortByChange: (v: string) => void;
    sortDir: string;
    onSortDirChange: (v: string) => void;
    epicFilter: 'all' | 'inProgress';
    onFilterChange: (v: 'all' | 'inProgress') => void;
    onViewEpic: (id: number) => void;
    canCreate: boolean;
    onAddEpic: () => void;
}

function EpicsDrawer({
    epics, loading, error, search, onSearchChange,
    sortBy, onSortByChange, sortDir, onSortDirChange,
    epicFilter, onFilterChange, onViewEpic, canCreate, onAddEpic
}: EpicsDrawerProps) {
    const [open, setOpen] = useState(true);
    const [sortMenuOpen, setSortMenuOpen] = useState(false);
    const [filterMenuOpen, setFilterMenuOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [cardsPerPage, setCardsPerPage] = useState(3);
    const sortRef = useRef<HTMLDivElement>(null);
    const filterRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const hasActiveFilter = epicFilter !== 'all' || sortBy !== '';

    useEffect(() => {
        if (!sortMenuOpen && !filterMenuOpen) return;
        const handler = (e: MouseEvent) => {
            if (sortRef.current?.contains(e.target as Node)) return;
            if (filterRef.current?.contains(e.target as Node)) return;
            setSortMenuOpen(false);
            setFilterMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [sortMenuOpen, filterMenuOpen]);

    // Calculate cards per page based on container width
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const handler = () => {
            const width = el.clientWidth;
            // Match CSS grid: minmax(220px, 1fr) with 10px gap
            // Cards can shrink to 220px, so use that as the minimum
            const minCardWidth = 220;
            const gap = 10;
            // Calculate how many cards fit: first card takes minCardWidth, subsequent take minCardWidth + gap
            const count = Math.max(1, Math.floor((width + gap) / (minCardWidth + gap)));
            setCardsPerPage(count);
        };
        handler();

        const observer = new ResizeObserver(handler);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const visibleEpics = useMemo(() => {
        if (epicFilter === 'all') return epics;
        return epics.filter(e => e.completedStories < e.totalStories || e.completedTasks < e.totalTasks);
    }, [epics, epicFilter]);

    useEffect(() => {
        const totalPages = Math.max(1, Math.ceil(visibleEpics.length / cardsPerPage));
        if (currentPage > totalPages) setCurrentPage(1);
    }, [cardsPerPage, visibleEpics.length, currentPage]);

    const totalPages = Math.max(1, Math.ceil(visibleEpics.length / cardsPerPage));
    const startIdx = (currentPage - 1) * cardsPerPage;
    const pagedEpics = visibleEpics.slice(startIdx, startIdx + cardsPerPage);

    return (
        <div className="bv2-epics-drawer">
            {/* Header */}
            <div
                className={`bv2-epics-header${open ? ' bv2-epics-header--open' : ''}`}
                onClick={() => setOpen(v => !v)}
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onKeyDown={e => { if (e.key === 'Enter') setOpen(v => !v); }}
                aria-label={open ? 'Collapse epics' : 'Expand epics'}
            >
                <span className="bv2-epics-label">EPICS</span>
                <span className={`bv2-epics-toggle-icon${open ? ' bv2-epics-toggle-icon--open' : ''}`}>
                    <ChevronDownIcon />
                </span>
                <span className="bv2-epics-count-pill">{epics.length}</span>
                {hasActiveFilter && <span className="bv2-active-indicator" title="Sort/filter active" />}

                {/* Controls visible in header when expanded */}
                {open && (
                    <div className="bv2-epics-header-controls" onClick={e => e.stopPropagation()}>
                        <div className="bv2-epics-search-wrap">
                            <span className="bv2-epics-search-icon"><SearchIcon /></span>
                            <input
                                className="bv2-epics-search"
                                placeholder="Search epics…"
                                value={search}
                                onChange={e => onSearchChange(e.target.value)}
                                aria-label="Search epics"
                            />
                        </div>

                        {/* Sort */}
                        <div className="bv2-toolbar-menu-wrap" ref={sortRef}>
                            <button
                                type="button"
                                className={`bv2-panel-tool-btn${sortMenuOpen ? ' bv2-panel-tool-btn--active' : ''}`}
                                title="Sort epics"
                                aria-label="Sort epics"
                                onClick={() => { setFilterMenuOpen(false); setSortMenuOpen(v => !v); }}
                            >
                                <SortIcon />
                                <span>Sort</span>
                            </button>
                            {sortMenuOpen && (
                                <div className="bv2-toolbar-menu">
                                    <span className="bv2-toolbar-menu-label">Sort by</span>
                                    <select value={sortBy} onChange={e => onSortByChange(e.target.value)}>
                                        <option value="">Default</option>
                                        <option value="Title">Title</option>
                                        <option value="WorkItemID">ID</option>
                                    </select>
                                    <span className="bv2-toolbar-menu-label" style={{ marginTop: 6 }}>Direction</span>
                                    <select value={sortDir} onChange={e => onSortDirChange(e.target.value)}>
                                        <option value="">Default</option>
                                        <option value="asc">Ascending</option>
                                        <option value="desc">Descending</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Filter */}
                        <div className="bv2-toolbar-menu-wrap" ref={filterRef}>
                            <button
                                type="button"
                                className={`bv2-panel-tool-btn${filterMenuOpen ? ' bv2-panel-tool-btn--active' : ''}`}
                                title="Filter epics"
                                aria-label="Filter epics"
                                onClick={() => { setSortMenuOpen(false); setFilterMenuOpen(v => !v); }}
                            >
                                <FilterIcon />
                                <span>Filter</span>
                            </button>
                            {filterMenuOpen && (
                                <div className="bv2-toolbar-menu">
                                    <span className="bv2-toolbar-menu-label">Progress</span>
                                    <select value={epicFilter} onChange={e => onFilterChange(e.target.value as 'all' | 'inProgress')}>
                                        <option value="all">All epics</option>
                                        <option value="inProgress">In progress</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Add Epic */}
                        {canCreate && (
                            <button type="button" className="bv2-btn-primary" onClick={onAddEpic} aria-label="Add new epic">
                                <PlusIcon />
                                Add Epic
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Content */}
            <div
                className={`bv2-epics-content${open ? ' bv2-epics-content--open' : ' bv2-epics-content--closed'}`}
                style={{ height: open ? undefined : 0 }}
            >
                <div className="bv2-epics-scroll" ref={scrollRef}>
                    {error && <div className="bv2-error-banner" style={{ minWidth: 280 }}>{error}</div>}
                    {loading ? (
                        Array.from({ length: cardsPerPage }).map((_, i) => (
                            <div key={i} className="bv2-epic-card" style={{ opacity: 0.5 }}>
                                <div className="bv2-loading-skel" style={{ height: 12, marginBottom: 8, marginLeft: 0, marginRight: 0 }} />
                                <div className="bv2-loading-skel" style={{ height: 8, width: '60%', marginLeft: 0, marginRight: 0 }} />
                            </div>
                        ))
                    ) : pagedEpics.length === 0 ? (
                        <div className="bv2-empty" style={{ minWidth: 200 }}>No epics found.</div>
                    ) : (
                        pagedEpics.map(epic => {
                            const totalItems = epic.totalStories + epic.totalTasks;
                            const doneItems = epic.completedStories + epic.completedTasks;
                            const progressPct = totalItems > 0 ? Math.round(doneItems / totalItems * 100) : 0;
                            return (
                                <div
                                    key={epic.epicID}
                                    className="bv2-epic-card"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => onViewEpic(epic.epicID)}
                                    onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') onViewEpic(epic.epicID); }}
                                    aria-label={`View epic: ${epic.epicTitle}`}
                                >
                                    <div className="bv2-epic-card-title" title={epic.epicTitle}>{epic.epicTitle}</div>
                                    <div className="bv2-epic-prog-track" aria-hidden="true">
                                        <div className="bv2-epic-prog-fill" style={{ width: `${progressPct}%` }} />
                                    </div>
                                    <div className="bv2-epic-stats-row">
                                        <div className="bv2-epic-stat">
                                            <span className="bv2-epic-stat-label">Stories</span>
                                            <span className="bv2-epic-stat-value">
                                                <strong>{epic.completedStories}</strong>/{epic.totalStories}
                                            </span>
                                        </div>
                                        <div className="bv2-epic-stat bv2-epic-stat--tasks">
                                            <span className="bv2-epic-stat-label">Tasks</span>
                                            <span className="bv2-epic-stat-value">
                                                <strong>{epic.completedTasks}</strong>/{epic.totalTasks}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {totalPages > 1 && (
                    <Pagination
                        currentPage={currentPage}
                        pageSize={cardsPerPage}
                        total={visibleEpics.length}
                        onPageChange={setCurrentPage}
                        onPageSizeChange={() => {}}
                        className="pagination-root--compact bv2-epics-pagination"
                        showInfo={false}
                        showPageSize={false}
                    />
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// Backlog Row
// ─────────────────────────────────────────────

function BacklogRow({
    item,
    onDragEnd,
    onOpenDetail,
    hasChildren = false,
    expanded = false,
    onToggleExpand,
    userMap = {},
}: {
    item: AgendaWorkItem;
    onDragEnd: () => void;
    onOpenDetail: (item: AgendaWorkItem) => void;
    hasChildren?: boolean;
    expanded?: boolean;
    onToggleExpand?: () => void;
    userMap?: Record<number, { displayName: string; teamName: string | null }>;
}) {
    const typeLower = (item.typeName ?? 'task').toLowerCase();
    const priorityCls = priorityBorderClass(item.priority);
    const chipCls = priorityChipClass(item.priority);
    const assigneeName = (item as AgendaWorkItem & { assignedUserName?: string }).assignedUserName;
    const assigneeId = item.assignedUserID;
    const userInfo = assigneeId != null ? userMap[assigneeId] : null;
    const avatarColor = userInfo?.teamName ? getTeamAccentColor(userInfo.teamName) : (assigneeName ? getTeamAccentColor(null) : 'transparent');

    return (
        <div
            className={`bv2-wi-row ${priorityCls}`}
            draggable
            onDragStart={e => {
                e.dataTransfer.setData('text/plain', String(item.workItemID));
                e.dataTransfer.setData('application/x-type-name', item.typeName ?? '');
                e.dataTransfer.effectAllowed = 'move';
                (e.currentTarget as HTMLElement).classList.add('bv2-wi-row--dragging');
            }}
            onDragEnd={e => {
                (e.currentTarget as HTMLElement).classList.remove('bv2-wi-row--dragging');
                onDragEnd();
            }}
            onClick={() => onOpenDetail(item)}
            role="button"
            tabIndex={0}
            onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') onOpenDetail(item); }}
            aria-label={`${item.typeName ?? 'Work item'}: ${item.title}`}
        >
            {/* Type */}
            <div className="bv2-wi-type-cell">
                <span className={`bv2-wi-dot bv2-wi-dot--${typeLower}`} aria-hidden="true" />
                <span className="bv2-wi-type-label">{typeLower === 'story' ? 'Story' : typeLower === 'task' ? 'Task' : item.typeName ?? '—'}</span>
            </div>

            {/* Name */}
            <div className="bv2-wi-name-cell">
                {hasChildren ? (
                    <button
                        type="button"
                        className="bv2-wi-expand-btn"
                        onClick={e => { e.stopPropagation(); onToggleExpand?.(); }}
                        aria-label={expanded ? 'Collapse tasks' : 'Expand tasks'}
                        title={expanded ? 'Collapse' : 'Expand'}
                    >
                        <span style={{ transform: expanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.18s ease', fontSize: '0.5625rem' }}>▸</span>
                    </button>
                ) : (
                    <span className="bv2-wi-expand-spacer" aria-hidden="true" />
                )}
                <span className="bv2-wi-title" title={item.title}>{item.title}</span>
            </div>

            {/* Priority */}
            <div className="bv2-wi-priority-cell">
                <span className={`bv2-wi-priority-chip ${chipCls}`}>{item.priority ?? '—'}</span>
            </div>

            {/* Due */}
            <div className="bv2-wi-due-cell">
                {item.dueDate ? formatDate(item.dueDate) : '—'}
            </div>

            {/* Assignee */}
            <div className="bv2-wi-assignee-cell">
                {assigneeName || userInfo ? (
                    <div
                        className="bv2-assignee-avatar"
                        style={{ background: avatarColor }}
                        title={userInfo?.displayName ?? assigneeName ?? 'Unknown'}
                        aria-label={userInfo?.displayName ?? assigneeName ?? 'Unknown'}
                    >
                        {getInitials(userInfo?.displayName ?? assigneeName)}
                    </div>
                ) : (
                    <div className="bv2-assignee-avatar bv2-assignee-avatar--empty" title="Unassigned" aria-label="Unassigned">
                        —
                    </div>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// Sprint Work Items List
// ─────────────────────────────────────────────

function SprintWorkItemsList({
    sprintWorkItems, onRemoveFromSprint, canManage, onAssignAssignee, onOpenDetail,
}: {
    sprintWorkItems: AgendaWorkItem[];
    onRemoveFromSprint: (id: number, typeName?: string) => void;
    me: UserProfile | null;
    canManage: boolean;
    onAssignAssignee: (id: number) => void;
    onOpenDetail: (item: AgendaWorkItem) => void;
}) {
    const stories = sprintWorkItems.filter(w => normTypeName(w) === STORY_TYPE.toLowerCase());
    const storyIdSet = new Set(stories.map(s => s.workItemID));
    const tasksByParent = new Map<number, AgendaWorkItem[]>();
    for (const w of sprintWorkItems) {
        if (normTypeName(w) !== TASK_TYPE.toLowerCase()) continue;
        const p = w.parentWorkItemID;
        if (p == null) continue;
        const arr = tasksByParent.get(p) ?? [];
        arr.push(w);
        tasksByParent.set(p, arr);
    }
    const orphanTasks = sprintWorkItems.filter(w =>
        normTypeName(w) === TASK_TYPE.toLowerCase() &&
        (w.parentWorkItemID == null || !storyIdSet.has(w.parentWorkItemID))
    );

    if (stories.length === 0 && orphanTasks.length === 0) {
        return <div className="bv2-empty" style={{ padding: '16px 14px' }}>No work items in this sprint.</div>;
    }

    const renderItem = (item: AgendaWorkItem, child = false) => {
        const assigneeName = (item as AgendaWorkItem & { assignedUserName?: string }).assignedUserName;
        const typeLower = (item.typeName ?? 'task').toLowerCase();
        const statusLower = (item.status ?? '').toLowerCase();
        const statusClass = statusLower === 'new' || statusLower === 'todo' ? 'bv2-sp-wi-status--todo'
            : statusLower === 'inprogress' || statusLower === 'in progress' || statusLower === 'ongoing' ? 'bv2-sp-wi-status--ongoing'
            : statusLower === 'review' || statusLower === 'in review' || statusLower === 'inreview' || statusLower === 'for checking' || statusLower === 'for-checking' || statusLower === 'forchecking' ? 'bv2-sp-wi-status--review'
            : statusLower === 'completed' || statusLower === 'done' ? 'bv2-sp-wi-status--completed'
            : 'bv2-sp-wi-status--default';
        return (
            <div key={item.workItemID} className={`bv2-sp-wi-row${child ? ' bv2-sp-wi-row--child' : ''}`}>
                <span className={`bv2-sp-wi-dot bv2-wi-dot--${typeLower}`} aria-hidden="true" />
                <span
                    className="bv2-sp-wi-title"
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenDetail(item)}
                    onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') onOpenDetail(item); }}
                    title={item.title}
                >
                    {item.title}
                </span>
                <span className={`bv2-sp-wi-status ${statusClass}`}>{item.status}</span>
                <span className="bv2-sp-wi-assignee">
                    {assigneeName
                        ? assigneeName
                        : canManage
                            ? <button type="button" className="bv2-assign-link" onClick={() => onAssignAssignee(item.workItemID)}>+ Assign</button>
                            : '—'}
                </span>
                {canManage && (
                    <button
                        type="button"
                        className="bv2-sp-wi-remove-btn"
                        onClick={() => onRemoveFromSprint(item.workItemID, item.typeName)}
                        title="Remove from sprint"
                        aria-label={`Remove ${item.title} from sprint`}
                    >
                        ×
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="bv2-sp-wi-list">
            {stories.map(s => (
                <div key={s.workItemID}>
                    {renderItem(s, false)}
                    {(tasksByParent.get(s.workItemID) ?? []).map(t => renderItem(t, true))}
                </div>
            ))}
            {orphanTasks.map(t => renderItem(t, false))}
        </div>
    );
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function BacklogsV2() {
    const [me, setMe] = useState<UserProfile | null>(null);

    // ── Epics state ──────────────────────────
    const [epics, setEpics] = useState<EpicTile[]>([]);
    const [epicsLoading, setEpicsLoading] = useState(true);
    const [epicsError, setEpicsError] = useState('');
    const [epicSearch, setEpicSearch] = useState('');
    const [epicSortBy, setEpicSortBy] = useState<'WorkItemID' | 'Title' | ''>('');
    const [epicSortDir, setEpicSortDir] = useState<'asc' | 'desc' | ''>('');
    const [epicFilter, setEpicFilter] = useState<'all' | 'inProgress'>('all');
    const [viewEpicId, setViewEpicId] = useState<number | null>(null);

    // ── Sprints state ─────────────────────────
    const [sprints, setSprints] = useState<SprintSummary[]>([]);
    const [sprintsLoading, setSprintsLoading] = useState(true);
    const [sprintsError, setSprintsError] = useState('');
    const [sprintSearch, setSprintSearch] = useState('');
    const [sprintStatus, setSprintStatus] = useState<'All' | 'Planned' | 'Active' | 'Completed'>('All');
    const [sprintSortBy, setSprintSortBy] = useState<'SprintName' | 'StartDate' | 'EndDate' | 'Status' | 'CreatedAt' | 'UpdatedAt'>('SprintName');
    const [sprintSortDir, setSprintSortDir] = useState<'asc' | 'desc'>('desc');
    const [expandedSprintIds, setExpandedSprintIds] = useState<Set<number>>(() => new Set());
    const [sprintWorkItemsBySprint, setSprintWorkItemsBySprint] = useState<Record<number, AgendaWorkItem[]>>({});
    const [sprintWorkItemsLoadingBySprint, setSprintWorkItemsLoadingBySprint] = useState<Record<number, boolean>>({});

    // ── Backlog state ─────────────────────────
    const [backlogItems, setBacklogItems] = useState<AgendaWorkItem[]>([]);
    const [backlogLoading, setBacklogLoading] = useState(true);
    const [backlogError, setBacklogError] = useState('');
    const [backlogTitleSearch, setBacklogTitleSearch] = useState('');
    const [backlogType, setBacklogType] = useState<'All' | 'Story' | 'Task'>('All');
    const [backlogPriority, setBacklogPriority] = useState<'All' | 'Low' | 'Medium' | 'High'>('All');
    const [backlogAssignee, setBacklogAssignee] = useState<'All' | 'Me'>('All');
    const [backlogSortBy, setBacklogSortBy] = useState<'Title' | 'Priority' | 'Status' | 'WorkItemID' | 'DueDate'>('WorkItemID');
    const [backlogSortDir, setBacklogSortDir] = useState<'asc' | 'desc'>('desc');
    const [expandedStoryIds, setExpandedStoryIds] = useState<Set<number>>(() => new Set());

    // ── Toolbar menus refs ────────────────────
    const blToolbarRef = useRef<HTMLDivElement>(null);
    const spToolbarRef = useRef<HTMLDivElement>(null);
    const [blFilterMenuOpen, setBlFilterMenuOpen] = useState(false);
    const [blSortMenuOpen, setBlSortMenuOpen] = useState(false);
    const [spFilterMenuOpen, setSpFilterMenuOpen] = useState(false);
    const [spSortMenuOpen, setSpSortMenuOpen] = useState(false);

    // ── Drag & drop ───────────────────────────
    const [dragOverSprintId, setDragOverSprintId] = useState<number | null>(null);

    // ── Page status ───────────────────────────
    const [pageStatus, setPageStatus] = useState<StatusState>({ kind: 'none' });
    const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Sprint portal menu ────────────────────
    type SprintMenuAnchor = { sprintId: number; top: number; right: number };
    const [sprintMenuAnchor, setSprintMenuAnchor] = useState<SprintMenuAnchor | null>(null);
    const sprintMenuRef = useRef<HTMLDivElement | null>(null);

    // ── Add item ──────────────────────────────
    const [addItemTarget, setAddItemTarget] = useState<AddItemTarget>(null);

    // ── Modals ────────────────────────────────
    const [detailItem, setDetailItem] = useState<AgendaWorkItem | null>(null);
    const [deleteConfirmSprintId, setDeleteConfirmSprintId] = useState<number | null>(null);

    // ── Confirmations ─────────────────────────
    type DragConfirmState = { workItemId: number; sprintId: number };
    const [dragConfirm, setDragConfirm] = useState<DragConfirmState | null>(null);
    type TeamMismatchConfirmState = { workItemId: number; sprintId: number };
    const [teamMismatchConfirm, setTeamMismatchConfirm] = useState<TeamMismatchConfirmState | null>(null);
    type RemoveConfirmState = { workItemId: number; title: string };
    const [removeConfirm, setRemoveConfirm] = useState<RemoveConfirmState | null>(null);

    // ── Manage sprint ─────────────────────────
    const [manageOpen, setManageOpen] = useState(false);
    const [manageSprintId, setManageSprintId] = useState<number | null>(null);
    const [manageLoading, setManageLoading] = useState(false);
    const [manageError, setManageError] = useState('');
    const [manageSprintName, setManageSprintName] = useState('');
    const [manageGoal, setManageGoal] = useState('');
    const [manageStartDate, setManageStartDate] = useState('');
    const [manageEndDate, setManageEndDate] = useState('');
    const [manageManagedBy, setManageManagedBy] = useState<number | null>(null);
    const [manageTeamId, setManageTeamId] = useState<number | null>(null);
    const [manageSprintData, setManageSprintData] = useState<SprintSummary | null>(null);

    // ── Assignee picker ───────────────────────
    const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
    const [assigneeTargetWorkItemId, setAssigneeTargetWorkItemId] = useState<number | null>(null);
    const [assigneeSprintTeamId, setAssigneeSprintTeamId] = useState<number | null>(null);
    const [assigneeSearch, setAssigneeSearch] = useState('');
    const [assigneeUsers, setAssigneeUsers] = useState<UserLookup[]>([]);
    const [assigneeLoading, setAssigneeLoading] = useState(false);
    const [assigneeError, setAssigneeError] = useState('');
    const [allUsersForAvatars, setAllUsersForAvatars] = useState<UserLookup[]>([]);

    // Build a user map for quick lookup (userID -> { displayName, teamName })
    const userMap = useMemo(() => {
        const map: Record<number, { displayName: string; teamName: string | null }> = {};
        for (const u of allUsersForAvatars) {
            map[u.userID] = { displayName: u.displayName, teamName: u.teamName };
        }
        return map;
    }, [allUsersForAvatars]);
    const assigneeSearchDebounced = useDebounced(assigneeSearch, 280);

    const isAdminOrSM = me?.roleName === 'Administrator' || me?.roleName === 'Scrum Master' || me?.roleName === 'ScrumMaster';

    // ── Utils ─────────────────────────────────
    const showStatus = useCallback((s: StatusState, ms = 4000) => {
        setPageStatus(s);
        if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
        statusTimerRef.current = setTimeout(() => setPageStatus({ kind: 'none' }), ms);
    }, []);

    // ── Init user ─────────────────────────────
    useEffect(() => {
        let cancelled = false;
        getCurrentUser().then(u => { if (!cancelled) setMe(u); }).catch(() => { if (!cancelled) setMe(null); });
        return () => { cancelled = true; };
    }, []);

    // ── Close menus on outside click ──────────
    useEffect(() => {
        if (sprintMenuAnchor === null) return;
        const onPD = (e: PointerEvent) => {
            const t = e.target as HTMLElement | null;
            if (sprintMenuRef.current?.contains(t as Node)) return;
            if (t?.closest?.('[data-sp-menu-trigger]')) return;
            setSprintMenuAnchor(null);
        };
        window.addEventListener('pointerdown', onPD);
        return () => window.removeEventListener('pointerdown', onPD);
    }, [sprintMenuAnchor]);

    useEffect(() => {
        if (!blFilterMenuOpen && !blSortMenuOpen) return;
        const onDown = (e: MouseEvent) => {
            if (blToolbarRef.current?.contains(e.target as Node)) return;
            setBlFilterMenuOpen(false);
            setBlSortMenuOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [blFilterMenuOpen, blSortMenuOpen]);

    useEffect(() => {
        if (!spFilterMenuOpen && !spSortMenuOpen) return;
        const onDown = (e: MouseEvent) => {
            if (spToolbarRef.current?.contains(e.target as Node)) return;
            setSpFilterMenuOpen(false);
            setSpSortMenuOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [spFilterMenuOpen, spSortMenuOpen]);

    // ── Load Epics ────────────────────────────
    const loadEpics = useCallback(async () => {
        setEpicsLoading(true); setEpicsError('');
        try {
            const rows = await getEpicTiles({ search: epicSearch, sortBy: epicSortBy || '', sortDirection: epicSortDir || '' });
            setEpics(rows);
        } catch (err) { setEpicsError(err instanceof Error ? err.message : 'Failed to load epics.'); }
        finally { setEpicsLoading(false); }
    }, [epicSearch, epicSortBy, epicSortDir]);
    useEffect(() => { void loadEpics(); }, [loadEpics]);

    // ── Load Sprints ──────────────────────────
    const loadSprints = useCallback(async () => {
        setSprintsLoading(true); setSprintsError('');
        try {
            const status = sprintStatus === 'All' ? undefined : sprintStatus;
            const res = await listSprints({ status, search: sprintSearch || undefined, sortBy: sprintSortBy, sortDirection: sprintSortDir, page: 1, pageSize: 200 });
            setSprints(res.items);
        } catch (err) { setSprintsError(err instanceof Error ? err.message : 'Failed to load sprints.'); }
        finally { setSprintsLoading(false); }
    }, [sprintSearch, sprintStatus, sprintSortBy, sprintSortDir]);
    useEffect(() => { void loadSprints(); }, [loadSprints]);

    // ── BoardHub: join sprint groups so lifecycle broadcasts reach everyone on this page ──
    // Sprint lifecycle events are broadcast to `sprint-{id}` groups. Unlike WorkItemCreated,
    // they won't be seen unless the client has joined the sprint group. To make the Sprints
    // section update for all viewers (concurrent screens), join groups for the currently
    // loaded sprints list.
    const joinedSprintGroupsRef = useRef<Set<number>>(new Set());
    useEffect(() => {
        const conn = getBoardHubConnection();
        let cancelled = false;

        const reconcile = async () => {
            try { await ensureBoardHubStarted(); } catch { return; }
            if (cancelled) return;

            const desired = new Set<number>(sprints.map(s => s.sprintID).filter(id => Number.isFinite(id) && id > 0));
            const joined = joinedSprintGroupsRef.current;

            // Leave groups no longer in the list
            for (const id of Array.from(joined)) {
                if (desired.has(id)) continue;
                try { await conn.invoke('LeaveSprintBoard', id); } catch { /* ignore */ }
                joined.delete(id);
            }

            // Join newly listed sprints
            for (const id of Array.from(desired)) {
                if (joined.has(id)) continue;
                try { await conn.invoke('JoinSprintBoard', id); } catch { /* ignore */ }
                joined.add(id);
            }
        };

        void reconcile();
        return () => { cancelled = true; };
    }, [sprints]);

    // ── Load Backlog ──────────────────────────
    const loadBacklog = useCallback(async () => {
        setBacklogLoading(true); setBacklogError('');
        try {
            const priority = backlogPriority === 'All' ? undefined : backlogPriority;
            const workItemType = backlogType === 'All' ? undefined : backlogType;
            const assigneeId = backlogAssignee === 'Me' ? me?.userID : undefined;
            const res = await getAgendasFiltered({ priority, workItemType, assigneeId: assigneeId ?? undefined, sortBy: backlogSortBy, sortDirection: backlogSortDir });
            setBacklogItems(res.workItems);
        } catch (err) {
            setBacklogError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to load backlog.');
        }
        finally { setBacklogLoading(false); }
    }, [backlogAssignee, backlogPriority, backlogSortBy, backlogSortDir, backlogType, me?.userID]);
    useEffect(() => { void loadBacklog(); }, [loadBacklog]);

    // ── Derived backlog structure ─────────────
    const visibleBacklog = useMemo(() => {
        const q = backlogTitleSearch.trim().toLowerCase();
        if (!q) return backlogItems;
        return backlogItems.filter(w => w.title.toLowerCase().includes(q));
    }, [backlogItems, backlogTitleSearch]);

    const stories = useMemo(() => visibleBacklog.filter(w => normTypeName(w) === STORY_TYPE.toLowerCase()), [visibleBacklog]);
    const storyIdSet = useMemo(() => new Set(stories.map(s => s.workItemID)), [stories]);
    const tasksByParentStoryId = useMemo(() => {
        const map = new Map<number, AgendaWorkItem[]>();
        for (const w of visibleBacklog) {
            if (normTypeName(w) !== TASK_TYPE.toLowerCase()) continue;
            const parent = w.parentWorkItemID;
            if (parent == null) continue;
            const arr = map.get(parent) ?? [];
            arr.push(w);
            map.set(parent, arr);
        }
        return map;
    }, [visibleBacklog]);
    const orphanTasks = useMemo(() =>
        visibleBacklog.filter(w => normTypeName(w) === TASK_TYPE.toLowerCase() && (w.parentWorkItemID == null || !storyIdSet.has(w.parentWorkItemID))),
        [visibleBacklog, storyIdSet]
    );
    const hasBacklogRows = stories.length > 0 || orphanTasks.length > 0;

    // ── Refresh expanded sprints ──────────────
    const refreshExpandedSprints = useCallback(async (ids?: number[]) => {
        const target = ids ?? Array.from(expandedSprintIds);
        if (target.length === 0) return;
        await Promise.all(target.map(async sprintId => {
            setSprintWorkItemsLoadingBySprint(prev => ({ ...prev, [sprintId]: true }));
            try {
                const items = await getSprintWorkItems(sprintId);
                setSprintWorkItemsBySprint(prev => ({ ...prev, [sprintId]: items }));
            } catch { /* ignore */ }
            finally { setSprintWorkItemsLoadingBySprint(prev => ({ ...prev, [sprintId]: false })); }
        }));
    }, [expandedSprintIds]);

    const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scheduleRealtimeRefresh = useCallback((sprintIdHint?: number) => {
        if (refreshTimerRef.current) return;
        refreshTimerRef.current = setTimeout(async () => {
            refreshTimerRef.current = null;
            await Promise.all([loadBacklog(), loadSprints(), loadEpics()]);
            if (sprintIdHint !== undefined) {
                if (expandedSprintIds.has(sprintIdHint)) await refreshExpandedSprints([sprintIdHint]);
            } else {
                await refreshExpandedSprints();
            }
        }, 150);
    }, [expandedSprintIds, loadBacklog, loadEpics, loadSprints, refreshExpandedSprints]);

    // ── Board Hub ─────────────────────────────
    useEffect(() => {
        const conn = getBoardHubConnection();
        const FULL_REFRESH = ['SprintCreated', 'SprintUpdated', 'SprintStarted', 'SprintStopped', 'SprintCompleted', 'SprintDeleted'] as const;
        const INCREMENTAL = ['WorkItemCreated', 'WorkItemAssignedToSprint', 'WorkItemRemovedFromSprint', 'WorkItemUpdated', 'WorkItemDeleted', 'WorkItemStatusChanged', 'WorkItemMoved'] as const;
        let cancelled = false;

        const handleIncremental = (eventType: string, payload: unknown) => {
            if (payload === null || typeof payload !== 'object') return;
            const data = payload as Record<string, unknown>;
            
            // WorkItemCreated has nested structure: { workItem: { workItemID, ... }, createdAt }
            // Other events have flat structure: { workItemID, ... }
            let workItemId = Number(data.workItemID ?? data.WorkItemID ?? 0);
            if (!workItemId || workItemId <= 0) {
                // Try nested structure for WorkItemCreated
                const workItem = data.workItem as Record<string, unknown> | undefined;
                if (workItem) {
                    workItemId = Number(workItem.workItemID ?? workItem.WorkItemID ?? 0);
                }
            }
            if (!workItemId || workItemId <= 0) return;
            const sprintId = sprintIdFromBoardPayload(data);

            if (eventType === 'WorkItemRemovedFromSprint' || eventType === 'WorkItemDeleted') {
                setSprintWorkItemsBySprint(prev => {
                    const next: Record<number, AgendaWorkItem[]> = {};
                    for (const [key, items] of Object.entries(prev)) {
                        const filtered = items.filter(i => i.workItemID !== workItemId);
                        if (filtered.length > 0) next[Number(key)] = filtered;
                    }
                    return next;
                });
                return;
            }
            if (eventType === 'WorkItemCreated' || eventType === 'WorkItemAssignedToSprint') {
                if (sprintId !== undefined && expandedSprintIds.has(sprintId)) void refreshExpandedSprints([sprintId]);
                return;
            }
            const updatedFields: Partial<AgendaWorkItem> = {};
            const resolvedStatus = data.newStatus ?? data.status;
            if (resolvedStatus !== undefined) updatedFields.status = String(resolvedStatus);
            if (data.assignedUserID !== undefined) updatedFields.assignedUserID = data.assignedUserID as number | null;
            if (data.assignedUserName !== undefined) updatedFields.assignedUserName = data.assignedUserName as string | null;
            if (data.priority !== undefined) updatedFields.priority = data.priority as string | null;
            if (data.dueDate !== undefined) updatedFields.dueDate = data.dueDate as string | null;
            if (data.title !== undefined) updatedFields.title = String(data.title);
            if (data.workItemType !== undefined) updatedFields.typeName = String(data.workItemType);
            if (data.parentWorkItemID !== undefined) updatedFields.parentWorkItemID = data.parentWorkItemID as number | null;
            if (Object.keys(updatedFields).length > 0) {
                setSprintWorkItemsBySprint(prev => {
                    const next: Record<number, AgendaWorkItem[]> = {};
                    for (const [key, items] of Object.entries(prev)) {
                        next[Number(key)] = items.map(i => i.workItemID === workItemId ? { ...i, ...updatedFields } : i);
                    }
                    return next;
                });
            }
        };

        const start = async () => {
            try { await ensureBoardHubStarted(); } catch { return; }
            if (cancelled) return;
            FULL_REFRESH.forEach(ev => conn.on(ev, () => scheduleRealtimeRefresh()));
            INCREMENTAL.forEach(ev => { conn.on(ev, payload => { handleIncremental(ev, payload); const sid = sprintIdFromBoardPayload(payload); scheduleRealtimeRefresh(sid); }); });
        };
        void start();
        return () => { cancelled = true; FULL_REFRESH.forEach(ev => conn.off(ev)); INCREMENTAL.forEach(ev => conn.off(ev)); };
    }, [expandedSprintIds, refreshExpandedSprints, scheduleRealtimeRefresh]);

    useEffect(() => {
        if (!me) return;
        const conn = getNotificationHubConnection();
        const onAdminDir = () => scheduleRealtimeRefresh();
        const onNotif = (dto: unknown) => { if (!isPlanningNotificationPayload(dto)) return; scheduleRealtimeRefresh(relatedSprintIdFromNotification(dto)); };
        conn.on('AdminDirectoryChanged', onAdminDir);
        conn.on('NotificationReceived', onNotif);
        void (async () => { try { await startNotificationHub(); } catch { /* hub optional */ } })();
        return () => { conn.off('AdminDirectoryChanged', onAdminDir); conn.off('NotificationReceived', onNotif); };
    }, [me, scheduleRealtimeRefresh]);

    // ── Sprint expand ─────────────────────────
    const toggleSprintExpanded = useCallback(async (sprintId: number) => {
        const isExpanded = expandedSprintIds.has(sprintId);
        const next = new Set(expandedSprintIds);
        if (isExpanded) {
            next.delete(sprintId);
            setExpandedSprintIds(next);
            try { await getBoardHubConnection().invoke('LeaveSprintBoard', sprintId); } catch { /* ignore */ }
            return;
        }
        next.add(sprintId);
        setExpandedSprintIds(next);
        try { await getBoardHubConnection().invoke('JoinSprintBoard', sprintId); } catch { /* ignore */ }
        setSprintWorkItemsLoadingBySprint(prev => ({ ...prev, [sprintId]: true }));
        try {
            const items = await getSprintWorkItems(sprintId);
            setSprintWorkItemsBySprint(prev => ({ ...prev, [sprintId]: items }));
        } catch (err) {
            showStatus({ kind: 'error', message: err instanceof ApiError ? err.message : 'Failed to load sprint work items.' });
        } finally {
            setSprintWorkItemsLoadingBySprint(prev => ({ ...prev, [sprintId]: false }));
        }
    }, [expandedSprintIds, showStatus]);

    // ── Drag & drop ───────────────────────────
    const handleAssignWorkItemDrop = useCallback(async (workItemId: number, sprintId: number, typeName?: string) => {
        const item = backlogItems.find(i => i.workItemID === workItemId)
            ?? Object.values(sprintWorkItemsBySprint).flat().find(i => i.workItemID === workItemId);
        const sprint = sprints.find(s => s.sprintID === sprintId);
        if (item && sprint && item.assignedUserID != null && item.assignedUserTeamId != null && item.assignedUserTeamId !== 1 && sprint.teamID != null && sprint.teamID !== 1 && item.assignedUserTeamId !== sprint.teamID) {
            setTeamMismatchConfirm({ workItemId, sprintId }); return;
        }
        if (typeName?.toLowerCase() === 'story') { setDragConfirm({ workItemId, sprintId }); return; }
        try {
            await assignToSprint(workItemId, sprintId);
            showStatus({ kind: 'success', message: 'Work item assigned to sprint.' });
            await loadBacklog();
            if (expandedSprintIds.has(sprintId)) await refreshExpandedSprints([sprintId]);
        } catch (err) {
            showStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to assign work item.' });
        }
    }, [backlogItems, expandedSprintIds, loadBacklog, refreshExpandedSprints, showStatus, sprintWorkItemsBySprint, sprints]);

    const confirmDragAssign = useCallback(async () => {
        if (!dragConfirm) return;
        const { workItemId, sprintId } = dragConfirm;
        setDragConfirm(null);
        try {
            // Fetch child Tasks of the Story
            const childTasks = await getTasksByParentId(workItemId);
            if (childTasks.length === 0) {
                showStatus({ kind: 'error', message: 'Story has no child Tasks to assign.' });
                await loadBacklog();
                return;
            }
            // Assign each child Task to the sprint
            let assignedCount = 0;
            let failedCount = 0;
            for (const task of childTasks) {
                if (task.status === 'Completed') continue; // Skip completed tasks
                try {
                    await assignToSprint(task.workItemID, sprintId);
                    assignedCount++;
                } catch {
                    failedCount++;
                }
            }
            if (assignedCount > 0) {
                showStatus({ kind: 'success', message: `Assigned ${assignedCount} task(s) to sprint.` });
            } else if (failedCount > 0) {
                showStatus({ kind: 'error', message: `Failed to assign tasks to sprint.` });
            }
            await loadBacklog();
            if (expandedSprintIds.has(sprintId)) await refreshExpandedSprints([sprintId]);
        } catch (err) {
            showStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to assign story tasks to sprint.' });
        }
    }, [dragConfirm, expandedSprintIds, loadBacklog, refreshExpandedSprints, showStatus]);

    const confirmTeamMismatchAssign = useCallback(async () => {
        if (!teamMismatchConfirm) return;
        const { workItemId, sprintId } = teamMismatchConfirm;
        setTeamMismatchConfirm(null);
        try {
            await assignToSprint(workItemId, sprintId);
            showStatus({ kind: 'success', message: 'Work item assigned to sprint.' });
            await loadBacklog();
            if (expandedSprintIds.has(sprintId)) await refreshExpandedSprints([sprintId]);
        } catch (err) {
            showStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to assign work item.' });
        }
    }, [teamMismatchConfirm, expandedSprintIds, loadBacklog, refreshExpandedSprints, showStatus]);

    const handleRemoveFromSprint = useCallback(async (workItemId: number, typeName?: string) => {
        if (typeName?.toLowerCase() === 'story') {
            const item = Object.values(sprintWorkItemsBySprint).flat().find(i => i.workItemID === workItemId);
            setRemoveConfirm({ workItemId, title: item?.title ?? `Work Item #${workItemId}` }); return;
        }
        let targetSprintId: number | null = null;
        for (const [sprintId, items] of Object.entries(sprintWorkItemsBySprint)) {
            if (items.some(i => i.workItemID === workItemId)) { targetSprintId = Number(sprintId); break; }
        }
        const previousState = { ...sprintWorkItemsBySprint };
        if (targetSprintId !== null) {
            setSprintWorkItemsBySprint(prev => ({ ...prev, [targetSprintId!]: prev[targetSprintId!]?.filter(i => i.workItemID !== workItemId) ?? [] }));
        }
        try {
            await removeFromSprint(workItemId);
            showStatus({ kind: 'success', message: 'Task returned to backlog.' });
            await loadBacklog(); await refreshExpandedSprints();
        } catch (err) {
            setSprintWorkItemsBySprint(previousState);
            showStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to remove from sprint.' });
        }
    }, [loadBacklog, refreshExpandedSprints, showStatus, sprintWorkItemsBySprint]);

    const confirmRemoveAssign = useCallback(async () => {
        if (!removeConfirm) return;
        const { workItemId } = removeConfirm;
        setRemoveConfirm(null);
        
        // Find the sprint this story belongs to
        let targetSprintId: number | null = null;
        for (const [sprintId, items] of Object.entries(sprintWorkItemsBySprint)) {
            if (items.some(i => i.workItemID === workItemId)) { targetSprintId = Number(sprintId); break; }
        }
        
        if (targetSprintId === null) {
            showStatus({ kind: 'error', message: 'Could not find sprint for this story.' });
            return;
        }
        
        // Remove the story from UI optimistically
        const previousState = { ...sprintWorkItemsBySprint };
        setSprintWorkItemsBySprint(prev => ({ ...prev, [targetSprintId!]: prev[targetSprintId!]?.filter(i => i.workItemID !== workItemId) ?? [] }));
        
        try {
            // Fetch child Tasks and remove each from the sprint
            const childTasks = await getTasksByParentId(workItemId);
            let removedCount = 0;
            for (const task of childTasks) {
                if (task.sprintID !== targetSprintId) continue; // Only remove tasks in this sprint
                try {
                    await removeFromSprint(task.workItemID);
                    removedCount++;
                } catch {
                    // Continue with other tasks even if one fails
                }
            }
            if (removedCount > 0) {
                showStatus({ kind: 'success', message: `Removed ${removedCount} task(s) from sprint.` });
            } else {
                showStatus({ kind: 'error', message: 'No tasks found to remove from sprint.' });
            }
            await loadBacklog(); await refreshExpandedSprints();
        } catch (err) {
            setSprintWorkItemsBySprint(previousState);
            showStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to remove story tasks from sprint.' });
        }
    }, [removeConfirm, loadBacklog, refreshExpandedSprints, showStatus, sprintWorkItemsBySprint]);

    // ── Sprint lifecycle ──────────────────────
    const handleSprintLifecycle = async (action: 'start' | 'stop' | 'complete', sprintId: number) => {
        setPageStatus({ kind: 'none' });
        try {
            if (action === 'start') await startSprint(sprintId);
            if (action === 'stop') await stopSprint(sprintId, true);
            if (action === 'complete') await completeSprint(sprintId, true);
            const message = action === 'start' ? 'Sprint Started.' : action === 'stop' ? 'Sprint Stopped.' : 'Sprint Completed.';
            showStatus({ kind: 'success', message });
            await loadSprints(); await refreshExpandedSprints();
        } catch (err) {
            showStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Sprint action failed.' });
        }
    };

    const handleSprintDelete = async (sprintId: number) => {
        try {
            await deleteSprint(sprintId);
            showStatus({ kind: 'success', message: 'Sprint deleted.' });
            await loadSprints(); await refreshExpandedSprints();
        } catch (err) {
            showStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Failed to delete sprint.' });
        } finally { setDeleteConfirmSprintId(null); }
    };

    // ── Manage sprint ─────────────────────────
    const resetManage = () => {
        setManageOpen(false); setManageSprintId(null); setManageLoading(false); setManageError('');
        setManageSprintName(''); setManageGoal(''); setManageStartDate(''); setManageEndDate('');
        setManageManagedBy(null); setManageTeamId(null); setManageSprintData(null);
    };

    const openManageFor = async (sprint: SprintSummary) => {
        setManageSprintId(sprint.sprintID);
        setManageSprintName(sprint.sprintName);
        setManageGoal(sprint.goal ?? '');
        setManageStartDate(sprint.startDate ?? '');
        setManageEndDate(sprint.endDate ?? '');
        setManageManagedBy(sprint.managedBy);
        setManageTeamId(sprint.teamID);
        setManageError('');
        setManageSprintData(sprint);
        setManageOpen(true);
    };

    const saveManage = async (patch?: { sprintName?: string; goal?: string; startDate?: string | null; endDate?: string | null; managedBy?: number | null; teamID?: number | null }) => {
        if (manageSprintId === null) return;
        const finalSprintName = patch?.sprintName ?? manageSprintName.trim();
        const finalGoal = patch?.goal ?? manageGoal.trim();
        const finalStart = patch?.startDate ?? manageStartDate;
        const finalEnd = patch?.endDate ?? manageEndDate;
        const finalManagedBy = patch?.managedBy ?? manageManagedBy;
        const finalTeamId = patch?.teamID ?? manageTeamId;
        setManageLoading(true); setManageError('');
        try {
            await patchSprint(manageSprintId, { sprintName: finalSprintName, goal: finalGoal, startDate: finalStart || null, endDate: finalEnd || null, managedBy: finalManagedBy, teamID: finalTeamId });
            showStatus({ kind: 'success', message: 'Sprint updated.' });
            await loadSprints(); resetManage();
        } catch (err) { setManageError(err instanceof Error ? err.message : 'Failed to update sprint.'); }
        finally { setManageLoading(false); }
    };

    // ── Assignee picker ───────────────────────
    const loadAssigneeUsers = useCallback(async () => {
        if (!assigneePickerOpen || assigneeTargetWorkItemId === null) return;
        setAssigneeLoading(true); setAssigneeError('');
        try {
            const resp = await lookupUsers({ search: assigneeSearchDebounced, teamId: assigneeSprintTeamId, limit: 25 });
            setAssigneeUsers(resp);
        } catch (err) { setAssigneeError(err instanceof Error ? err.message : 'Failed to load users.'); }
        finally { setAssigneeLoading(false); }
    }, [assigneePickerOpen, assigneeSearchDebounced, assigneeTargetWorkItemId, assigneeSprintTeamId]);

    // Load all users for avatar coloring (no team filter, like admin page)
    useEffect(() => {
        if (!me) return;
        let cancelled = false;
        const loadAllUsers = async () => {
            try {
                const resp = await lookupUsers({ search: '', limit: 500 });
                if (!cancelled) setAllUsersForAvatars(resp);
            } catch { /* ignore */ }
        };
        void loadAllUsers();
        return () => { cancelled = true; };
    }, [me]);
    useEffect(() => { if (assigneePickerOpen) void loadAssigneeUsers(); }, [assigneePickerOpen, loadAssigneeUsers]);

    const openAssigneePicker = (workItemId: number, sprintTeamId: number | null) => {
        setAssigneeTargetWorkItemId(workItemId);
        setAssigneeSprintTeamId(sprintTeamId);
        setAssigneeSearch('');
        setAssigneeUsers([]);
        setAssigneeError('');
        setAssigneePickerOpen(true);
    };

    const selectAssignee = async (userID: number) => {
        if (assigneeTargetWorkItemId === null) return;
        setAssigneeLoading(true); setAssigneeError('');
        const previousState = { ...sprintWorkItemsBySprint };
        const user = assigneeUsers.find(u => u.userID === userID);
        const userName = user?.displayName ?? me?.fullName ?? `User #${userID}`;
        setSprintWorkItemsBySprint(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(sprintId => {
                next[Number(sprintId)] = next[Number(sprintId)].map(item => item.workItemID === assigneeTargetWorkItemId ? { ...item, assignedUserID: userID, assignedUserName: userName } : item);
            });
            return next;
        });
        try {
            await updateWorkItem(assigneeTargetWorkItemId, { assignedUserID: userID });
            setAssigneePickerOpen(false); setAssigneeTargetWorkItemId(null);
            showStatus({ kind: 'success', message: 'Assignee updated.' });
            await loadBacklog(); await refreshExpandedSprints();
        } catch (err) {
            setSprintWorkItemsBySprint(previousState);
            setAssigneeError(err instanceof Error ? err.message : 'Failed to update assignee.');
        } finally { setAssigneeLoading(false); }
    };

    // ─────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────
    return (
        <div className="bv2-page" style={{ position: 'relative' }}>
            {/* Status toast */}
            {pageStatus.kind !== 'none' && (
                <div className="bv2-status-banner">
                    <StatusBanner variant={pageStatus.kind === 'error' ? 'error' : 'success'} message={pageStatus.message} />
                </div>
            )}

            {/* ── Epics Drawer ──────────────────── */}
            <EpicsDrawer
                epics={epics}
                loading={epicsLoading}
                error={epicsError}
                search={epicSearch}
                onSearchChange={setEpicSearch}
                sortBy={epicSortBy}
                onSortByChange={v => setEpicSortBy(v as '' | 'WorkItemID' | 'Title')}
                sortDir={epicSortDir}
                onSortDirChange={v => setEpicSortDir(v as '' | 'asc' | 'desc')}
                epicFilter={epicFilter}
                onFilterChange={setEpicFilter}
                onViewEpic={setViewEpicId}
                canCreate={isAdminOrSM}
                onAddEpic={() => { setAddItemTarget('epic'); }}
            />

            {/* ── Workspace ─────────────────────── */}
            <div className="bv2-workspace">

                {/* ── BACKLOGS PANEL ──────────────── */}
                <div className="bv2-panel">
                    {/* Header */}
                    <div className="bv2-panel-header" ref={blToolbarRef}>
                        <span className="bv2-panel-label">Backlog</span>
                        <TooltipIcon text="Stories and tasks ready for sprint planning. Drag a row onto a sprint to assign." />
                        <span className="bv2-panel-count">{visibleBacklog.length}</span>
                        <div className="bv2-panel-divider" />

                        {/* Search */}
                        <div className="bv2-search-wrap">
                            <span className="bv2-search-icon"><SearchIcon /></span>
                            <input
                                className="bv2-search-input"
                                placeholder="Search…"
                                value={backlogTitleSearch}
                                onChange={e => setBacklogTitleSearch(e.target.value)}
                                aria-label="Search backlog"
                            />
                        </div>

                        {/* Sort */}
                        <div className="bv2-toolbar-menu-wrap">
                            <button type="button" className={`bv2-panel-tool-btn${blSortMenuOpen ? ' bv2-panel-tool-btn--active' : ''}`} title="Sort" aria-label="Sort backlog" onClick={() => { setBlFilterMenuOpen(false); setBlSortMenuOpen(v => !v); }}>
                                <SortIcon />
                                <span>Sort</span>
                            </button>
                            {blSortMenuOpen && (
                                <div className="bv2-toolbar-menu">
                                    <span className="bv2-toolbar-menu-label">Sort by</span>
                                    <select value={backlogSortBy} onChange={e => setBacklogSortBy(e.target.value as typeof backlogSortBy)}>
                                        <option value="WorkItemID">ID</option>
                                        <option value="Title">Title</option>
                                        <option value="Priority">Priority</option>
                                        <option value="Status">Status</option>
                                        <option value="DueDate">Due Date</option>
                                    </select>
                                    <span className="bv2-toolbar-menu-label" style={{ marginTop: 6 }}>Direction</span>
                                    <select value={backlogSortDir} onChange={e => setBacklogSortDir(e.target.value as 'asc' | 'desc')}>
                                        <option value="asc">Ascending</option>
                                        <option value="desc">Descending</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Filter */}
                        <div className="bv2-toolbar-menu-wrap">
                            <button type="button" className={`bv2-panel-tool-btn${blFilterMenuOpen ? ' bv2-panel-tool-btn--active' : ''}`} title="Filter" aria-label="Filter backlog" onClick={() => { setBlSortMenuOpen(false); setBlFilterMenuOpen(v => !v); }}>
                                <FilterIcon />
                                <span>Filter</span>
                            </button>
                            {blFilterMenuOpen && (
                                <div className="bv2-toolbar-menu" style={{ minWidth: 200 }}>
                                    <span className="bv2-toolbar-menu-label">Type</span>
                                    <select value={backlogType} onChange={e => setBacklogType(e.target.value as typeof backlogType)}>
                                        <option value="All">All</option>
                                        <option value="Story">Stories</option>
                                        <option value="Task">Tasks</option>
                                    </select>
                                    <span className="bv2-toolbar-menu-label" style={{ marginTop: 6 }}>Priority</span>
                                    <select value={backlogPriority} onChange={e => setBacklogPriority(e.target.value as typeof backlogPriority)}>
                                        <option value="All">All</option>
                                        <option value="Low">Low</option>
                                        <option value="Medium">Medium</option>
                                        <option value="High">High</option>
                                    </select>
                                    <span className="bv2-toolbar-menu-label" style={{ marginTop: 6 }}>Assignee</span>
                                    <select value={backlogAssignee} onChange={e => setBacklogAssignee(e.target.value as 'All' | 'Me')}>
                                        <option value="All">Anyone</option>
                                        <option value="Me">Assigned to me</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Add work item */}
                        {isAdminOrSM && (
                            <button type="button" className="bv2-btn-primary" style={{ padding: '5px 10px', fontSize: '0.75rem' }} onClick={() => setAddItemTarget('workitem')} aria-label="Add work item">
                                <PlusIcon />
                                New Item
                            </button>
                        )}
                    </div>

                    {/* Body */}
                    <div className="bv2-panel-body">
                        {/* Table head */}
                        <div className="bv2-bl-table-head">
                            <div className="bv2-bl-th">Type</div>
                            <div className="bv2-bl-th bv2-bl-th--name">Name</div>
                            <div className="bv2-bl-th bv2-bl-th--priority">Priority</div>
                            <div className="bv2-bl-th bv2-bl-th--due">Due Date</div>
                            <div className="bv2-bl-th">Assignee</div>
                        </div>

                        {backlogError && <div className="bv2-error-banner">{backlogError}</div>}

                        {backlogLoading ? (
                            Array.from({ length: 6 }).map((_, i) => <div key={i} className="bv2-loading-skel" />)
                        ) : !hasBacklogRows ? (
                            <div className="bv2-empty">
                                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true" style={{ opacity: 0.35 }}>
                                    <rect x="2" y="2" width="24" height="24" rx="4" stroke="currentColor" strokeWidth="1.3" strokeDasharray="3 3" />
                                    <path d="M9 14h10M14 9v10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                </svg>
                                <span>No backlog items found.</span>
                            </div>
                        ) : (
                            <div>
                                {stories.map(story => {
                                    const tasks = tasksByParentStoryId.get(story.workItemID) ?? [];
                                    const isExpanded = expandedStoryIds.has(story.workItemID);
                                    return (
                                        <div key={story.workItemID} className="bv2-bl-story-group">
                                            <BacklogRow
                                                item={story}
                                                onDragEnd={() => setDragOverSprintId(null)}
                                                onOpenDetail={setDetailItem}
                                                hasChildren={tasks.length > 0}
                                                expanded={isExpanded}
                                                onToggleExpand={() => setExpandedStoryIds(prev => {
                                                    const next = new Set(prev);
                                                    next.has(story.workItemID) ? next.delete(story.workItemID) : next.add(story.workItemID);
                                                    return next;
                                                })}
                                                userMap={userMap}
                                            />
                                            {isExpanded && tasks.length > 0 && (
                                                <div className="bv2-child-block">
                                                    {tasks.map(t => (
                                                        <BacklogRow
                                                            key={t.workItemID}
                                                            item={t}
                                                            onDragEnd={() => setDragOverSprintId(null)}
                                                            onOpenDetail={setDetailItem}
                                                            userMap={userMap}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {orphanTasks.map(t => (
                                    <div key={t.workItemID} className="bv2-bl-story-group">
                                        <BacklogRow
                                            item={t}
                                            onDragEnd={() => setDragOverSprintId(null)}
                                            onOpenDetail={setDetailItem}
                                            userMap={userMap}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── SPRINTS PANEL ──────────────── */}
                <div className="bv2-panel">
                    {/* Header */}
                    <div className="bv2-panel-header" ref={spToolbarRef}>
                        <span className="bv2-panel-label">Sprints</span>
                        <TooltipIcon text="Drag backlog items onto a sprint row to assign them." />
                        <span className="bv2-panel-count">{sprints.length}</span>
                        <div className="bv2-panel-divider" />

                        <div className="bv2-search-wrap">
                            <span className="bv2-search-icon"><SearchIcon /></span>
                            <input
                                className="bv2-search-input"
                                placeholder="Search…"
                                value={sprintSearch}
                                onChange={e => setSprintSearch(e.target.value)}
                                aria-label="Search sprints"
                            />
                        </div>

                        {/* Sort */}
                        <div className="bv2-toolbar-menu-wrap">
                            <button type="button" className={`bv2-panel-tool-btn${spSortMenuOpen ? ' bv2-panel-tool-btn--active' : ''}`} title="Sort" aria-label="Sort sprints" onClick={() => { setSpFilterMenuOpen(false); setSpSortMenuOpen(v => !v); }}>
                                <SortIcon />
                                <span>Sort</span>
                            </button>
                            {spSortMenuOpen && (
                                <div className="bv2-toolbar-menu">
                                    <span className="bv2-toolbar-menu-label">Sort by</span>
                                    <select value={sprintSortBy} onChange={e => setSprintSortBy(e.target.value as typeof sprintSortBy)}>
                                        <option value="SprintName">Name</option>
                                        <option value="StartDate">Start date</option>
                                        <option value="EndDate">End date</option>
                                        <option value="Status">Status</option>
                                        <option value="CreatedAt">Created</option>
                                        <option value="UpdatedAt">Updated</option>
                                    </select>
                                    <span className="bv2-toolbar-menu-label" style={{ marginTop: 6 }}>Direction</span>
                                    <select value={sprintSortDir} onChange={e => setSprintSortDir(e.target.value as 'asc' | 'desc')}>
                                        <option value="asc">Ascending</option>
                                        <option value="desc">Descending</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Filter */}
                        <div className="bv2-toolbar-menu-wrap">
                            <button type="button" className={`bv2-panel-tool-btn${spFilterMenuOpen ? ' bv2-panel-tool-btn--active' : ''}`} title="Filter" aria-label="Filter sprints" onClick={() => { setSpSortMenuOpen(false); setSpFilterMenuOpen(v => !v); }}>
                                <FilterIcon />
                                <span>Filter</span>
                            </button>
                            {spFilterMenuOpen && (
                                <div className="bv2-toolbar-menu">
                                    <span className="bv2-toolbar-menu-label">Status</span>
                                    <select value={sprintStatus} onChange={e => setSprintStatus(e.target.value as typeof sprintStatus)}>
                                        <option value="All">All</option>
                                        <option value="Planned">Planned</option>
                                        <option value="Active">Active</option>
                                        <option value="Completed">Completed</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* New Sprint */}
                        {isAdminOrSM && (
                            <button type="button" className="bv2-btn-primary" style={{ padding: '5px 10px', fontSize: '0.75rem' }} onClick={() => setAddItemTarget('sprint')} aria-label="New sprint">
                                <PlusIcon />
                                New Sprint
                            </button>
                        )}
                    </div>

                    {/* Body */}
                    <div className="bv2-panel-body">
                        {/* Table head */}
                        <div className="bv2-sp-table-head">
                            <div className="bv2-sp-th">Sprint Name</div>
                            <div className="bv2-sp-th">Duration</div>
                            <div className="bv2-sp-th">Status</div>
                            <div className="bv2-sp-th">Manager</div>
                            <div className="bv2-sp-th" />
                        </div>

                        {sprintsError && <div className="bv2-error-banner">{sprintsError}</div>}

                        {sprintsLoading ? (
                            Array.from({ length: 4 }).map((_, i) => <div key={i} className="bv2-loading-skel" />)
                        ) : sprints.length === 0 ? (
                            <div className="bv2-empty">No sprints found.</div>
                        ) : (
                            sprints.map(s => {
                                const expanded = expandedSprintIds.has(s.sprintID);
                                const canManage = canManageSprint(me, s);
                                const canStartStop = canStartStopSprint(me, s);
                                const dropDisabled = s.status === 'Completed' || !canManage;
                                const dropActive = dragOverSprintId === s.sprintID;
                                const menuOpenHere = sprintMenuAnchor?.sprintId === s.sprintID;

                                return (
                                    <div
                                        key={s.sprintID}
                                        className={`bv2-sp-row-wrap${expanded ? ' bv2-sp-row-wrap--expanded' : ''}${dropActive ? ' bv2-sp-row-wrap--drop-active' : ''}`}
                                        onDragOver={e => { if (dropDisabled) return; e.preventDefault(); setDragOverSprintId(s.sprintID); e.dataTransfer.dropEffect = 'move'; }}
                                        onDragLeave={() => setDragOverSprintId(prev => prev === s.sprintID ? null : prev)}
                                        onDrop={e => {
                                            if (dropDisabled) return;
                                            e.preventDefault();
                                            const raw = e.dataTransfer.getData('text/plain');
                                            const typeName = e.dataTransfer.getData('application/x-type-name') || '';
                                            const id = raw ? Number(raw) : NaN;
                                            if (Number.isFinite(id) && id > 0) void handleAssignWorkItemDrop(id, s.sprintID, typeName || undefined);
                                            setDragOverSprintId(null);
                                        }}
                                    >
                                        {/* Sprint row */}
                                        <div
                                            className={`bv2-sp-row${expanded ? ' bv2-sp-row--expanded' : ''}`}
                                            onClick={() => void toggleSprintExpanded(s.sprintID)}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') void toggleSprintExpanded(s.sprintID); }}
                                            aria-expanded={expanded}
                                        >
                                            <div className="bv2-sp-name-cell">
                                                <span className={`bv2-sp-expand-icon${expanded ? ' bv2-sp-expand-icon--open' : ''}`}>
                                                    <ChevronRightIcon />
                                                </span>
                                                <span className="bv2-sp-name" title={s.sprintName}>{s.sprintName}</span>
                                            </div>

                                            <div className="bv2-sp-duration-cell">
                                                {formatDateRange(s.startDate, s.endDate)}
                                            </div>

                                            <div className="bv2-sp-status-cell">
                                                <span className={`bv2-sp-badge ${sprintBadgeClass(s.status)}`}>{s.status}</span>
                                            </div>

                                            <div className="bv2-sp-manager-cell" title={sprintManagerLabel(s)}>
                                                {sprintManagerLabel(s)}
                                            </div>

                                            <div className="bv2-sp-actions-cell" onClick={e => e.stopPropagation()}>
                                                <button
                                                    type="button"
                                                    className="bv2-sp-menu-btn"
                                                    data-sp-menu-trigger
                                                    aria-expanded={menuOpenHere}
                                                    aria-haspopup="menu"
                                                    aria-label="Sprint actions"
                                                    title="Sprint actions"
                                                    onClick={ev => {
                                                        ev.stopPropagation();
                                                        const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                                                        setSprintMenuAnchor(prev => prev?.sprintId === s.sprintID ? null : { sprintId: s.sprintID, top: r.bottom + 5, right: window.innerWidth - r.right });
                                                    }}
                                                >
                                                    <DotsIcon />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expanded content */}
                                        {expanded && (
                                            <div className="bv2-sp-expanded">
                                                {sprintWorkItemsLoadingBySprint[s.sprintID] ? (
                                                    <div className="bv2-empty" style={{ padding: '12px 0' }}>Loading…</div>
                                                ) : (
                                                    <SprintWorkItemsList
                                                        sprintWorkItems={sprintWorkItemsBySprint[s.sprintID] ?? []}
                                                        onRemoveFromSprint={(id, typeName) => void handleRemoveFromSprint(id, typeName)}
                                                        me={me}
                                                        canManage={canManage}
                                                        onAssignAssignee={(id) => openAssigneePicker(id, s.teamID)}
                                                        onOpenDetail={setDetailItem}
                                                    />
                                                )}
                                                {canManage && s.status !== 'Completed' && (
                                                    <div className="bv2-sp-action-bar">
                                                        {s.status === 'Planned' && canStartStop && (
                                                            <button className="bv2-btn-primary" type="button" style={{ fontSize: '0.75rem', padding: '5px 11px' }} onClick={() => void handleSprintLifecycle('start', s.sprintID)}>Start Sprint</button>
                                                        )}
                                                        {s.status === 'Active' && canStartStop && (
                                                            <>
                                                                <button className="bv2-btn-ghost" type="button" onClick={() => void handleSprintLifecycle('stop', s.sprintID)}>Stop</button>
                                                                <button className="bv2-btn-primary" type="button" style={{ fontSize: '0.75rem', padding: '5px 11px' }} onClick={() => void handleSprintLifecycle('complete', s.sprintID)}>Complete</button>
                                                            </>
                                                        )}
                                                        <button className="bv2-btn-ghost" type="button" onClick={() => void openManageFor(s)}>Manage</button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* ── Sprint Context Menu (portal) ── */}
            {sprintMenuAnchor !== null && createPortal(
                (() => {
                    const s = sprints.find(x => x.sprintID === sprintMenuAnchor.sprintId);
                    if (!s) return null;
                    const canManage = canManageSprint(me, s);
                    const canStartStop = canStartStopSprint(me, s);
                    const canDelete = canDeleteSprint(me, s);
                    const close = () => setSprintMenuAnchor(null);
                    const guard = (perm: boolean, fn: () => void) => { if (!perm) return; close(); fn(); };
                    return (
                        <div
                            ref={sprintMenuRef}
                            className="adm-picker-menu"
                            style={{ position: 'fixed', top: sprintMenuAnchor.top, right: sprintMenuAnchor.right, zIndex: 5000, minWidth: '11.5rem' }}
                            role="menu"
                            aria-label="Sprint actions"
                        >
                            {s.status === 'Planned' && (
                                <button type="button" role="menuitem" className="adm-picker-option" disabled={!canStartStop}
                                    onClick={() => guard(canStartStop, () => void handleSprintLifecycle('start', s.sprintID))}>
                                    Start Sprint
                                </button>
                            )}
                            {s.status === 'Active' && (
                                <>
                                    <button type="button" role="menuitem" className="adm-picker-option" disabled={!canStartStop}
                                        onClick={() => guard(canStartStop, () => void handleSprintLifecycle('stop', s.sprintID))}>
                                        Stop Sprint
                                    </button>
                                    <button type="button" role="menuitem" className="adm-picker-option" disabled={!canStartStop}
                                        onClick={() => guard(canStartStop, () => void handleSprintLifecycle('complete', s.sprintID))}>
                                        Complete Sprint
                                    </button>
                                </>
                            )}
                            <button type="button" role="menuitem" className="adm-picker-option"
                                onClick={() => { close(); void openManageFor(s); }}>
                                {canManage ? 'Manage Sprint' : 'View Sprint'}
                            </button>
                            {canManage && (
                                <button type="button" role="menuitem" className="adm-picker-option sprint-picker-option--danger"
                                    disabled={!canDelete}
                                    onClick={() => guard(canDelete, () => setDeleteConfirmSprintId(s.sprintID))}>
                                    Delete Sprint
                                </button>
                            )}
                        </div>
                    );
                })(),
                document.body
            )}

            {/* ── Modals ────────────────────────── */}

            {addItemTarget === 'epic' && createPortal(
                <CreateEpicModal onClose={() => { setAddItemTarget(null); void loadEpics(); }} onCreated={() => showStatus({ kind: 'success', message: 'Epic created.' })} />,
                document.body
            )}
            {addItemTarget === 'workitem' && createPortal(
                <CreateWorkItemModal onClose={() => { setAddItemTarget(null); void loadBacklog(); }} onCreated={() => showStatus({ kind: 'success', message: 'Work item created.' })} />,
                document.body
            )}
            {addItemTarget === 'sprint' && createPortal(
                <CreateSprintModal
                    onClose={() => { setAddItemTarget(null); void loadSprints(); }}
                    onCreated={() => showStatus({ kind: 'success', message: 'Sprint created.' })}
                    defaultManagedByUserId={me?.userID ?? null}
                    defaultManagerDisplayName={me?.fullName ?? ''}
                />,
                document.body
            )}

            {detailItem && createPortal((() => {
                const canEdit = isAdminOrSM;
                const itemSprint = sprints.find(s => s.sprintID === detailItem.sprintID) ?? null;
                return (
                    <WorkItemDetailModal
                        item={detailItem}
                        onClose={() => setDetailItem(null)}
                        onSaved={async () => { if (detailItem.sprintID) await refreshExpandedSprints([detailItem.sprintID]); }}
                        canManage={canEdit}
                        canEdit={canEdit}
                        canChangeAssignee={canEdit}
                        currentUser={me ? { userID: me.userID, roleName: me.roleName } : null}
                        currentSprint={itemSprint}
                    />
                );
            })(), document.body)}

            {viewEpicId !== null && createPortal(
                <ViewEpicModal 
                    epicId={viewEpicId} 
                    onClose={() => { 
                        setViewEpicId(null); 
                        void loadEpics(); // Refresh epic cards when modal closes
                    }} 
                />,
                document.body
            )}

            {deleteConfirmSprintId !== null && createPortal(
                <DeleteSprintConfirmModal
                    onClose={() => setDeleteConfirmSprintId(null)}
                    onConfirm={() => { const id = deleteConfirmSprintId; if (id == null) return; void handleSprintDelete(id); }}
                />,
                document.body
            )}

            {dragConfirm && createPortal((() => {
                const story = backlogItems.find(i => i.workItemID === dragConfirm.workItemId) ?? Object.values(sprintWorkItemsBySprint).flat().find(i => i.workItemID === dragConfirm.workItemId);
                return (
                    <div className="wi-modal-overlay" role="dialog" aria-modal="true">
                        <div className="confirm-modal-card">
                            <h3 className="confirm-modal-title">Assign Story with Children?</h3>
                            <p className="confirm-modal-message">
                                Dragging <strong>"{story?.title}"</strong> into a sprint will also assign all its child tasks to the sprint. Do you want to proceed?
                            </p>
                            <div className="confirm-modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setDragConfirm(null)}>Cancel</button>
                                <button type="button" className="btn btn-primary" onClick={() => void confirmDragAssign()}>Assign</button>
                            </div>
                        </div>
                    </div>
                );
            })(), document.body)}

            {teamMismatchConfirm && createPortal((() => {
                const item = backlogItems.find(i => i.workItemID === teamMismatchConfirm.workItemId) ?? Object.values(sprintWorkItemsBySprint).flat().find(i => i.workItemID === teamMismatchConfirm.workItemId);
                return (
                    <div className="wi-modal-overlay" role="dialog" aria-modal="true">
                        <div className="confirm-modal-card">
                            <h3 className="confirm-modal-title">Team Mismatch Warning</h3>
                            <p className="confirm-modal-message">
                                The work item <strong>"{item?.title}"</strong> is assigned to a user from a different team than the target sprint. Are you sure you want to proceed?
                            </p>
                            <div className="confirm-modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setTeamMismatchConfirm(null)}>Cancel</button>
                                <button type="button" className="btn btn-primary" onClick={() => void confirmTeamMismatchAssign()}>Confirm</button>
                            </div>
                        </div>
                    </div>
                );
            })(), document.body)}

            {removeConfirm && createPortal((() => {
                return (
                    <div className="wi-modal-overlay" role="dialog" aria-modal="true">
                        <div className="confirm-modal-card">
                            <h3 className="confirm-modal-title">Remove Story with Children?</h3>
                            <p className="confirm-modal-message">
                                Removing <strong>"{removeConfirm.title}"</strong> from the sprint will also remove all its child tasks. Do you want to proceed?
                            </p>
                            <div className="confirm-modal-actions">
                                <button type="button" className="btn btn-secondary" onClick={() => setRemoveConfirm(null)}>Cancel</button>
                                <button type="button" className="btn btn-danger" onClick={() => void confirmRemoveAssign()}>Remove</button>
                            </div>
                        </div>
                    </div>
                );
            })(), document.body)}

            {manageOpen && manageSprintId !== null && createPortal(
                <ManageSprintModal
                    onClose={resetManage}
                    manageSprintId={manageSprintId}
                    manageSprintData={manageSprintData}
                    manageSprintName={manageSprintName}
                    setManageSprintName={setManageSprintName}
                    manageGoal={manageGoal}
                    setManageGoal={setManageGoal}
                    manageStartDate={manageStartDate}
                    setManageStartDate={setManageStartDate}
                    manageEndDate={manageEndDate}
                    setManageEndDate={setManageEndDate}
                    manageManagedBy={manageManagedBy}
                    setManageManagedBy={setManageManagedBy}
                    manageTeamId={manageTeamId}
                    setManageTeamId={setManageTeamId}
                    manageLoading={manageLoading}
                    manageError={manageError}
                    onSave={async (patch) => { await saveManage(patch); }}
                    onRemoveWorkItem={(workItemId, typeName) => void handleRemoveFromSprint(workItemId, typeName)}
                    me={me}
                />,
                document.body
            )}

            {assigneePickerOpen && assigneeTargetWorkItemId !== null && createPortal(
                <AssigneePickerModal
                    onClose={() => { setAssigneePickerOpen(false); setAssigneeTargetWorkItemId(null); }}
                    assigneeSearch={assigneeSearch}
                    setAssigneeSearch={setAssigneeSearch}
                    assigneeUsers={assigneeUsers}
                    assigneeLoading={assigneeLoading}
                    assigneeError={assigneeError}
                    onSelectAssignee={id => void selectAssignee(id)}
                />,
                document.body
            )}
        </div>
    );
}