import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout';
import { StatusBanner } from '../components/auth/CountdownBanner';
import PasswordStrengthMeter from '../components/auth/PasswordStrengthMeter';
import { checkPasswordStrength, isPasswordValid } from '../components/auth/passwordStrengthUtils';
import { changePassword, getCurrentUser, logout } from '../api/authApi';
import { ApiError } from '../services/apiClient';
import { getActiveBoards } from '../api/boardsApi';

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

function FieldError({ id, message }: { id: string; message?: string }) {
    if (!message) return null;
    return (
        <div id={id} className="auth-field-error" role="alert">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
                <line x1="6" y1="4" x2="6" y2="6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="6" cy="8.5" r="0.5" fill="currentColor" />
            </svg>
            {message}
        </div>
    );
}

export default function ChangePasswordPage() {
    const navigate = useNavigate();

    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [newTouched, setNewTouched] = useState(false);
    const [confirmTouched, setConfirmTouched] = useState(false);

    const [userEmail, setUserEmail] = useState<string | null>(null);
    const newPwRef = useRef<HTMLInputElement>(null);

    const pwStrength = useMemo(() => checkPasswordStrength(newPw), [newPw]);
    const pwValid = useMemo(() => {
        if (newPw.length < 8 || newPw.length > 128) return false;
        return isPasswordValid(pwStrength);
    }, [pwStrength, newPw.length]);

    const confirmError = confirmTouched && newPw !== confirmPw ? 'Passwords do not match.' : undefined;
    const newError = newTouched && !pwValid ? 'Password must meet all requirements.' : undefined;

    useEffect(() => {
        // Rehydrate partial-auth state:
        // - If no session: send to normal login
        // - If password change gate is cleared: send to the correct next screen
        // - If email verification is still required: send to /verify-email
        (async () => {
            try {
                const me = await getCurrentUser();
                setUserEmail(me.emailAddress);
            } catch (err) {
                if (err instanceof ApiError && err.isUnauthorized) {
                    navigate('/login', { replace: true });
                    return;
                }
                // If we can't fetch user, fall back to login.
                navigate('/login', { replace: true });
                return;
            }

            try {
                await getActiveBoards();
                // No partial gate: proceed to main app
                navigate('/', { replace: true });
            } catch (probeErr) {
                if (probeErr instanceof ApiError) {
                    if (probeErr.isUnauthorized) {
                        navigate('/login', { replace: true });
                        return;
                    }
                    if (probeErr.isEmailVerificationRequired) {
                        navigate('/verify-email', { replace: true });
                        return;
                    }
                    // Otherwise: treat as password-change required (stay on page)
                    if (probeErr.isPasswordChangeRequired) return;
                    // Non-partial 403/500: still proceed with the gate screen
                    return;
                }
            }
        })();
    }, [navigate]);

    useEffect(() => {
        // Improve keyboard UX: focus new password immediately on mount.
        newPwRef.current?.focus();
    }, []);

    const handleSubmit = useCallback(
        async (e: FormEvent) => {
            e.preventDefault();
            setNewTouched(true);
            setConfirmTouched(true);
            if (newError || confirmError || !pwValid || newPw !== confirmPw) return;

            setLoading(true);
            setError('');
            try {
                await changePassword({ newPassword: newPw });

                // After changing the password, the next gate depends on whether email is verified.
                try {
                    await getActiveBoards();
                    navigate('/', { replace: true });
                } catch (probeErr) {
                    if (probeErr instanceof ApiError) {
                        if (probeErr.isEmailVerificationRequired) {
                            navigate('/verify-email', { replace: true });
                            return;
                        }
                        if (probeErr.isPasswordChangeRequired) {
                            setError('Your password was not updated yet. Please try again.');
                            return;
                        }
                        if (probeErr.isUnauthorized) {
                            navigate('/login', { replace: true });
                            return;
                        }
                        // If some other 403 occurs, still move user forward to unblock the UI.
                        navigate('/', { replace: true });
                        return;
                    }
                    navigate('/', { replace: true });
                }
            } catch (err) {
                if (err instanceof ApiError) {
                    setError(err.message || 'Failed to change password.');
                } else {
                    setError('An unexpected error occurred.');
                }
            } finally {
                setLoading(false);
            }
        },
        [newPw, confirmPw, pwValid, newError, confirmError, navigate],
    );

    return (
        <AuthLayout>
            <header className="auth-page-header">
                <p className="auth-page-eyebrow">Account security</p>
                <h1 className="auth-page-title">Update your password</h1>
                <p className="auth-page-sub">
                    Your account requires a new password before you can continue. Please
                    choose a strong password that meets all requirements.
                </p>
            </header>

            <StatusBanner
                variant="warn"
                title="Password change required"
                message="This action is required by your administrator before you can access the workspace."
            />

            {error && (
                <div style={{ marginTop: 16 }}>
                    <StatusBanner variant="error" message={error} />
                </div>
            )}

            <form className="auth-form" onSubmit={handleSubmit} noValidate style={{ marginTop: 20 }}>
                {/* New password */}
                <div className="auth-field">
                    <label htmlFor="cp-new" className="auth-label">New password</label>
                    <div className="auth-input-wrap">
                        <input
                            id="cp-new"
                            ref={newPwRef}
                            type={showPw ? 'text' : 'password'}
                            autoComplete="new-password"
                            className={`auth-input auth-input--pw${newError ? ' auth-input--error' : ''}`}
                            placeholder="········"
                            value={newPw}
                            maxLength={128}
                            disabled={loading}
                            onChange={(e) => setNewPw(e.target.value)}
                            onBlur={() => setNewTouched(true)}
                            aria-describedby="cp-pw-strength cp-new-error"
                            aria-invalid={!!newError}
                            required
                        />
                        <button
                            type="button"
                            className="auth-pw-toggle"
                            onClick={() => setShowPw((v) => !v)}
                            aria-label={showPw ? 'Hide password' : 'Show password'}
                            tabIndex={-1}
                        >
                            {showPw ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                    </div>
                    <div id="cp-pw-strength"><PasswordStrengthMeter password={newPw} /></div>
                    <FieldError id="cp-new-error" message={newError} />
                </div>

                {/* Confirm password */}
                <div className="auth-field">
                    <label htmlFor="cp-confirm" className="auth-label">Confirm new password</label>
                    <div className="auth-input-wrap">
                        <input
                            id="cp-confirm"
                            type={showPw ? 'text' : 'password'}
                            autoComplete="new-password"
                            className={`auth-input auth-input--pw${confirmError ? ' auth-input--error' : ''}`}
                            placeholder="········"
                            value={confirmPw}
                            maxLength={128}
                            disabled={loading}
                            onChange={(e) => setConfirmPw(e.target.value)}
                            onBlur={() => setConfirmTouched(true)}
                            aria-describedby={confirmError ? 'cp-confirm-error' : undefined}
                            aria-invalid={!!confirmError}
                            required
                        />
                        <button
                            type="button"
                            className="auth-pw-toggle"
                            onClick={() => setShowPw((v) => !v)}
                            aria-label={showPw ? 'Hide password' : 'Show password'}
                            tabIndex={-1}
                        >
                            {showPw ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                    </div>
                    <FieldError id="cp-confirm-error" message={confirmError} />
                </div>

                <button type="submit" className="auth-submit" disabled={!pwValid || newPw !== confirmPw || loading}>
                    {loading ? <><span className="auth-spinner" />Updating…</> : 'Update password'}
                </button>
            </form>

            <div className="auth-form-footer" style={{ marginTop: 16 }}>
                <span>
                    Signed in as {userEmail ? <strong>{userEmail}</strong> : 'your account'}
                </span>
                <button
                    type="button"
                    className="auth-link"
                    style={{ marginTop: 10 }}
                    onClick={async () => {
                        try {
                            await logout();
                        } finally {
                            navigate('/login', { replace: true });
                        }
                    }}
                    disabled={loading}
                >
                    Sign out
                </button>
            </div>
        </AuthLayout>
    );
}