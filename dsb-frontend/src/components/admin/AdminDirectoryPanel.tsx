import { useState, useMemo, useCallback, useEffect, type FormEvent } from 'react';
import * as signalR from '@microsoft/signalr';
import '../../styles/admin.css';
import * as adminApi from '../../services/adminApi';
import { ApiError } from '../../services/apiClient';
import { notifyNotificationsMayHaveChanged } from '../../api/notificationsApi';
import { useAuth } from '../../context/AuthContext';
import { getNotificationHubConnection } from '../../services/notificationHub';
import { validateEmailAddress } from '../../utils/validateEmail';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface User {
    id: number;
    fullName: string;
    email: string;
    roleID: number;
    roleName: string;
    teamID: number | null;
    teamName: string | null;
    isActive: boolean;
    isLocked: boolean;
    mustChangePassword: boolean;
    emailVerified: boolean;
}

interface Team {
    id: number;
    name: string;
}

interface Role {
    id: number;
    name: string;
    description: string;
}

type AdminTab = 'users' | 'teams' | 'roles';
type SortKey = 'name' | 'role' | 'team' | 'status';
type FilterKey = 'all' | 'active' | 'locked' | 'pending-pw' | 'inactive' | 'unverified';
type ConfirmAction = 'disable' | 'enable' | 'lock' | 'unlock';

// ─────────────────────────────────────────────
// API mappers
// ─────────────────────────────────────────────

const NO_ACCESS_CHANGES_MESSAGE = 'No access changes were applied.';

function assertUserAccessWasUpdated(result: adminApi.PatchUserAccessResponse | undefined): void {
    if (result?.message === NO_ACCESS_CHANGES_MESSAGE) {
        throw new ApiError(
            'No changes were applied. Try refreshing the page if the list looks out of date.',
            400,
        );
    }
}

function mapApiUser(row: adminApi.UserAdminListItem): User {
    const parts = [row.firstName, row.middleName, row.nameExtension, row.lastName]
        .map((x) => (x == null ? '' : String(x).trim()))
        .filter(Boolean);
    const fullName = parts.join(' ').replace(/\s+/g, ' ').trim() || row.emailAddress;
    const teamID = row.teamID == null ? null : Number(row.teamID);
    return {
        id: row.userID,
        fullName,
        email: row.emailAddress,
        roleID: row.roleID,
        roleName: row.roleName,
        teamID: Number.isFinite(teamID) ? teamID : null,
        teamName: row.teamName,
        isActive: !row.disabled,
        isLocked: row.isLocked,
        mustChangePassword: row.mustChangePassword,
        emailVerified: row.emailVerified,
    };
}

function mapApiTeam(row: adminApi.TeamListItem): Team {
    return { id: row.teamID, name: row.teamName };
}

function mapApiRole(row: adminApi.RoleListItem): Role {
    return {
        id: row.roleID,
        name: row.roleName,
        description: (row.description ?? '').trim(),
    };
}

/** Seeded placeholder team — members are shown as unassigned in admin UI. */
function isDefaultTeamName(name: string): boolean {
    return name.trim().toLowerCase() === 'default team';
}

function getDefaultTeamId(teams: Team[]): number | null {
    const t = teams.find((x) => isDefaultTeamName(x.name));
    return t?.id ?? null;
}

function isEffectivelyUnassigned(user: User, defaultTeamId: number | null): boolean {
    if (user.teamID == null) return true;
    // TeamID=1 is the Default Team — semantically "unassigned"
    if (user.teamID === 1) return true;
    if (defaultTeamId != null && user.teamID === defaultTeamId) return true;
    return false;
}

function teamLabelForDisplay(user: User, defaultTeamId: number | null): string | null {
    if (isEffectivelyUnassigned(user, defaultTeamId)) return null;
    return user.teamName;
}

function teamSortKey(user: User, defaultTeamId: number | null): string {
    if (isEffectivelyUnassigned(user, defaultTeamId)) return '';
    return (user.teamName ?? '').toLowerCase();
}

/** Dot / accent color from team name: color words + stable fallback palette aligned with admin UI. */
function getTeamAccentColor(teamName: string): string {
    const raw = teamName.trim();
    if (!raw) return 'var(--form-text-muted)';
    if (isDefaultTeamName(raw)) return 'var(--form-text-muted)';
    const n = raw.toLowerCase();

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
        teamAccentFromHash(n)
    );
}

function teamAccentFromHash(normalizedName: string): string {
    const palette = [
        'var(--accent-gold)',
        '#7C3AED',
        '#2563EB',
        '#059669',
        '#DB2777',
        '#EA580C',
        '#0D9488',
        '#CA8A04',
        '#4F46E5',
        '#DC2626',
    ];
    let h = 0;
    for (let i = 0; i < normalizedName.length; i += 1) {
        h = normalizedName.charCodeAt(i) + ((h << 5) - h);
    }
    return palette[Math.abs(h) % palette.length];
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getInitials(name: string): string {
    return name
        .split(' ')
        .map((n) => n[0] ?? '')
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

function getRoleColor(roleName: string): string {
    const map: Record<string, string> = {
        Administrator: 'var(--accent-red)',
        'Scrum Master': 'var(--accent-gold)',
        Developer: '#3B82F6',
        'QA Engineer': '#8B5CF6',
    };
    return map[roleName] ?? 'var(--form-text-muted)';
}

function getRoleTag(roleName: string): string {
    const map: Record<string, string> = {
        Administrator: 'Admin',
        'Scrum Master': 'SM',
        Developer: 'Dev',
        'QA Engineer': 'QA',
        Employee: 'Emp',
    };
    return map[roleName] ?? roleName;
}

// ─────────────────────────────────────────────
// StatusBadge
// ─────────────────────────────────────────────

type BadgeVariant = 'active' | 'inactive' | 'locked' | 'pending-pw' | 'unverified';

function StatusBadge({ variant, label }: { variant: BadgeVariant; label: string }) {
    return <span className={`adm-badge adm-badge--${variant}`}>{label}</span>;
}

// ─────────────────────────────────────────────
// UserAvatar
// ─────────────────────────────────────────────

function UserAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
    return (
        <div className={`adm-avatar adm-avatar--${size}`} aria-hidden="true">
            {getInitials(name)}
        </div>
    );
}

// ─────────────────────────────────────────────
// UserDetailPanel
// ─────────────────────────────────────────────

interface UserDetailPanelProps {
    user: User;
    defaultTeamId: number | null;
    onClose: () => void;
    onRefresh: () => Promise<void>;
}

function UserDetailPanel({ user, defaultTeamId, onClose, onRefresh }: UserDetailPanelProps) {
    const [confirming, setConfirming] = useState<ConfirmAction | null>(null);

    const handleAction = async (action: ConfirmAction) => {
        if (confirming !== action) {
            setConfirming(action);
            return;
        }
        try {
            switch (action) {
                case 'disable':
                    await adminApi.disableUser(user.id);
                    break;
                case 'enable':
                    await adminApi.enableUser(user.id);
                    break;
                case 'lock':
                    await adminApi.forceLockout(user.id);
                    break;
                case 'unlock':
                    await adminApi.unlockUser(user.id);
                    break;
            }
            await onRefresh();
            setConfirming(null);
        } catch (e) {
            console.error(e);
            setConfirming(null);
        }
    };

    const confirmHint: Record<ConfirmAction, string> = {
        disable: 'This will prevent the user from signing in to the workspace.',
        enable: "This will restore the user's full access to the workspace.",
        lock: 'This will immediately lock the user out of their account.',
        unlock: 'This will allow the user to sign in with their credentials again.',
    };

    const teamDisplay = teamLabelForDisplay(user, defaultTeamId);

    return (
        <div className="ud-panel" key={user.id}>
            <div className="ud-header">
                <span className="ud-header-label">User Details</span>
                <button className="adm-icon-btn" onClick={onClose} aria-label="Close panel">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                </button>
            </div>

            <div className="ud-body">
                {/* Identity */}
                <div className="ud-identity">
                    <UserAvatar name={user.fullName} size="lg" />
                    <div className="ud-identity-info">
                        <h2 className="ud-name">{user.fullName}</h2>
                        <span className="ud-email">{user.email}</span>
                    </div>
                </div>

                {/* Status badges */}
                <div className="ud-badges">
                    <StatusBadge variant={user.isActive ? 'active' : 'inactive'} label={user.isActive ? 'Active' : 'Inactive'} />
                    {user.isLocked && <StatusBadge variant="locked" label="Locked" />}
                    {user.mustChangePassword && <StatusBadge variant="pending-pw" label="PW Change Required" />}
                    {!user.emailVerified && <StatusBadge variant="unverified" label="Email Unverified" />}
                </div>

                {/* Account info */}
                <div className="ud-section">
                    <h3 className="ud-section-title">Account Info</h3>
                    <div className="ud-fields">
                        <div className="ud-field">
                            <span className="ud-field-label">Role</span>
                            <span className="ud-field-value" style={{ color: getRoleColor(user.roleName) }}>
                                {user.roleName}
                            </span>
                        </div>
                        <div className="ud-field">
                            <span className="ud-field-label">Team</span>
                            <span className="ud-field-value ud-field-value--team">
                                {teamDisplay ? (
                                    <>
                                        <span
                                            className="ud-team-dot"
                                            style={{ background: getTeamAccentColor(teamDisplay) }}
                                            aria-hidden="true"
                                        />
                                        {teamDisplay}
                                    </>
                                ) : (
                                    <em className="ud-field-empty">Unassigned</em>
                                )}
                            </span>
                        </div>
                        <div className="ud-field">
                            <span className="ud-field-label">Email Verified</span>
                            <span className="ud-field-value">{user.emailVerified ? 'Yes' : 'No'}</span>
                        </div>
                        <div className="ud-field">
                            <span className="ud-field-label">Pending PW</span>
                            <span className="ud-field-value">{user.mustChangePassword ? 'Yes' : 'No'}</span>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="ud-section">
                    <h3 className="ud-section-title">Account Actions</h3>
                    <div className="ud-actions">
                        {/* Enable / Disable */}
                        <div className="ud-action-row">
                            <div className="ud-action-desc">
                                <span className="ud-action-label">
                                    {user.isActive ? 'Disable Account' : 'Enable Account'}
                                </span>
                                <span className="ud-action-hint">
                                    {user.isActive ? 'Prevents the user from signing in' : 'Restores access to the workspace'}
                                </span>
                            </div>
                            <div className="ud-action-btns">
                                {confirming === (user.isActive ? 'disable' : 'enable') && (
                                    <button
                                        className="adm-btn adm-btn--ghost"
                                        onClick={() => setConfirming(null)}
                                    >
                                        Cancel
                                    </button>
                                )}
                                <button
                                    className={`adm-btn ${user.isActive
                                        ? confirming === 'disable' ? 'adm-btn--danger-solid' : 'adm-btn--danger'
                                        : confirming === 'enable' ? 'adm-btn--success-solid' : 'adm-btn--success'
                                        }`}
                                    onClick={() => handleAction(user.isActive ? 'disable' : 'enable')}
                                >
                                    {user.isActive
                                        ? confirming === 'disable' ? 'Confirm Disable' : 'Disable'
                                        : confirming === 'enable' ? 'Confirm Enable' : 'Enable'}
                                </button>
                            </div>
                        </div>

                        {/* Lock / Unlock */}
                        <div className="ud-action-row">
                            <div className="ud-action-desc">
                                <span className="ud-action-label">
                                    {user.isLocked ? 'Unlock Account' : 'Lock Account'}
                                </span>
                                <span className="ud-action-hint">
                                    {user.isLocked ? 'Allows the user to sign in again' : 'Immediately locks the user out'}
                                </span>
                            </div>
                            <div className="ud-action-btns">
                                {confirming === (user.isLocked ? 'unlock' : 'lock') && (
                                    <button
                                        className="adm-btn adm-btn--ghost"
                                        onClick={() => setConfirming(null)}
                                    >
                                        Cancel
                                    </button>
                                )}
                                <button
                                    className={`adm-btn ${user.isLocked
                                        ? confirming === 'unlock' ? 'adm-btn--warning-solid' : 'adm-btn--warning'
                                        : confirming === 'lock' ? 'adm-btn--danger-solid' : 'adm-btn--danger'
                                        }`}
                                    onClick={() => handleAction(user.isLocked ? 'unlock' : 'lock')}
                                >
                                    {user.isLocked
                                        ? confirming === 'unlock' ? 'Confirm Unlock' : 'Unlock'
                                        : confirming === 'lock' ? 'Confirm Lock' : 'Lock'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {confirming && (
                        <div className="ud-confirm-hint" role="alert">
                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                                <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2" />
                                <line x1="6.5" y1="4.5" x2="6.5" y2="7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                                <circle cx="6.5" cy="9" r="0.6" fill="currentColor" />
                            </svg>
                            {confirmHint[confirming]} Click the button again to confirm.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// UserManagementTab
// ─────────────────────────────────────────────

interface UserManagementTabProps {
    users: User[];
    teams: Team[];
    onRefreshDirectory: () => Promise<void>;
}

function UserManagementTab({ users, teams, onRefreshDirectory }: UserManagementTabProps) {
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('name');
    const [filterKey, setFilterKey] = useState<FilterKey>('active');
    const [teamFilter, setTeamFilter] = useState<string>('all');
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

    const defaultTeamId = useMemo(() => getDefaultTeamId(teams), [teams]);

    const selectedUser = selectedUserId != null ? users.find((u) => u.id === selectedUserId) ?? null : null;

    const filterCounts = useMemo(() => ({
        active: users.filter((u) => u.isActive).length,
        locked: users.filter((u) => u.isLocked).length,
        'pending-pw': users.filter((u) => u.mustChangePassword).length,
        inactive: users.filter((u) => !u.isActive).length,
        unverified: users.filter((u) => !u.emailVerified).length,
    }), [users]);

    const filtered = useMemo(() => {
        let result = [...users];

        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(
                (u) =>
                    u.fullName.toLowerCase().includes(q) ||
                    u.email.toLowerCase().includes(q),
            );
        }

        switch (filterKey) {
            case 'active': result = result.filter((u) => u.isActive); break;
            case 'locked': result = result.filter((u) => u.isActive && u.isLocked); break;
            case 'pending-pw': result = result.filter((u) => u.isActive && u.mustChangePassword); break;
            case 'inactive': result = result.filter((u) => !u.isActive); break;
            case 'unverified': result = result.filter((u) => u.isActive && !u.emailVerified); break;
        }

        if (teamFilter === 'none') {
            result = result.filter((u) => isEffectivelyUnassigned(u, defaultTeamId));
        } else if (teamFilter !== 'all') {
            result = result.filter((u) => String(u.teamID) === teamFilter);
        }

        result.sort((a, b) => {
            switch (sortKey) {
                case 'name': return a.fullName.localeCompare(b.fullName);
                case 'role': return a.roleName.localeCompare(b.roleName);
                case 'team': return teamSortKey(a, defaultTeamId).localeCompare(teamSortKey(b, defaultTeamId));
                case 'status': return Number(!a.isActive) - Number(!b.isActive);
                default: return 0;
            }
        });

        return result;
    }, [users, search, sortKey, filterKey, teamFilter, defaultTeamId]);

    const filterLabels: Record<FilterKey, string> = {
        all: 'All users',
        active: `Active${filterCounts.active ? ` · ${filterCounts.active}` : ''}`,
        locked: `Locked${filterCounts.locked ? ` · ${filterCounts.locked}` : ''}`,
        'pending-pw': `PW Pending${filterCounts['pending-pw'] ? ` · ${filterCounts['pending-pw']}` : ''}`,
        inactive: `Inactive${filterCounts.inactive ? ` · ${filterCounts.inactive}` : ''}`,
        unverified: `Unverified${filterCounts.unverified ? ` · ${filterCounts.unverified}` : ''}`,
    };

    return (
        <div className="um-root">
            {/* Left panel */}
            <div className={`um-left${selectedUser ? ' um-left--narrow' : ''}`}>
                {/* Search */}
                <div className="um-search">
                    <div className="adm-search-wrap">
                        <svg className="adm-search-icon" width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                            <path d="M10 10L13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                        <input
                            type="search"
                            className="adm-search-input"
                            placeholder="Search by name or email…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            aria-label="Search users"
                        />
                    </div>
                </div>

                {/* Filter chips */}
                <div className="um-filters">
                    {(Object.keys(filterLabels) as FilterKey[]).map((f) => (
                        <button
                            key={f}
                            className={`adm-chip${filterKey === f ? ' adm-chip--active' : ''}`}
                            onClick={() => setFilterKey(f)}
                        >
                            {filterLabels[f]}
                        </button>
                    ))}
                </div>

                {/* Sort + team filter */}
                <div className="um-sort-row">
                    <select
                        className="adm-select"
                        value={sortKey}
                        onChange={(e) => setSortKey(e.target.value as SortKey)}
                        aria-label="Sort by"
                    >
                        <option value="name">Sort: Name</option>
                        <option value="role">Sort: Role</option>
                        <option value="team">Sort: Team</option>
                        <option value="status">Sort: Status</option>
                    </select>
                    <select
                        className="adm-select"
                        value={teamFilter}
                        onChange={(e) => setTeamFilter(e.target.value)}
                        aria-label="Filter by team"
                    >
                        <option value="all">All teams</option>
                        <option value="none">Unassigned</option>
                        {teams
                            .filter((t) => !isDefaultTeamName(t.name))
                            .map((t) => (
                                <option key={t.id} value={String(t.id)}>
                                    {t.name}
                                </option>
                            ))}
                    </select>
                </div>

                {/* Count */}
                <div className="um-list-meta">
                    {filtered.length} {filtered.length === 1 ? 'user' : 'users'}
                </div>

                {/* User list */}
                <div className="um-list" role="list">
                    {filtered.length === 0 ? (
                        <div className="adm-empty">
                            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true" style={{ opacity: 0.3, marginBottom: 8 }}>
                                <circle cx="13" cy="12" r="7" stroke="currentColor" strokeWidth="1.5" />
                                <path d="M2 28c0-5.523 4.477-9 11-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                <path d="M24 22l6 6M30 22l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            No users match your filters
                        </div>
                    ) : (
                        filtered.map((user) => {
                            const hasIssue = !user.isActive || user.isLocked || user.mustChangePassword || !user.emailVerified;
                            const isSelected = selectedUser?.id === user.id;

                            return (
                                <button
                                    key={user.id}
                                    role="listitem"
                                    className={`um-row${isSelected ? ' um-row--selected' : ''}`}
                                    onClick={() =>
                                        setSelectedUserId(isSelected ? null : user.id)
                                    }
                                    aria-pressed={isSelected}
                                >
                                    <UserAvatar name={user.fullName} size="sm" />
                                    <div className="um-row-info">
                                        <span className="um-row-name">{user.fullName}</span>
                                        <span className="um-row-email">{user.email}</span>
                                    </div>
                                    <div className="um-row-right">
                                        <span
                                            className="um-row-role-tag"
                                            style={{ color: getRoleColor(user.roleName) }}
                                        >
                                            {getRoleTag(user.roleName)}
                                        </span>
                                        {hasIssue && (
                                            <span className="um-row-alert-dot" aria-label="Account has issues" />
                                        )}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Right panel: user detail */}
            {selectedUser && (
                <UserDetailPanel
                    user={selectedUser}
                    defaultTeamId={defaultTeamId}
                    onClose={() => setSelectedUserId(null)}
                    onRefresh={onRefreshDirectory}
                />
            )}

            {/* Empty detail state */}
            {!selectedUser && (
                <div className="um-detail-empty">
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
                        <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 3" />
                        <circle cx="20" cy="16" r="6" stroke="currentColor" strokeWidth="1.2" />
                        <path d="M8 33c0-6.627 5.373-10 12-10s12 3.373 12 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                    <span>Select a user to view details</span>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────
// TeamManagementTab
// ─────────────────────────────────────────────

interface TeamManagementTabProps {
    users: User[];
    teams: Team[];
    currentUserId?: number | null;
    onAssignTeam: (user: User, teamId: number) => Promise<void>;
    onRemoveFromTeam: (user: User) => Promise<void>;
    onCreateTeam: (name: string) => Promise<void>;
    onDeleteTeam: (team: Team) => Promise<adminApi.DeleteTeamResponse>;
}

type TeamMgmtBanner = { kind: 'success' | 'error'; text: string };

function TeamManagementTab({ users, teams, currentUserId, onAssignTeam, onRemoveFromTeam, onCreateTeam, onDeleteTeam }: TeamManagementTabProps) {
    const [creatingTeam, setCreatingTeam] = useState(false);
    const [newTeamName, setNewTeamName] = useState('');
    const [newTeamError, setNewTeamError] = useState('');
    const [expandedTeamIds, setExpandedTeamIds] = useState<Set<number>>(() => new Set());
    const [banner, setBanner] = useState<TeamMgmtBanner | null>(null);
    const [openMovePickerKey, setOpenMovePickerKey] = useState<string | null>(null);
    const [pendingDeleteTeam, setPendingDeleteTeam] = useState<Team | null>(null);
    const [deletingTeam, setDeletingTeam] = useState(false);
    const defaultTeamId = useMemo(() => getDefaultTeamId(teams), [teams]);
    const displayTeams = useMemo(() => teams.filter((t) => !isDefaultTeamName(t.name)), [teams]);

    const unassigned = useMemo(
        () => users.filter((u) => u.isActive && isEffectivelyUnassigned(u, defaultTeamId)),
        [users, defaultTeamId],
    );

    useEffect(() => {
        setExpandedTeamIds((prev) => {
            if (displayTeams.length === 0) return new Set();
            if (prev.size > 0) {
                // Keep only teams that still exist
                const valid = new Set([...prev].filter((id) => displayTeams.some((t) => t.id === id)));
                return valid;
            }
            // Expand first team by default on initial load
            return new Set([displayTeams[0].id]);
        });
    }, [displayTeams]);

    useEffect(() => {
        if (!openMovePickerKey) return;
        const onDocPointerDown = (e: MouseEvent) => {
            const t = e.target as HTMLElement | null;
            if (!t) return;
            if (t.closest(`[data-tm-move-picker="${openMovePickerKey}"]`)) return;
            setOpenMovePickerKey(null);
        };
        document.addEventListener('mousedown', onDocPointerDown);
        return () => document.removeEventListener('mousedown', onDocPointerDown);
    }, [openMovePickerKey]);

    const handleCreateTeam = async () => {
        if (!newTeamName.trim()) {
            setNewTeamError('Team name is required.');
            return;
        }
        try {
            await onCreateTeam(newTeamName.trim());
            setNewTeamName('');
            setNewTeamError('');
            setCreatingTeam(false);
        } catch (e) {
            setNewTeamError(e instanceof ApiError ? e.message : 'Failed to create team.');
        }
    };

    const handleRemoveFromTeam = async (u: User) => {
        setBanner(null);
        if (currentUserId != null && u.id === currentUserId) {
            setBanner({ kind: 'error', text: 'You cannot change your own team from Team Management.' });
            return;
        }
        try {
            await onRemoveFromTeam(u);
            setBanner({ kind: 'success', text: `${u.fullName} is now unassigned.` });
            notifyNotificationsMayHaveChanged();
        } catch (err) {
            setBanner({
                kind: 'error',
                text: err instanceof ApiError ? err.message : 'Failed to unassign user.',
            });
        }
    };

    const handleAssignToTeam = async (u: User, teamId: number, teamName: string) => {
        setBanner(null);
        if (currentUserId != null && u.id === currentUserId) {
            setBanner({ kind: 'error', text: 'You cannot change your own team from Team Management.' });
            return;
        }
        try {
            await onAssignTeam(u, teamId);
            setBanner({ kind: 'success', text: `Assigned ${u.fullName} to ${teamName}.` });
            notifyNotificationsMayHaveChanged();
        } catch (err) {
            setBanner({
                kind: 'error',
                text: err instanceof ApiError ? err.message : 'Failed to assign user to team.',
            });
        }
    };

    const pendingDeleteMembers = useMemo(() => {
        if (!pendingDeleteTeam) return [];
        return users.filter((u) => u.isActive && u.teamID === pendingDeleteTeam.id);
    }, [pendingDeleteTeam, users]);

    const handleConfirmDeleteTeam = async () => {
        if (!pendingDeleteTeam || deletingTeam) return;
        setBanner(null);
        setDeletingTeam(true);
        try {
            const result = await onDeleteTeam(pendingDeleteTeam);
            setPendingDeleteTeam(null);
            if (result.reassignedCount > 0) {
                setBanner({
                    kind: 'success',
                    text: `Deleted ${result.teamName}. ${result.reassignedCount} member(s) were moved to Unassigned (Default Team).`,
                });
            } else {
                setBanner({ kind: 'success', text: `Deleted ${result.teamName}.` });
            }
            notifyNotificationsMayHaveChanged();
        } catch (err) {
            setBanner({
                kind: 'error',
                text: err instanceof ApiError ? err.message : 'Failed to delete team.',
            });
        } finally {
            setDeletingTeam(false);
        }
    };

    return (
        <div className="tm-root">
            {/* Header */}
            <div className="tm-header">
                <div>
                    <h2 className="adm-section-title">Team Management</h2>
                    <p className="adm-section-sub">
                        {displayTeams.length} team{displayTeams.length !== 1 ? 's' : ''} ·{' '}
                        {users.length} member{users.length !== 1 ? 's' : ''} ·{' '}
                        {unassigned.length} unassigned
                    </p>
                </div>
                <button
                    className="adm-btn adm-btn--primary"
                    onClick={() => {
                        setCreatingTeam(true);
                        setNewTeamName('');
                        setNewTeamError('');
                        setBanner(null);
                    }}
                >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                        <path d="M6.5 1.5v10M1.5 6.5h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    New Team
                </button>
            </div>

            {banner ? (
                <div
                    className={`adm-flash${banner.kind === 'success' ? ' adm-flash--success' : ' adm-flash--error'}`}
                    role={banner.kind === 'success' ? 'status' : 'alert'}
                    aria-live="polite"
                >
                    <span>{banner.text}</span>
                    <button
                        type="button"
                        className="adm-flash-dismiss"
                        onClick={() => setBanner(null)}
                        aria-label="Dismiss notice"
                    >
                        Dismiss
                    </button>
                </div>
            ) : null}

            {/* Create team inline form */}
            {creatingTeam && (
                <div className="tm-create-form">
                    <div className="adm-field">
                        <label className="adm-label" htmlFor="new-team-name">
                            Team name
                        </label>
                        <input
                            id="new-team-name"
                            type="text"
                            className={`adm-input${newTeamError ? ' adm-input--error' : ''}`}
                            placeholder="e.g. Team Delta"
                            value={newTeamName}
                            onChange={(e) => {
                                setNewTeamName(e.target.value);
                                setNewTeamError('');
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleCreateTeam();
                                if (e.key === 'Escape') setCreatingTeam(false);
                            }}
                            autoFocus
                        />
                        {newTeamError && (
                            <span className="adm-field-error" role="alert">
                                {newTeamError}
                            </span>
                        )}
                    </div>
                    <div className="tm-create-actions">
                        <button className="adm-btn adm-btn--primary" onClick={handleCreateTeam}>
                            Create Team
                        </button>
                        <button
                            className="adm-btn adm-btn--ghost"
                            onClick={() => setCreatingTeam(false)}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Scrollable content */}
            <div className="tm-content">
                {displayTeams.length === 0 ? (
                    <p className="adm-section-sub" style={{ margin: '0 0 10px' }}>
                        No named teams yet — create one above. Users on the default group appear under Unassigned.
                    </p>
                ) : null}
                {/* Team cards */}
                <div className="tm-grid">
                    {displayTeams.map((team) => {
                        const members = users.filter((u) => u.isActive && u.teamID != null && u.teamID === team.id);
                        const isExpanded = expandedTeamIds.has(team.id);
                        const moveTargets = displayTeams.filter((t) => t.id !== team.id);

                        return (
                            <div key={team.id} className={`tm-card${isExpanded ? ' tm-card--expanded' : ''}`}>
                                <button
                                    className="tm-card-header"
                                    onClick={() => {
                                        setExpandedTeamIds((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(team.id)) {
                                                next.delete(team.id);
                                            } else {
                                                next.add(team.id);
                                            }
                                            return next;
                                        });
                                    }}
                                    aria-expanded={isExpanded}
                                >
                                    <div className="tm-card-title">
                                        <span
                                            className="tm-card-dot"
                                            style={{ background: getTeamAccentColor(team.name) }}
                                        />
                                        <span className="tm-card-name">{team.name}</span>
                                        <span className="tm-member-pill">
                                            {members.length}
                                        </span>
                                    </div>
                                    <div className="tm-card-header-actions">
                                        <button
                                            type="button"
                                            className="adm-btn adm-btn--danger tm-delete-team-btn"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setPendingDeleteTeam(team);
                                            }}
                                        >
                                            Delete Team
                                        </button>
                                    <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 14 14"
                                        fill="none"
                                        style={{
                                            transform: isExpanded ? 'rotate(180deg)' : 'none',
                                            transition: 'transform 0.2s ease',
                                            flexShrink: 0,
                                            color: 'var(--form-text-muted)',
                                        }}
                                    >
                                        <path
                                            d="M2 5l5 4 5-4"
                                            stroke="currentColor"
                                            strokeWidth="1.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                    </div>
                                </button>

                                {isExpanded && (
                                    <div className="tm-member-list">
                                        {members.length === 0 ? (
                                            <div className="adm-empty-sm">No members in this team.</div>
                                        ) : (
                                            members.map((user) => {
                                                const movePickerKey = `${team.id}-${user.id}`;
                                                const movePickerOpen = openMovePickerKey === movePickerKey;
                                                return (
                                                    <div
                                                        key={user.id}
                                                        className={`tm-member-item${movePickerOpen ? ' tm-member-item--move-open' : ''}`}
                                                    >
                                                        <UserAvatar name={user.fullName} size="sm" />
                                                        <div className="tm-member-info">
                                                            <span className="tm-member-name">{user.fullName}</span>
                                                            <span
                                                                className="tm-member-role"
                                                                style={{ color: getRoleColor(user.roleName) }}
                                                            >
                                                                {user.roleName}
                                                            </span>
                                                        </div>
                                                        <div className="tm-member-actions-row">
                                                            <button
                                                                type="button"
                                                                className="tm-member-unassign-btn"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    setOpenMovePickerKey(null);
                                                                    void handleRemoveFromTeam(user);
                                                                }}
                                                            >
                                                                Unassign
                                                            </button>
                                                            {moveTargets.length > 0 ? (
                                                                <div
                                                                    className="tm-member-move-wrap"
                                                                    data-tm-move-picker={movePickerKey}
                                                                >
                                                                    <button
                                                                        type="button"
                                                                        className="adm-icon-btn"
                                                                        aria-expanded={movePickerOpen}
                                                                        aria-haspopup="listbox"
                                                                        aria-label={`Move ${user.fullName} to another team`}
                                                                        title="Move to another team"
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            setOpenMovePickerKey((k) =>
                                                                                k === movePickerKey ? null : movePickerKey,
                                                                            );
                                                                        }}
                                                                    >
                                                                        <svg
                                                                            width="16"
                                                                            height="16"
                                                                            viewBox="0 0 16 16"
                                                                            fill="none"
                                                                            aria-hidden="true"
                                                                        >
                                                                            <path
                                                                                d="M3 5.5h7.5m0 0-2-2m2 2-2 2M13 10.5H5.5m0 0 2-2m-2 2 2 2"
                                                                                stroke="currentColor"
                                                                                strokeWidth="1.35"
                                                                                strokeLinecap="round"
                                                                                strokeLinejoin="round"
                                                                            />
                                                                        </svg>
                                                                    </button>
                                                                    {movePickerOpen ? (
                                                                        <div
                                                                            className="adm-picker-menu"
                                                                            role="listbox"
                                                                            aria-label="Move to team"
                                                                        >
                                                                            {moveTargets.map((t) => (
                                                                                <button
                                                                                    key={t.id}
                                                                                    type="button"
                                                                                    role="option"
                                                                                    className="adm-picker-option"
                                                                                    onClick={(ev) => {
                                                                                        ev.stopPropagation();
                                                                                        setOpenMovePickerKey(null);
                                                                                        void handleAssignToTeam(
                                                                                            user,
                                                                                            t.id,
                                                                                            t.name,
                                                                                        );
                                                                                    }}
                                                                                >
                                                                                    {t.name}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    ) : null}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Unassigned section */}
                {unassigned.length > 0 && (
                    <div className="tm-unassigned">
                        <div className="tm-unassigned-header">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2.5 2" />
                            </svg>
                            Unassigned ({unassigned.length})
                        </div>
                        <div className="tm-unassigned-list">
                            {unassigned.map((user) => (
                                <div key={user.id} className="tm-unassigned-item">
                                    <UserAvatar name={user.fullName} size="sm" />
                                    <div className="tm-member-info">
                                        <span className="tm-member-name">{user.fullName}</span>
                                        <span
                                            className="tm-member-role"
                                            style={{ color: getRoleColor(user.roleName) }}
                                        >
                                            {user.roleName}
                                        </span>
                                    </div>
                                    <select
                                        className="adm-select adm-select--sm"
                                        value=""
                                        onChange={(e) => {
                                            const el = e.target;
                                            const tid = Number(el.value);
                                            const t = teams.find((x) => x.id === tid);
                                            if (t) void handleAssignToTeam(user, tid, t.name);
                                            el.value = '';
                                        }}
                                        aria-label={`Assign ${user.fullName} to a team`}
                                    >
                                        <option value="">Assign to team…</option>
                                        {displayTeams.map((t) => (
                                            <option key={t.id} value={t.id}>
                                                {t.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            {pendingDeleteTeam && (
                <div
                    className="adm-modal-overlay"
                    role="presentation"
                    onMouseDown={(e) => {
                        if (e.target === e.currentTarget && !deletingTeam) {
                            setPendingDeleteTeam(null);
                        }
                    }}
                >
                    <div
                        className="adm-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="adm-delete-team-title"
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="adm-modal-header">
                            <h2 id="adm-delete-team-title" className="adm-modal-title">Delete team</h2>
                            <button
                                type="button"
                                className="adm-icon-btn"
                                onClick={() => setPendingDeleteTeam(null)}
                                aria-label="Close"
                                disabled={deletingTeam}
                            >
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                    <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                            </button>
                        </div>
                        <div className="adm-modal-body">
                            <p className="adm-section-sub">
                                {pendingDeleteMembers.length > 0
                                    ? `This team has the following members. Deleting the team will unassign these people (move them to Default Team). Are you sure you want to proceed?`
                                    : `Are you sure you want to delete "${pendingDeleteTeam.name}"? This will remove the team record and move related assignments to Default Team.`}
                            </p>
                            {pendingDeleteMembers.length > 0 && (
                                <div className="tm-delete-member-list">
                                    {pendingDeleteMembers.map((member) => (
                                        <div key={member.id} className="tm-delete-member-item">
                                            <span>{member.fullName}</span>
                                            <span className="tm-delete-member-email">{member.email}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="adm-modal-actions">
                                <button
                                    type="button"
                                    className="adm-btn adm-btn--ghost"
                                    onClick={() => setPendingDeleteTeam(null)}
                                    disabled={deletingTeam}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="adm-btn adm-btn--danger-solid"
                                    onClick={() => void handleConfirmDeleteTeam()}
                                    disabled={deletingTeam}
                                >
                                    {deletingTeam ? 'Deleting…' : 'Delete Team'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────
// RoleManagementTab
// ─────────────────────────────────────────────

interface RoleManagementTabProps {
    users: User[];
    roles: Role[];
    currentUserId?: number | null;
    onChangeUserRole: (user: User, roleId: number) => Promise<void>;
}

function RoleManagementTab({ users, roles, currentUserId, onChangeUserRole }: RoleManagementTabProps) {
    const [openRolePickerKey, setOpenRolePickerKey] = useState<string | null>(null);
    const [banner, setBanner] = useState<TeamMgmtBanner | null>(null);

    useEffect(() => {
        if (!openRolePickerKey) return;
        const onDocPointerDown = (e: MouseEvent) => {
            const t = e.target as HTMLElement | null;
            if (!t) return;
            if (t.closest(`[data-rm-role-picker="${openRolePickerKey}"]`)) return;
            setOpenRolePickerKey(null);
        };
        document.addEventListener('mousedown', onDocPointerDown);
        return () => document.removeEventListener('mousedown', onDocPointerDown);
    }, [openRolePickerKey]);

    const handleChangeRole = async (u: User, newRoleId: number) => {
        setBanner(null);
        if (u.roleID === newRoleId) return;
        if (currentUserId != null && u.id === currentUserId) {
            setBanner({ kind: 'error', text: 'You cannot change your own role from Role Management.' });
            return;
        }
        try {
            await onChangeUserRole(u, newRoleId);
            setBanner({ kind: 'success', text: `Updated role for ${u.fullName}.` });
        } catch (e) {
            setBanner({
                kind: 'error',
                text: e instanceof ApiError ? e.message : 'Failed to change role.',
            });
        }
    };

    return (
        <div className="rm-root">
            <div className="rm-header">
                <h2 className="adm-section-title">Role Management</h2>
                <p className="adm-section-sub">
                    View and reassign user roles. Roles are defined by the system and cannot be
                    created or deleted.
                </p>
            </div>
            {banner ? (
                <div
                    className={`adm-flash${banner.kind === 'success' ? ' adm-flash--success' : ' adm-flash--error'}`}
                    role={banner.kind === 'success' ? 'status' : 'alert'}
                    aria-live="polite"
                >
                    <span>{banner.text}</span>
                    <button
                        type="button"
                        className="adm-flash-dismiss"
                        onClick={() => setBanner(null)}
                        aria-label="Dismiss notice"
                    >
                        Dismiss
                    </button>
                </div>
            ) : null}

            <div className="rm-content">
                <div className="rm-grid">
                    {roles.map((role) => {
                        const members = users.filter((u) => u.isActive && u.roleID === role.id);

                        return (
                            <div key={role.id} className="rm-card">
                                <div className="rm-card-header">
                                    <span
                                        className="rm-role-dot"
                                        style={{ background: getRoleColor(role.name) }}
                                    />
                                    <div className="rm-role-info">
                                        <h3 className="rm-role-name">{role.name}</h3>
                                        <p className="rm-role-desc">{role.description}</p>
                                    </div>
                                    <span className="rm-member-count">{members.length}</span>
                                </div>

                                <div className="rm-member-list">
                                    {members.length === 0 ? (
                                        <div className="adm-empty-sm">No users with this role</div>
                                    ) : (
                                        members.map((user) => {
                                            const rolePickerKey = String(user.id);
                                            const rolePickerOpen = openRolePickerKey === rolePickerKey;
                                            const otherRoles = roles.filter((r) => r.id !== user.roleID);
                                            return (
                                                <div
                                                    key={user.id}
                                                    className={`rm-member-item${rolePickerOpen ? ' rm-member-item--role-open' : ''}`}
                                                >
                                                    <UserAvatar name={user.fullName} size="sm" />
                                                    <div className="rm-member-info">
                                                        <span className="rm-member-name">{user.fullName}</span>
                                                        <span className="rm-member-email">{user.email}</span>
                                                    </div>
                                                    <div className="rm-member-actions">
                                                        {!user.isActive && <StatusBadge variant="inactive" label="Inactive" />}
                                                        {user.isLocked && <StatusBadge variant="locked" label="Locked" />}
                                                        {otherRoles.length > 0 ? (
                                                            <div
                                                                className="rm-role-picker-wrap"
                                                                data-rm-role-picker={rolePickerKey}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    className="adm-icon-btn"
                                                                    aria-expanded={rolePickerOpen}
                                                                    aria-haspopup="listbox"
                                                                    aria-label={`Change role for ${user.fullName}`}
                                                                    title="Change role — choose another role for this user"
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        setOpenRolePickerKey((k) =>
                                                                            k === rolePickerKey ? null : rolePickerKey,
                                                                        );
                                                                    }}
                                                                >
                                                                    <svg
                                                                        width="16"
                                                                        height="16"
                                                                        viewBox="0 0 16 16"
                                                                        fill="none"
                                                                        aria-hidden="true"
                                                                    >
                                                                        <path
                                                                            d="M3 5.5h7.5m0 0-2-2m2 2-2 2M13 10.5H5.5m0 0 2-2m-2 2 2 2"
                                                                            stroke="currentColor"
                                                                            strokeWidth="1.35"
                                                                            strokeLinecap="round"
                                                                            strokeLinejoin="round"
                                                                        />
                                                                    </svg>
                                                                </button>
                                                                {rolePickerOpen ? (
                                                                    <div
                                                                        className="adm-picker-menu"
                                                                        role="listbox"
                                                                        aria-label="Roles"
                                                                    >
                                                                        {otherRoles.map((r) => (
                                                                            <button
                                                                                key={r.id}
                                                                                type="button"
                                                                                role="option"
                                                                                className="adm-picker-option"
                                                                                onClick={(ev) => {
                                                                                    ev.stopPropagation();
                                                                                    setOpenRolePickerKey(null);
                                                                                    void handleChangeRole(user, r.id);
                                                                                }}
                                                                            >
                                                                                {r.name}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// Create user modal
// ─────────────────────────────────────────────

function formatCreatedUserDisplayName(first: string, middle: string, last: string, emailValue: string): string {
    const parts = [first, middle, last].map((s) => s.trim()).filter(Boolean);
    const name = parts.join(' ');
    return name || emailValue.trim();
}

function AdminInlineFieldError({ id, message }: { id: string; message?: string }) {
    if (!message) return null;
    return (
        <div id={id} className="adm-field-error adm-inline-field-error" role="alert">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
                <line x1="6" y1="4" x2="6" y2="6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="6" cy="8.5" r="0.5" fill="currentColor" />
            </svg>
            {message}
        </div>
    );
}

interface CreateUserModalProps {
    open: boolean;
    onClose: () => void;
    teams: Team[];
    roles: Role[];
    onCreated: (displayName: string) => void | Promise<void>;
}

function CreateUserModal({ open, onClose, teams, roles, onCreated }: CreateUserModalProps) {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [middleName, setMiddleName] = useState('');
    const [nameExtension, setNameExtension] = useState('');
    const [email, setEmail] = useState('');
    const [roleID, setRoleID] = useState(0);
    const [teamID, setTeamID] = useState(0);
    const [roleMenuOpen, setRoleMenuOpen] = useState(false);
    const [teamMenuOpen, setTeamMenuOpen] = useState(false);
    const [touched, setTouched] = useState({ firstName: false, lastName: false, email: false });
    const [submitAttempted, setSubmitAttempted] = useState(false);
    const [serverError, setServerError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) return;
        setFirstName('');
        setLastName('');
        setMiddleName('');
        setNameExtension('');
        setEmail('');
        setTouched({ firstName: false, lastName: false, email: false });
        setSubmitAttempted(false);
        setServerError('');
        setSubmitting(false);
        setRoleID(roles[0]?.id ?? 0);
        setTeamID(teams[0]?.id ?? 0);
        setRoleMenuOpen(false);
        setTeamMenuOpen(false);
    }, [open, roles, teams]);

    if (!open) return null;

    const showFirstErr = touched.firstName || submitAttempted;
    const showLastErr = touched.lastName || submitAttempted;
    const showEmailErr = touched.email || submitAttempted;

    const firstNameError = showFirstErr && !firstName.trim() ? 'First name is required.' : undefined;
    const lastNameError = showLastErr && !lastName.trim() ? 'Last name is required.' : undefined;
    const emailError = showEmailErr ? validateEmailAddress(email) : undefined;

    const emailValid = validateEmailAddress(email) === undefined;

    const canSubmit =
        firstName.trim().length > 0 &&
        lastName.trim().length > 0 &&
        emailValid &&
        roleID > 0 &&
        teamID > 0 &&
        teams.length > 0 &&
        roles.length > 0 &&
        !submitting;

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setSubmitAttempted(true);
        setServerError('');
        if (!firstName.trim() || !lastName.trim() || validateEmailAddress(email)) {
            return;
        }
        if (!canSubmit) return;
        setSubmitting(true);
        try {
            await adminApi.createUser({
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                emailAddress: email.trim(),
                roleID,
                teamID,
                middleName: middleName.trim() || undefined,
                nameExtension: nameExtension.trim() || undefined,
            });
            const displayName = formatCreatedUserDisplayName(firstName, middleName, lastName, email);
            await onCreated(displayName);
            onClose();
        } catch (err) {
            setServerError(err instanceof ApiError ? err.message : 'Failed to create user.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="adm-modal-overlay"
            role="presentation"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="adm-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="adm-create-user-title"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="adm-modal-header">
                    <h2 id="adm-create-user-title" className="adm-modal-title">
                        Create user
                    </h2>
                    <button type="button" className="adm-icon-btn" onClick={onClose} aria-label="Close">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>
                <form className="adm-modal-body" onSubmit={handleSubmit}>
                    {teams.length === 0 ? (
                        <p className="adm-field-error" role="alert">
                            Add at least one team before creating users (required by the server).
                        </p>
                    ) : null}
                    {roles.length === 0 ? (
                        <p className="adm-field-error" role="alert">
                            No roles are available. Check the database or reload the page.
                        </p>
                    ) : null}
                    <div className="adm-modal-grid2">
                        <div className="adm-field">
                            <label className="adm-label" htmlFor="cu-first">
                                First name <span className="adm-label-required" aria-hidden="true">*</span>
                            </label>
                            <input
                                id="cu-first"
                                className={`adm-input${firstNameError ? ' adm-input--error' : ''}`}
                                value={firstName}
                                onChange={(e) => {
                                    setFirstName(e.target.value);
                                    setServerError('');
                                }}
                                onBlur={() => setTouched((t) => ({ ...t, firstName: true }))}
                                autoComplete="given-name"
                                aria-invalid={!!firstNameError}
                                aria-describedby={firstNameError ? 'cu-first-error' : undefined}
                                required
                            />
                            <AdminInlineFieldError id="cu-first-error" message={firstNameError} />
                        </div>
                        <div className="adm-field">
                            <label className="adm-label" htmlFor="cu-last">
                                Last name <span className="adm-label-required" aria-hidden="true">*</span>
                            </label>
                            <input
                                id="cu-last"
                                className={`adm-input${lastNameError ? ' adm-input--error' : ''}`}
                                value={lastName}
                                onChange={(e) => {
                                    setLastName(e.target.value);
                                    setServerError('');
                                }}
                                onBlur={() => setTouched((t) => ({ ...t, lastName: true }))}
                                autoComplete="family-name"
                                aria-invalid={!!lastNameError}
                                aria-describedby={lastNameError ? 'cu-last-error' : undefined}
                                required
                            />
                            <AdminInlineFieldError id="cu-last-error" message={lastNameError} />
                        </div>
                    </div>
                    <div className="adm-modal-grid2">
                        <div className="adm-field">
                            <label className="adm-label" htmlFor="cu-middle">
                                Middle name <span className="adm-label-optional">(optional)</span>
                            </label>
                            <input
                                id="cu-middle"
                                className="adm-input"
                                value={middleName}
                                onChange={(e) => setMiddleName(e.target.value)}
                            />
                        </div>
                        <div className="adm-field">
                            <label className="adm-label" htmlFor="cu-suffix">
                                Suffix <span className="adm-label-optional">(optional)</span>
                            </label>
                            <input
                                id="cu-suffix"
                                className="adm-input"
                                value={nameExtension}
                                onChange={(e) => setNameExtension(e.target.value)}
                                placeholder="Jr., III…"
                            />
                        </div>
                    </div>
                    <div className="adm-field">
                        <label className="adm-label" htmlFor="cu-email">
                            Email address <span className="adm-label-required" aria-hidden="true">*</span>
                        </label>
                        <input
                            id="cu-email"
                            type="email"
                            className={`adm-input${emailError ? ' adm-input--error' : ''}`}
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                setServerError('');
                            }}
                            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                            autoComplete="email"
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck={false}
                            maxLength={100}
                            aria-invalid={!!emailError}
                            aria-describedby={emailError ? 'cu-email-error' : undefined}
                            required
                        />
                        <AdminInlineFieldError id="cu-email-error" message={emailError} />
                    </div>
                    <div className="adm-modal-grid2">
                        <div className="adm-field">
                            <label className="adm-label" htmlFor="cu-role">
                                Role <span className="adm-label-required" aria-hidden="true">*</span>
                            </label>
                            <div className={`adm-select-wrap${roleMenuOpen ? ' adm-select-wrap--open' : ''}`}>
                                <select
                                    id="cu-role"
                                    className="adm-select"
                                    style={{ width: '100%' }}
                                    value={roleID}
                                    onChange={(e) => setRoleID(Number(e.target.value))}
                                    onClick={() => setRoleMenuOpen(v => !v)}
                                    onBlur={() => setRoleMenuOpen(false)}
                                    required
                                >
                                    {roles.map((r) => (
                                        <option key={r.id} value={r.id}>
                                            {r.name}
                                        </option>
                                    ))}
                                </select>
                                <span className="adm-select-chevron" aria-hidden="true">
                                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                                        <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </span>
                            </div>
                        </div>
                        <div className="adm-field">
                            <label className="adm-label" htmlFor="cu-team">
                                Team <span className="adm-label-required" aria-hidden="true">*</span>
                            </label>
                            <div className={`adm-select-wrap${teamMenuOpen ? ' adm-select-wrap--open' : ''}`}>
                                <select
                                    id="cu-team"
                                    className="adm-select"
                                    style={{ width: '100%' }}
                                    value={teamID}
                                    onChange={(e) => setTeamID(Number(e.target.value))}
                                    onClick={() => setTeamMenuOpen(v => !v)}
                                    onBlur={() => setTeamMenuOpen(false)}
                                    required
                                >
                                    {teams.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {isDefaultTeamName(t.name) ? 'Unassigned (default)' : t.name}
                                        </option>
                                    ))}
                                </select>
                                <span className="adm-select-chevron" aria-hidden="true">
                                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                                        <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </span>
                            </div>
                        </div>
                    </div>
                    {serverError ? (
                        <AdminInlineFieldError id="cu-server-error" message={serverError} />
                    ) : null}
                    <p className="ud-action-hint">
                        The user receives a welcome email with a temporary password and must verify their email.
                    </p>
                    <div className="adm-modal-actions">
                        <button type="button" className="adm-btn adm-btn--ghost" onClick={onClose} disabled={submitting}>
                            Cancel
                        </button>
                        <button type="submit" className="adm-btn adm-btn--primary" disabled={!canSubmit}>
                            {submitting ? 'Creating…' : 'Create user'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// AdminPage (root)
// ─────────────────────────────────────────────

const TABS: { key: AdminTab; label: string }[] = [
    { key: 'users', label: 'User Management' },
    { key: 'teams', label: 'Team Management' },
    { key: 'roles', label: 'Role Management' },
];

export function AdminDirectoryPanel() {
    const { user: me } = useAuth();
    const [activeTab, setActiveTab] = useState<AdminTab>('users');
    const [users, setUsers] = useState<User[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [createUserOpen, setCreateUserOpen] = useState(false);
    const [createUserBanner, setCreateUserBanner] = useState<string | null>(null);

    const loadDirectory = useCallback(async () => {
        try {
            const [userRows, teamRows, roleRows] = await Promise.all([
                adminApi.fetchAllUsers(),
                adminApi.fetchAllTeams(),
                adminApi.fetchRoles(),
            ]);
            setUsers(userRows.map(mapApiUser));
            setTeams(teamRows.map(mapApiTeam));
            setRoles(roleRows.map(mapApiRole));
        } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => {
        void loadDirectory();
    }, [loadDirectory]);

    useEffect(() => {
        if (!createUserBanner) return;
        const id = window.setTimeout(() => setCreateUserBanner(null), 10000);
        return () => window.clearTimeout(id);
    }, [createUserBanner]);

    useEffect(() => {
        const conn = getNotificationHubConnection();
        const onDir = () => {
            void loadDirectory();
        };
        conn.on('AdminDirectoryChanged', onDir);
        void (async () => {
            try {
                if (conn.state === signalR.HubConnectionState.Disconnected) {
                    await conn.start();
                }
            } catch {
                /* optional when backend hub unavailable */
            }
        })();
        return () => {
            conn.off('AdminDirectoryChanged', onDir);
        };
    }, [loadDirectory]);

    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState === 'visible') void loadDirectory();
        };
        document.addEventListener('visibilitychange', onVis);
        return () => document.removeEventListener('visibilitychange', onVis);
    }, [loadDirectory]);

    const handleAssignTeam = useCallback(
        async (user: User, teamId: number) => {
            if (user.id === me?.userID) return;
            const result = await adminApi.patchUserAccess(user.id, { teamID: teamId });
            assertUserAccessWasUpdated(result);
            await loadDirectory();
        },
        [loadDirectory, me],
    );

    /** Unassign = assign to default team (same as "unassigned" in UI); fallback if no default team row. */
    const handleRemoveFromTeam = useCallback(
        async (user: User) => {
            if (user.id === me?.userID) return;
            const defaultTeamId = getDefaultTeamId(teams);
            const result =
                defaultTeamId != null
                    ? await adminApi.patchUserAccess(user.id, { teamID: defaultTeamId })
                    : await adminApi.patchUserAccess(user.id, { removeFromTeam: true });
            assertUserAccessWasUpdated(result);
            await loadDirectory();
        },
        [loadDirectory, teams, me],
    );

    const handleChangeUserRole = useCallback(
        async (user: User, newRoleId: number) => {
            if (user.roleID === newRoleId || user.id === me?.userID) return;
            const result = await adminApi.patchUserAccess(user.id, { roleID: newRoleId });
            assertUserAccessWasUpdated(result);
            await loadDirectory();
        },
        [loadDirectory, me],
    );

    const handleCreateTeam = useCallback(
        async (name: string) => {
            await adminApi.createTeam(name);
            await loadDirectory();
        },
        [loadDirectory],
    );

    const handleDeleteTeam = useCallback(
        async (team: Team) => {
            const result = await adminApi.deleteTeam(team.id);
            await loadDirectory();
            return result;
        },
        [loadDirectory],
    );

    const lockedCount = users.filter((u) => u.isLocked).length;
    const inactiveCount = users.filter((u) => !u.isActive).length;
    const namedTeamCount = teams.filter((t) => !isDefaultTeamName(t.name)).length;

    return (
        <div className="admin-page">
            {/* Page header */}
            <div className="admin-page-header">
                <div>
                    <p className="adm-eyebrow">System</p>
                    <h1 className="admin-page-title">Administration</h1>
                </div>
                <div className="admin-header-actions">
                    <button
                        type="button"
                        className="adm-btn adm-btn--primary"
                        onClick={() => setCreateUserOpen(true)}
                    >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                            <path d="M6.5 1.5v10M1.5 6.5h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                        Create user
                    </button>
                    <div className="admin-stats">
                        <div className="admin-stat">
                            <span className="admin-stat-val">{users.length}</span>
                            <span className="admin-stat-label">Users</span>
                        </div>
                        <div className="admin-stat-divider" />
                        <div className="admin-stat">
                            <span className="admin-stat-val">{namedTeamCount}</span>
                            <span className="admin-stat-label">Teams</span>
                        </div>
                        {lockedCount > 0 && (
                            <>
                                <div className="admin-stat-divider" />
                                <div className="admin-stat admin-stat--alert">
                                    <span className="admin-stat-val">{lockedCount}</span>
                                    <span className="admin-stat-label">Locked</span>
                                </div>
                            </>
                        )}
                        {inactiveCount > 0 && (
                            <>
                                <div className="admin-stat-divider" />
                                <div className="admin-stat admin-stat--muted">
                                    <span className="admin-stat-val">{inactiveCount}</span>
                                    <span className="admin-stat-label">Inactive</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {createUserBanner ? (
                <div className="adm-flash adm-flash--success" role="status" aria-live="polite">
                    <span>{createUserBanner}</span>
                    <button
                        type="button"
                        className="adm-flash-dismiss"
                        onClick={() => setCreateUserBanner(null)}
                        aria-label="Dismiss notice"
                    >
                        Dismiss
                    </button>
                </div>
            ) : null}

            {/* Tab bar */}
            <div className="admin-tab-bar" role="tablist">
                {TABS.map((tab) => (
                    <button
                        key={tab.key}
                        role="tab"
                        aria-selected={activeTab === tab.key}
                        className={`admin-tab-btn${activeTab === tab.key ? ' admin-tab-btn--active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        {tab.key === 'users' && (
                            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                                <circle cx="5.5" cy="4.5" r="3" stroke="currentColor" strokeWidth="1.3" />
                                <path d="M0.5 12.5c0-2.485 2.015-4.5 5-4.5s5 2.015 5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                <path d="M10.5 7h4M12.5 5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                            </svg>
                        )}
                        {tab.key === 'teams' && (
                            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                                <circle cx="3.5" cy="4.5" r="2.2" stroke="currentColor" strokeWidth="1.3" />
                                <circle cx="11.5" cy="4.5" r="2.2" stroke="currentColor" strokeWidth="1.3" />
                                <path d="M0 13c0-2 1.5-3 3.5-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                <path d="M15 13c0-2-1.5-3-3.5-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                <circle cx="7.5" cy="6.5" r="2.2" stroke="currentColor" strokeWidth="1.3" />
                                <path d="M3 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                            </svg>
                        )}
                        {tab.key === 'roles' && (
                            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                                <path d="M7.5 1.5L9.5 5.5L14 6.2L11 9.3L11.5 14L7.5 11.5L3.5 14L4 9.3L1 6.2L5.5 5.5L7.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                            </svg>
                        )}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div className="admin-content" role="tabpanel">
                {activeTab === 'users' && (
                    <UserManagementTab
                        users={users}
                        teams={teams}
                        onRefreshDirectory={loadDirectory}
                    />
                )}
                {activeTab === 'teams' && (
                    <TeamManagementTab
                        users={users}
                        teams={teams}
                        currentUserId={me?.userID}
                        onAssignTeam={handleAssignTeam}
                        onRemoveFromTeam={handleRemoveFromTeam}
                        onCreateTeam={handleCreateTeam}
                        onDeleteTeam={handleDeleteTeam}
                    />
                )}
                {activeTab === 'roles' && (
                    <RoleManagementTab
                        users={users}
                        roles={roles}
                        currentUserId={me?.userID}
                        onChangeUserRole={handleChangeUserRole}
                    />
                )}
            </div>

            <CreateUserModal
                open={createUserOpen}
                onClose={() => setCreateUserOpen(false)}
                teams={teams}
                roles={roles}
                onCreated={async (displayName) => {
                    await loadDirectory();
                    setCreateUserBanner(`Successfully created user "${displayName}".`);
                }}
            />
        </div>
    );
}