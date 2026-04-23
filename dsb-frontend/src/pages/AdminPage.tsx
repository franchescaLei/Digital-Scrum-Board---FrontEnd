import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isAdministrator } from '../utils/userProfile';
import { AdminDirectoryPanel } from '../components/admin/AdminDirectoryPanel';
import { AuditLogsPanel } from '../components/admin/AuditLogsPanel';

function AdminOverviewPanel() {
    return (
        <div className="app-animate-in">
            <div className="page-header">
                <div>
                    <span className="page-eyebrow">Administration</span>
                    <h1 className="page-title">Admin Panel</h1>
                    <p className="page-subtitle">System administration and management tools.</p>
                </div>
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: 16,
                }}
            >
                {[
                    {
                        title: 'User Management',
                        desc: 'Manage team members, roles, and permissions.',
                        to: '/admin/users',
                        icon: (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <circle cx="8" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5" />
                                <path
                                    d="M2 20c0-3.314 2.686-6 6-6s6 2.686 6 6"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                />
                                <path d="M17 10v6M14 13h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                        ),
                    },
                    {
                        title: 'Audit Logs',
                        desc: 'Review system activity and security events.',
                        to: '/admin/audit',
                        icon: (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <rect x="3" y="3" width="18" height="18" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                                <line x1="7" y1="8" x2="17" y2="8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                <line x1="7" y1="12" x2="17" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                <line x1="7" y1="16" x2="13" y2="16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                            </svg>
                        ),
                    },
                ].map((item) => (
                    <Link
                        key={item.title}
                        to={item.to}
                        className="app-card"
                        style={{
                            display: 'flex',
                            gap: 16,
                            alignItems: 'flex-start',
                            textDecoration: 'none',
                            cursor: 'pointer',
                            transition: 'border-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease',
                        }}
                        onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-red)';
                            (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.borderColor = 'var(--card-border)';
                            (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                        }}
                    >
                        <div
                            style={{
                                width: 42,
                                height: 42,
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--accent-red-light)',
                                color: 'var(--accent-red)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}
                        >
                            {item.icon}
                        </div>
                        <div>
                            <div
                                style={{
                                    fontFamily: 'var(--font-ui)',
                                    fontSize: '0.9375rem',
                                    fontWeight: 600,
                                    color: 'var(--page-title-color)',
                                    marginBottom: 4,
                                }}
                            >
                                {item.title}
                            </div>
                            <div
                                style={{
                                    fontFamily: 'var(--font-ui)',
                                    fontSize: '0.8125rem',
                                    color: 'var(--page-sub-color)',
                                    lineHeight: 1.5,
                                }}
                            >
                                {item.desc}
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}

export default function AdminPage() {
    const location = useLocation();
    const { user } = useAuth();

    if (!isAdministrator(user)) {
        return (
            <div className="app-animate-in">
                <div className="page-header">
                    <div>
                        <span className="page-eyebrow">Access Denied</span>
                        <h1 className="page-title">Restricted Area</h1>
                    </div>
                </div>
                <div className="app-card">
                    <div className="empty-state" style={{ padding: '48px 0' }}>
                        <h3>Access Denied</h3>
                        <p>You do not have permission to view this page.</p>
                    </div>
                </div>
            </div>
        );
    }

    if (location.pathname === '/admin/users') return <AdminDirectoryPanel />;
    if (location.pathname === '/admin/audit') return <AuditLogsPanel />;
    return <AdminOverviewPanel />;
}
