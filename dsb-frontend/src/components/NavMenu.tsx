import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isAdministrator } from "../utils/userProfile";
import { logout } from "../api/authApi";

const BacklogIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="currentColor" />
        <rect x="2" y="7.25" width="9" height="1.5" rx="0.75" fill="currentColor" />
        <rect x="2" y="11.5" width="11" height="1.5" rx="0.75" fill="currentColor" />
    </svg>
);

const BoardIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="1.5" y="3" width="4" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
        <rect x="6" y="3" width="4" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
        <rect x="10.5" y="3" width="4" height="4" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
);

const UserMgmtIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="6" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M1.5 13c0-2.485 2.015-4.5 4.5-4.5S10.5 10.515 10.5 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M12 7v4M10 9h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
);

const AuditIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2.5" y="2" width="11" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <line x1="5" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="5" y1="8.5" x2="11" y2="8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="5" y1="11" x2="8" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
);

const LogoutIcon = () => (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M10.5 5L14 8l-3.5 3M14 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const CollapseIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const ExpandIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

interface NavMenuProps {
    isCollapsed: boolean;
    onToggle: () => void;
}

export default function NavMenu({ isCollapsed, onToggle }: NavMenuProps) {
    const { user } = useAuth();
    const isAdmin = isAdministrator(user);

    const initials = user?.fullName
        ? user.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
        : "?";

    async function handleLogout() {
        try {
            await logout();
        } finally {
            window.location.href = "/login";
        }
    }

    return (
        <aside className={`app-sidebar${isCollapsed ? ' app-sidebar--collapsed' : ''}`}>
            <button
                type="button"
                className="app-sidebar-toggle"
                onClick={onToggle}
                title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
                {isCollapsed ? <ExpandIcon /> : <CollapseIcon />}
            </button>

            <nav className="app-nav" aria-label="Main navigation">
                <div className="app-nav-section">
                    {!isCollapsed && <span className="app-nav-section-label">Workspace</span>}

                    <NavLink
                        to="/backlogsv2"
                        className={({ isActive }) =>
                            `app-nav-link${isActive ? " app-nav-link--active" : ""}`
                        }
                        title={isCollapsed ? 'Planning Workspace' : undefined}
                    >
                        <span className="app-nav-icon"><BacklogIcon /></span>
                        {!isCollapsed && <span>Planning Workspace</span>}
                    </NavLink>

                    <NavLink
                        to="/boards"
                        className={({ isActive }) =>
                            `app-nav-link${isActive ? " app-nav-link--active" : ""}`
                        }
                        title={isCollapsed ? 'Boards' : undefined}
                    >
                        <span className="app-nav-icon"><BoardIcon /></span>
                        {!isCollapsed && <span>Boards</span>}
                    </NavLink>
                </div>

                {isAdmin && (
                    <div className="app-nav-section">
                        {!isCollapsed && <span className="app-nav-section-label">Administration</span>}

                        <NavLink
                            to="/admin/users"
                            className={({ isActive }) =>
                                `app-nav-link${isActive ? " app-nav-link--active" : ""}`
                            }
                            title={isCollapsed ? 'User Management' : undefined}
                        >
                            <span className="app-nav-icon"><UserMgmtIcon /></span>
                            {!isCollapsed && <span>User Management</span>}
                        </NavLink>

                        <NavLink
                            to="/admin/audit"
                            className={({ isActive }) =>
                                `app-nav-link${isActive ? " app-nav-link--active" : ""}`
                            }
                            title={isCollapsed ? 'Audit Logs' : undefined}
                        >
                            <span className="app-nav-icon"><AuditIcon /></span>
                            {!isCollapsed && <span>Audit Logs</span>}
                        </NavLink>
                    </div>
                )}
            </nav>

            {user ? (
                <div className="app-sidebar-account">
                    <NavLink
                        to="/profile"
                        className={({ isActive }) =>
                            `app-sidebar-profile-link${isActive ? " app-sidebar-profile-link--active" : ""}`
                        }
                        aria-label="Open profile and account settings"
                        title={isCollapsed ? 'Profile' : undefined}
                    >
                        <div className="app-sidebar-avatar" aria-hidden="true">
                            {initials}
                        </div>
                        {!isCollapsed && (
                            <div className="app-sidebar-user-meta">
                                <span className="app-sidebar-user-name">{user.fullName}</span>
                                <span className="app-sidebar-user-role">{user.roleName}</span>
                            </div>
                        )}
                    </NavLink>
                    <button
                        type="button"
                        className="app-sidebar-signout"
                        onClick={() => void handleLogout()}
                        title={isCollapsed ? 'Sign out' : 'Sign out'}
                    >
                        <LogoutIcon />
                        {!isCollapsed && <span>Sign out</span>}
                    </button>
                </div>
            ) : null}

            <div className="app-sidebar-footer">
                {!isCollapsed && <div className="app-sidebar-version">DSB v1.0</div>}
            </div>
        </aside>
    );
}
