import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout';
import '../styles/emailVerified.css';
import { confirmEmail } from '../api/authApi';
import { ApiError } from '../services/apiClient';

type ConfirmState = 'validating' | 'ready' | 'confirming' | 'confirmed' | 'error';

// ── Animated check icon ───────────────────────
function AnimatedCheckIcon() {
    return (
        <svg
            width="40"
            height="40"
            viewBox="0 0 40 40"
            fill="none"
            aria-hidden="true"
            className="email-verified-check-svg"
        >
            <circle
                cx="20"
                cy="20"
                r="18"
                stroke="currentColor"
                strokeWidth="2"
                className="email-verified-circle"
            />
            <path
                d="M11 20.5l6.5 6.5 11.5-13"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="email-verified-checkmark"
            />
        </svg>
    );
}

// ─ Confetti particle ─────────────────────────
interface Particle {
    id: number;
    x: number;
    delay: number;
    duration: number;
    color: string;
    size: number;
    rotation: number;
}

function ConfettiParticles() {
    const particles: Particle[] = Array.from({ length: 18 }, (_, i) => ({
        id: i,
        x: 10 + Math.random() * 80,
        delay: Math.random() * 0.6,
        duration: 1.2 + Math.random() * 0.8,
        color: [
            'var(--color-success)',
            'var(--accent-gold)',
            'var(--accent-red)',
            '#60A5FA',
            '#34D399',
        ][i % 5],
        size: 5 + Math.random() * 5,
        rotation: Math.random() * 360,
    }));

    return (
        <div className="email-verified-confetti" aria-hidden="true">
            {particles.map((p) => (
                <span
                    key={p.id}
                    className="email-verified-particle"
                    style={{
                        left: `${p.x}%`,
                        animationDelay: `${p.delay}s`,
                        animationDuration: `${p.duration}s`,
                        width: p.size,
                        height: p.size,
                        background: p.color,
                        transform: `rotate(${p.rotation}deg)`,
                    }}
                />
            ))}
        </div>
    );
}

// ── Main component ────────────────────────────
export default function EmailConfirmedPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const [confirmState, setConfirmState] = useState<ConfirmState>('validating');
    const [errorMessage, setErrorMessage] = useState('');
    const [showConfetti, setShowConfetti] = useState(false);
    const btnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!token) {
            setConfirmState('error');
            setErrorMessage('No verification token provided.');
            return;
        }

        // Token is present — show "ready to confirm" state
        setConfirmState('ready');
    }, [token]);

    // Auto-focus the confirm button when ready
    useEffect(() => {
        if (confirmState === 'ready') {
            btnRef.current?.focus();
        }
    }, [confirmState]);

    const handleConfirm = async () => {
        if (!token) return;

        setConfirmState('confirming');
        try {
            await confirmEmail(token);
            setConfirmState('confirmed');
            setShowConfetti(true);
        } catch (err) {
            setErrorMessage(
                err instanceof ApiError
                    ? err.message
                    : 'Verification failed. The link may have expired or already been used.',
            );
            setConfirmState('error');
        }
    };

    const handleProceed = () => {
        navigate('/', { replace: true });
    };

    // ── Validating state (should not happen, but safe fallback) ──
    if (confirmState === 'validating') {
        return (
            <AuthLayout>
                <header className="auth-page-header">
                    <p className="auth-page-eyebrow">Loading</p>
                    <h1 className="auth-page-title">Preparing your verification…</h1>
                </header>
            </AuthLayout>
        );
    }

    // ── Error state ──────────────────────────────────
    if (confirmState === 'error') {
        return (
            <AuthLayout>
                <div
                    className="auth-verify-icon"
                    style={{ background: 'var(--color-error-bg)', color: 'var(--color-error)' }}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                        <path
                            d="M12 8v4M12 16h.01"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                        />
                    </svg>
                </div>
                <header className="auth-page-header">
                    <p className="auth-page-eyebrow">Verification failed</p>
                    <h1 className="auth-page-title">Link expired or invalid</h1>
                    <p className="auth-page-sub">{errorMessage}</p>
                </header>
                <button
                    type="button"
                    className="auth-submit"
                    onClick={() => navigate('/login', { replace: true })}
                >
                    Back to Sign In
                </button>
            </AuthLayout>
        );
    }

    // ── Confirmed state ─────────────────────────────
    if (confirmState === 'confirmed') {
        return (
            <AuthLayout>
                <div className={`email-verified-wrap email-verified-wrap--ready`}>
                    {showConfetti && <ConfettiParticles />}

                    <div className="email-verified-icon-ring" aria-label="Email verified successfully">
                        <AnimatedCheckIcon />
                    </div>

                    <header className="email-verified-header">
                        <p className="auth-page-eyebrow">Account ready</p>
                        <h1 className="auth-page-title email-verified-title">
                            Email Verified Successfully
                        </h1>
                        <p className="auth-page-sub">
                            Your email address has been confirmed and your account is fully activated.
                            You&apos;re all set to access your sprint boards and team workspace.
                        </p>
                    </header>

                    <ul className="email-verified-features" aria-label="What&apos;s available to you">
                        {[
                            { icon: '⬜', label: 'Sprint boards', detail: 'Plan and track your sprints' },
                            { icon: '📋', label: 'Backlogs', detail: 'Manage your work items' },
                            { icon: '👥', label: 'Team workspace', detail: 'Collaborate in real-time' },
                        ].map(({ icon, label, detail }) => (
                            <li key={label} className="email-verified-feature">
                                <span className="email-verified-feature-icon" aria-hidden="true">{icon}</span>
                                <div>
                                    <span className="email-verified-feature-label">{label}</span>
                                    <span className="email-verified-feature-detail">{detail}</span>
                                </div>
                            </li>
                        ))}
                    </ul>

                    <button
                        ref={btnRef}
                        type="button"
                        className="auth-submit email-verified-cta"
                        onClick={handleProceed}
                    >
                        Proceed to Main Page
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                            <path
                                d="M2 7h10M8 3l4 4-4 4"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>

                    <p className="email-verified-footnote">
                        You may now sign in at any time using your registered email address.
                    </p>
                </div>
            </AuthLayout>
        );
    }

    // ── Ready to confirm (default state when user arrives from email link) ──
    return (
        <AuthLayout>
            <div className="email-verified-wrap email-verified-wrap--ready">
                <div className="email-verified-icon-ring" aria-label="Email verification ready">
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
                        <rect
                            x="4"
                            y="6"
                            width="32"
                            height="28"
                            rx="3"
                            stroke="currentColor"
                            strokeWidth="2"
                        />
                        <path
                            d="M4 12l16 10 16-10"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                        />
                    </svg>
                </div>

                <header className="email-verified-header">
                    <p className="auth-page-eyebrow">One more step</p>
                    <h1 className="auth-page-title email-verified-title">
                        Confirm Your Email Address
                    </h1>
                    <p className="auth-page-sub">
                        Click the button below to verify your email address and activate your account.
                    </p>
                </header>

                <button
                    ref={btnRef}
                    type="button"
                    className="auth-submit email-verified-cta"
                    onClick={handleConfirm}
                >
                    Confirm Email Address
                </button>
            </div>
        </AuthLayout>
    );
}
