import {
    type FormEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout';
import CountdownBanner, { StatusBanner } from '../components/auth/CountdownBanner';
import { login } from '../api/authApi';
import { ApiError } from '../services/apiClient';
import type { UserProfile } from '../types/auth';
import { validateEmailAddress } from '../utils/validateEmail';

// ─────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────

const EyeIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <ellipse cx="8" cy="8" rx="6" ry="4" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="8" cy="8" r="1.75" stroke="currentColor" strokeWidth="1.4" />
    </svg>
);

const EyeOffIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2 2l12 12M6.5 6.62A1.75 1.75 0 0 0 9.38 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M4.1 4.25C2.8 5.08 2 6.43 2 8c0 0 2 4 6 4a6.2 6.2 0 0 0 3.78-1.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M12.5 10.8C13.42 9.93 14 8.97 14 8c0 0-2-4-6-4a6.1 6.1 0 0 0-1.84.29" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
);

const ArrowIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type AlertState =
    | { kind: 'none' }
    | { kind: 'error'; message: string }
    | { kind: 'rate_limit'; message: string; seconds: number }
    | { kind: 'account_locked'; message: string; seconds: number }
    | { kind: 'pw_change_required'; user: UserProfile }
    | { kind: 'email_verify_required'; user: UserProfile };

// ─────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────

function validateEmail(v: string): string | undefined {
    return validateEmailAddress(v);
}

function validatePassword(v: string): string | undefined {
    if (!v) return 'Password is required.';
    if (v.length < 8) return 'Password must be at least 8 characters.';
    if (v.length > 128) return 'Password must be 128 characters or fewer.';
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface Props {
    /** Called on successful authentication */
    onAuthenticated?: (user: UserProfile) => void;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export default function LoginPage({ onAuthenticated }: Props) {
    const navigate = useNavigate();

    // ── Form state ──────────────────────────────
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [touched, setTouched] = useState({ email: false, password: false });
    const [loading, setLoading] = useState(false);
    const [alert, setAlert] = useState<AlertState>({ kind: 'none' });

    // ── Countdown block ─────────────────────────
    const [blockedUntilSeconds, setBlockedUntilSeconds] = useState(0);
    const isBlocked = blockedUntilSeconds > 0;

    // ── Refs for focus management ───────────────
    const emailRef = useRef<HTMLInputElement>(null);
    const alertRef = useRef<HTMLDivElement>(null);

    // ── Inline validation ───────────────────────
    const emailError = touched.email ? validateEmail(email) : undefined;
    const passwordError = touched.password ? validatePassword(password) : undefined;
    const isFormValid = !validateEmail(email) && !validatePassword(password);

    // ── Submit ──────────────────────────────────
    const handleSubmit = useCallback(
        async (e: FormEvent) => {
            e.preventDefault();

            // Mark all fields touched to show validation
            setTouched({ email: true, password: true });
            if (!isFormValid || isBlocked) return;

            setLoading(true);
            setAlert({ kind: 'none' });

            try {
                const result = await login({ emailAddress: email, password });

                // ── Handle post-login flags ─────────────
                // Route immediately into the correct partial-auth gate.
                if (result.mustChangePassword) {
                    navigate('/change-password', { replace: true });
                    return;
                }

                if (!result.emailVerified) {
                    navigate('/verify-email', { replace: true });
                    return;
                }

                // Normal success → navigate into app.
                onAuthenticated?.(result.user);
                navigate('/', { replace: true });
            } catch (err) {
                setLoading(false);

                if (!(err instanceof ApiError)) {
                    setAlert({
                        kind: 'error',
                        message: 'An unexpected error occurred. Please try again.',
                    });
                    return;
                }

                if (err.isAccountLocked && err.retryAfterSeconds) {
                    setBlockedUntilSeconds(err.retryAfterSeconds);
                    setAlert({
                        kind: 'account_locked',
                        message: err.message,
                        seconds: err.retryAfterSeconds,
                    });
                } else if (err.isAuthRateLimited && err.retryAfterSeconds) {
                    setBlockedUntilSeconds(err.retryAfterSeconds);
                    setAlert({
                        kind: 'rate_limit',
                        message: err.message,
                        seconds: err.retryAfterSeconds,
                    });
                } else if (err.isRateLimited && err.retryAfterSeconds) {
                    setBlockedUntilSeconds(err.retryAfterSeconds);
                    setAlert({
                        kind: 'rate_limit',
                        message: 'Too many requests. Please wait before trying again.',
                        seconds: err.retryAfterSeconds,
                    });
                } else if (err.isPasswordChangeRequired) {
                    // Shouldn't normally reach here via login, but handle defensively
                    navigate('/change-password', { replace: true });
                } else if (err.isEmailVerificationRequired) {
                    navigate('/verify-email', { replace: true });
                } else if (err.isUnauthorized) {
                    setAlert({
                        kind: 'error',
                        message: 'Incorrect email or password. Please try again.',
                    });
                    // Focus email on auth failure
                    emailRef.current?.focus();
                } else {
                    setAlert({
                        kind: 'error',
                        message: err.message || 'Sign in failed. Please try again.',
                    });
                }
            }
        },
        [email, password, isFormValid, isBlocked, navigate, onAuthenticated],
    );

    // Move focus to alert region when it changes
    useEffect(() => {
        if (alert.kind !== 'none' && alertRef.current) {
            alertRef.current.focus();
        }
    }, [alert.kind]);

    // ── Redirect: forced flows ──────────────────
    if (alert.kind === 'pw_change_required') {
        return (
            <AuthLayout>
                <ForcedChangePasswordPrompt
                    user={alert.user}
                    onContinue={() => navigate('/change-password', { replace: true })}
                />
            </AuthLayout>
        );
    }

    if (alert.kind === 'email_verify_required') {
        return (
            <AuthLayout>
                <EmailVerifyPrompt
                    user={alert.user}
                    onContinue={() => navigate('/verify-email', { replace: true })}
                />
            </AuthLayout>
        );
    }

    // ─────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────
    return (
        <AuthLayout>
            {/* ── Page header ────────────────────────── */}
            <header className="auth-page-header">
                <p className="auth-page-eyebrow">Welcome back</p>
                <h1 className="auth-page-title">Sign in to your account</h1>
                <p className="auth-page-sub">
                    Access your sprint boards, backlogs, and team workspace.
                </p>
            </header>

            {/* ── Alert region ───────────────────────── */}
            <div
                ref={alertRef}
                tabIndex={-1}
                aria-atomic="true"
                style={{ outline: 'none', marginBottom: alert.kind !== 'none' ? 20 : 0 }}
            >
                {(alert.kind === 'account_locked') && (
                    <CountdownBanner
                        variant="lock"
                        seconds={alert.seconds}
                        title="Account temporarily locked"
                        message="Too many failed attempts. Your account is locked. You may try again in:"
                        onExpire={() => {
                            setBlockedUntilSeconds(0);
                            setAlert({ kind: 'none' });
                        }}
                    />
                )}

                {(alert.kind === 'rate_limit') && (
                    <CountdownBanner
                        variant="warn"
                        seconds={alert.seconds}
                        title="Too many attempts"
                        message="Please wait before trying again:"
                        onExpire={() => {
                            setBlockedUntilSeconds(0);
                            setAlert({ kind: 'none' });
                        }}
                    />
                )}

                {alert.kind === 'error' && (
                    <StatusBanner variant="error" message={alert.message} />
                )}
            </div>

            {/* ── Form ───────────────────────────────── */}
            <form
                className="auth-form"
                onSubmit={handleSubmit}
                noValidate
                aria-label="Sign in form"
            >
                {/* Email */}
                <div className="auth-field">
                    <label htmlFor="login-email" className="auth-label">
                        Email address
                    </label>
                    <div className="auth-input-wrap">
                        <input
                            ref={emailRef}
                            id="login-email"
                            type="email"
                            name="email"
                            autoComplete="email"
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck="false"
                            className={`auth-input${emailError ? ' auth-input--error' : ''}`}
                            placeholder="you@company.com"
                            value={email}
                            maxLength={100}
                            disabled={loading || isBlocked}
                            onChange={(e) => setEmail(e.target.value)}
                            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                            aria-describedby={emailError ? 'login-email-error' : undefined}
                            aria-invalid={!!emailError}
                            required
                        />
                    </div>
                    {emailError && (
                        <div id="login-email-error" className="auth-field-error" role="alert">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
                                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
                                <line x1="6" y1="4" x2="6" y2="6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                                <circle cx="6" cy="8.5" r="0.5" fill="currentColor" />
                            </svg>
                            {emailError}
                        </div>
                    )}
                </div>

                {/* Password */}
                <div className="auth-field">
                    <div className="auth-label-row">
                        <label htmlFor="login-password" className="auth-label">
                            Password
                        </label>
                        <Link to="/forgot-password" className="auth-link" tabIndex={0}>
                            Forgot password?
                        </Link>
                    </div>
                    <div className="auth-input-wrap">
                        <input
                            id="login-password"
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            autoComplete="current-password"
                            className={`auth-input auth-input--pw${passwordError ? ' auth-input--error' : ''}`}
                            placeholder="········"
                            value={password}
                            maxLength={128}
                            disabled={loading || isBlocked}
                            onChange={(e) => setPassword(e.target.value)}
                            onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                            aria-describedby={passwordError ? 'login-pw-error' : undefined}
                            aria-invalid={!!passwordError}
                            required
                        />
                        <button
                            type="button"
                            className="auth-pw-toggle"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            tabIndex={-1}
                        >
                            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                    </div>
                    {passwordError && (
                        <div id="login-pw-error" className="auth-field-error" role="alert">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
                                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
                                <line x1="6" y1="4" x2="6" y2="6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                                <circle cx="6" cy="8.5" r="0.5" fill="currentColor" />
                            </svg>
                            {passwordError}
                        </div>
                    )}
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    className="auth-submit"
                    disabled={loading || isBlocked}
                    aria-busy={loading}
                >
                    {loading ? (
                        <>
                            <span className="auth-spinner" />
                            Signing in…
                        </>
                    ) : isBlocked ? (
                        'Please wait…'
                    ) : (
                        <>
                            Sign in
                            <ArrowIcon />
                        </>
                    )}
                </button>
            </form>
        </AuthLayout>
    );
}

// ─────────────────────────────────────────────
// Inline prompt: Forced password change
// ─────────────────────────────────────────────

interface ForcedChangePasswordPromptProps {
    user: UserProfile;
    onContinue: () => void;
}

function ForcedChangePasswordPrompt({ user, onContinue }: ForcedChangePasswordPromptProps) {
    return (
        <>
            <header className="auth-page-header">
                <p className="auth-page-eyebrow">Action required</p>
                <h1 className="auth-page-title">Update your password</h1>
                <p className="auth-page-sub">
                    Hi {user.fullName.split(' ')[0]}, your account requires a password change before you
                    can continue. This is a one-time step.
                </p>
            </header>
            <StatusBanner
                variant="warn"
                title="Password change required"
                message="Your administrator has required you to set a new password. Please continue to update it."
            />
            <button
                type="button"
                className="auth-submit"
                onClick={onContinue}
                style={{ marginTop: 20 }}
            >
                Set new password
            </button>
        </>
    );
}

// ─────────────────────────────────────────────
// Inline prompt: Email verification required
// ─────────────────────────────────────────────

interface EmailVerifyPromptProps {
    user: UserProfile;
    onContinue: () => void;
}

function EmailVerifyPrompt({ user, onContinue }: EmailVerifyPromptProps) {
    return (
        <>
            <div className="auth-verify-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            </div>
            <header className="auth-page-header">
                <p className="auth-page-eyebrow">Almost there</p>
                <h1 className="auth-page-title">Verify your email</h1>
                <p className="auth-page-sub">
                    We sent a verification link to <strong>{user.emailAddress}</strong>. Please
                    check your inbox and verify your account before continuing.
                </p>
            </header>
            <button
                type="button"
                className="auth-submit"
                onClick={onContinue}
            >
                I need to resend the email
            </button>
            <div className="auth-form-footer" style={{ marginTop: 16 }}>
                <span>Already verified?{' '}
                    <Link to="/login" className="auth-link">Back to sign in</Link>
                </span>
            </div>
        </>
    );
}