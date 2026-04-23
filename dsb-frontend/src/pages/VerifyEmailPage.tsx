import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout';
import { StatusBanner } from '../components/auth/CountdownBanner';
import { getActiveBoards } from '../api/boardsApi';
import { getCurrentUser, logout, resendVerification, verifyEmail } from '../api/authApi';
import { ApiError } from '../services/apiClient';

type VerifyState = 'idle' | 'verifying' | 'verified' | 'error';

export default function VerifyEmailPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');

    const [userEmail, setUserEmail] = useState<string | null>(null);

    // ── Token verification (arriving via email link) ─
    const [verifyState, setVerifyState] = useState<VerifyState>(token ? 'verifying' : 'idle');
    const [verifyError, setVerifyError] = useState('');

    useEffect(() => {
        if (!token) return;

        verifyEmail(token)
            .then(() => {
                setVerifyState('verified');
                // After successful verification, redirect to the confirmation page
                setTimeout(() => navigate('/email-verified', { replace: true }), 1500);
            })
            .catch((err) => {
                setVerifyError(
                    err instanceof ApiError
                        ? err.message
                        : 'Verification failed. The link may have expired.',
                );
                setVerifyState('error');
            });
    }, [token, navigate]);

    // If the user is already authenticated, routing should continue once verification succeeds.
    const navigateDoneRef = useRef(false);
    useEffect(() => {
        if (!token) return;
        if (verifyState !== 'verified') return;
        if (navigateDoneRef.current) return;
        navigateDoneRef.current = true;

        (async () => {
            try {
                await getCurrentUser();
            } catch {
                navigate('/login', { replace: true });
                return;
            }

            try {
                await getActiveBoards();
                navigate('/', { replace: true });
            } catch (probeErr) {
                if (probeErr instanceof ApiError) {
                    if (probeErr.isPasswordChangeRequired) {
                        navigate('/change-password', { replace: true });
                        return;
                    }
                    if (probeErr.isEmailVerificationRequired) {
                        navigate('/verify-email', { replace: true });
                        return;
                    }
                }
                navigate('/', { replace: true });
            }
        })();
    }, [token, verifyState, navigate]);

    // ── Resend flow ───────────────────────────────
    const [resendState, setResendState] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
    const [resendError, setResendError] = useState('');

    const handleResend = async () => {
        setResendState('loading');
        setResendError('');
        try {
            await resendVerification();
            setResendState('sent');

            // If the gate is already cleared (possible if the user verified in another tab),
            // route them onward.
            try {
                await getActiveBoards();
                navigate('/', { replace: true });
            } catch (probeErr) {
                if (probeErr instanceof ApiError) {
                    if (probeErr.isPasswordChangeRequired) {
                        navigate('/change-password', { replace: true });
                        return;
                    }
                    if (probeErr.isEmailVerificationRequired) {
                        // Still blocked; remain on this screen.
                        return;
                    }
                }
            }
        } catch (err) {
            setResendError(err instanceof ApiError ? err.message : 'Failed to resend. Please try again.');
            setResendState('error');
        }
    };

    // ── Rehydration / partial-auth gate mode ─────────────────────────────
    useEffect(() => {
        if (token) return; // token-mode handled above

        let cancelled = false;

        (async () => {
            try {
                const me = await getCurrentUser();
                if (cancelled) return;
                setUserEmail(me.emailAddress);
            } catch {
                navigate('/login', { replace: true });
                return;
            }

            try {
                await getActiveBoards();
                if (cancelled) return;
                navigate('/', { replace: true });
            } catch (probeErr) {
                if (cancelled) return;
                if (probeErr instanceof ApiError) {
                    if (probeErr.isUnauthorized) {
                        navigate('/login', { replace: true });
                        return;
                    }
                    if (probeErr.isPasswordChangeRequired) {
                        navigate('/change-password', { replace: true });
                        return;
                    }
                    // EMAIL_VERIFICATION_REQUIRED → stay on this gate screen
                    if (probeErr.isEmailVerificationRequired) return;
                }
                // Any other failure: still keep the user on the gate screen.
            }
        })();

        // Poll until the gate is cleared so the UI transitions without refresh.
        const intervalId = window.setInterval(async () => {
            if (cancelled) return;
            try {
                await getActiveBoards();
                if (cancelled) return;
                navigate('/', { replace: true });
                window.clearInterval(intervalId);
            } catch (probeErr) {
                if (probeErr instanceof ApiError) {
                    if (probeErr.isPasswordChangeRequired) {
                        navigate('/change-password', { replace: true });
                        window.clearInterval(intervalId);
                        return;
                    }
                    if (probeErr.isUnauthorized) {
                        navigate('/login', { replace: true });
                        window.clearInterval(intervalId);
                        return;
                    }
                    // Still blocked by EMAIL_VERIFICATION_REQUIRED → keep polling.
                }
            }
        }, 5000);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [token, navigate]);

    // ── Token present: show verification result ───
    if (token) {
        if (verifyState === 'verifying') {
            return (
                <AuthLayout>
                    <header className="auth-page-header">
                        <p className="auth-page-eyebrow">Verifying</p>
                        <h1 className="auth-page-title">Confirming your email…</h1>
                        <p className="auth-page-sub">Please wait while we verify your email address.</p>
                    </header>
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                        <span
                            className="auth-spinner"
                            style={{
                                width: 24,
                                height: 24,
                                borderWidth: 2.5,
                                borderColor: 'var(--divider)',
                                borderTopColor: 'var(--accent-red)',
                            }}
                        />
                    </div>
                </AuthLayout>
            );
        }

        if (verifyState === 'verified') {
            return (
                <AuthLayout>
                    <div
                        className="auth-verify-icon"
                        style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                            <path
                                d="M8 12l3 3 5-5"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </div>
                    <header className="auth-page-header">
                        <p className="auth-page-eyebrow">Verified</p>
                        <h1 className="auth-page-title">Email confirmed</h1>
                        <p className="auth-page-sub">Redirecting you to the confirmation page...</p>
                    </header>
                    <button
                        type="button"
                        className="auth-submit"
                        onClick={() => navigate('/email-verified', { replace: true })}
                    >
                        Continue to Main Page
                    </button>
                </AuthLayout>
            );
        }

        if (verifyState === 'error') {
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
                        <p className="auth-page-sub">{verifyError}</p>
                    </header>
                    <VerifyEmailPrompt resendState={resendState} resendError={resendError} onResend={handleResend} />
                </AuthLayout>
            );
        }
    }

    // ── Gate UI: authenticated but email verification required ───
    return (
        <AuthLayout>
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
                    Your account is ready, but email verification is required before you can access the app.
                    {userEmail ? (
                        <>
                            {' '}
                            We sent the link to <strong>{userEmail}</strong>.
                        </>
                    ) : null}
                </p>
            </header>

            <StatusBanner
                variant="info"
                title="Check your inbox"
                message="Open the verification email we sent you. If you don’t see it, you can resend the email."
            />

            <div style={{ marginTop: 20 }}>
                <VerifyEmailPrompt resendState={resendState} resendError={resendError} onResend={handleResend} />
            </div>

            <div className="auth-form-footer" style={{ marginTop: 16 }}>
                <button
                    type="button"
                    className="auth-link"
                    onClick={async () => {
                        try {
                            await logout();
                        } finally {
                            navigate('/login', { replace: true });
                        }
                    }}
                    disabled={resendState === 'loading'}
                >
                    Sign out
                </button>
                <div style={{ marginTop: 10 }}>
                    <span>
                        Having trouble?{' '}
                        <Link to="/login" className="auth-link">
                            Back to sign in
                        </Link>
                    </span>
                </div>
            </div>
        </AuthLayout>
    );
}

// ── Resend sub-component ──────────────────────
interface VerifyEmailPromptProps {
    resendState: 'idle' | 'loading' | 'sent' | 'error';
    resendError: string;
    onResend: () => void;
}

function VerifyEmailPrompt({ resendState, resendError, onResend }: VerifyEmailPromptProps) {
    if (resendState === 'sent') {
        return (
            <StatusBanner
                variant="success"
                title="Email sent"
                message="A new verification email has been sent. Please check your inbox."
            />
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {resendState === 'error' && <StatusBanner variant="error" message={resendError} />}
            <button
                type="button"
                className="auth-submit"
                onClick={onResend}
                disabled={resendState === 'loading'}
            >
                {resendState === 'loading' ? (
                    <>
                        <span className="auth-spinner" />
                        Sending…
                    </>
                ) : (
                    'Resend verification email'
                )}
            </button>
        </div>
    );
}