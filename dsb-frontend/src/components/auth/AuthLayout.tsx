import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '../ThemeToggle';
import '../../styles/auth.css';

interface AuthLayoutProps {
    children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
    return (
        <div className="auth-root">
            {/* ── Left brand panel ─────────────────────── */}
            <aside className="auth-brand" aria-hidden="true">
                <div className="auth-brand-top">
                    <Link to="/login" className="auth-brand-logo" tabIndex={-1}>
                        <img
                            src="/SitesphilLogo.png"
                            alt=""
                            className="auth-brand-mark-img"
                            width="40"
                            height="40"
                        />
                        <div className="auth-brand-name">
                            Digital Scrum Board
                            <span>Agile Sprint Management</span>
                        </div>
                    </Link>
                </div>

                <div className="auth-brand-body">
                    <h2 className="auth-brand-headline">
                        Plan. <em>Sprint.</em><br />
                        Ship.
                    </h2>
                    <p className="auth-brand-desc">
                        A focused workspace for agile teams — structured backlogs,
                        sprint boards, and real-time collaboration in one place.
                    </p>
                </div>

                <div className="auth-brand-footer">
                    <a href="/about" className="auth-brand-guide-link">
                        <span className="auth-brand-guide-link__icon" aria-hidden="true">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.3" />
                                <path
                                    d="M6.7 6.15A1.56 1.56 0 0 1 8.18 5c.99 0 1.78.7 1.78 1.62 0 .74-.4 1.13-.95 1.51-.5.34-.88.67-.88 1.37"
                                    stroke="currentColor"
                                    strokeWidth="1.3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                                <circle cx="8" cy="11.55" r="0.7" fill="currentColor" />
                            </svg>
                        </span>
                        <span>System Guide</span>
                    </a>
                    <div className="auth-brand-meta">
                        <span>Role-based access</span>
                        <span className="auth-brand-meta-dot" />
                        <span>Real-time boards</span>
                        <span className="auth-brand-meta-dot" />
                        <span>Audit logging</span>
                    </div>
                </div>
            </aside>

            {/* ── Right form panel ─────────────────────── */}
            <main className="auth-form-panel">
                <div className="auth-panel-top">
                    <ThemeToggle />
                </div>
                <div className="auth-form-panel-inner">
                    <div className="auth-form-wrap">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
}