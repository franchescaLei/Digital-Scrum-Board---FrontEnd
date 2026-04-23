import {
    type ClipboardEvent,
    type FormEvent,
    type KeyboardEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout';
import CountdownBanner, { StatusBanner } from '../components/auth/CountdownBanner';
import PasswordStrengthMeter from '../components/auth/PasswordStrengthMeter';
import { checkPasswordStrength, isPasswordValid } from '../components/auth/passwordStrengthUtils';
import { forgotPassword, verifyResetCode, resetPassword } from '../api/authApi';
import { ApiError } from '../services/apiClient';
import { validateEmailAddress } from '../utils/validateEmail';

// ── Icons ─────────────────────────────────────

const BackIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path d="M10 7H3M6 3L2 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

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

// ── Step indicator ────────────────────────────

function StepBar({ current, total }: { current: number; total: number }) {
    return (
        <div className="auth-steps" aria-label={`Step ${current} of ${total}`}>
            {Array.from({ length: total }, (_, i) => {
                const step = i + 1;
                const isDone = step < current;
                const isActive = step === current;
                return (
                    <div
                        key={step}
                        className={`auth-step ${isDone ? 'auth-step--done' : isActive ? 'auth-step--active' : 'auth-step--future'}`}
                    />
                );
            })}
        </div>
    );
}

// ── OTP input ─────────────────────────────────

const OTP_LENGTH = 6;

interface OtpInputProps {
    value: string[];
    onChange: (v: string[]) => void;
    disabled?: boolean;
}

function OtpInput({ value, onChange, disabled }: OtpInputProps) {
    const refs = useRef<Array<HTMLInputElement | null>>([]);

    const handleChange = (index: number, raw: string) => {
        const digit = raw.replace(/\D/g, '').slice(-1);
        const next = [...value];
        next[index] = digit;
        onChange(next);
        if (digit && index < OTP_LENGTH - 1) {
            refs.current[index + 1]?.focus();
        }
    };

    const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace') {
            e.preventDefault();
            const next = [...value];
            if (value[index]) {
                // Delete current box value, then move focus to previous box
                next[index] = '';
                onChange(next);
                if (index > 0) {
                    refs.current[index - 1]?.focus();
                }
            } else if (index > 0) {
                // Current box already empty, just move to previous box and delete it
                next[index - 1] = '';
                onChange(next);
                refs.current[index - 1]?.focus();
            }
        }
        if (e.key === 'ArrowLeft' && index > 0) {
            e.preventDefault();
            refs.current[index - 1]?.focus();
        }
        if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
            e.preventDefault();
            refs.current[index + 1]?.focus();
        }
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
        if (!pasted) return;
        const next = Array.from({ length: OTP_LENGTH }, (_, i) => pasted[i] ?? '');
        onChange(next);
        const lastFilled = Math.min(pasted.length, OTP_LENGTH - 1);
        refs.current[lastFilled]?.focus();
    };

    return (
        <div className="auth-otp-wrap" role="group" aria-label="6-digit verification code">
            {Array.from({ length: OTP_LENGTH }, (_, i) => (
                <input
                    key={i}
                    ref={(el) => { refs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]"
                    maxLength={1}
                    className={`auth-otp-input${value[i] ? ' auth-otp-input--filled' : ''}`}
                    value={value[i] ?? ''}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={i === 0 ? handlePaste : undefined}
                    disabled={disabled}
                    aria-label={`Digit ${i + 1}`}
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                />
            ))}
        </div>
    );
}

// ── Field error helper ────────────────────────

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

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4; // 1=email, 2=code, 3=new pw, 4=done

export default function ForgotPasswordPage() {
    const navigate = useNavigate();
    const [step, setStep] = useState<Step>(1);

    // Shared state across steps
    const [email, setEmail] = useState('');
    const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [infoMessage, setInfoMessage] = useState('');
    const [emailTouched, setEmailTouched] = useState(false);
    const [blockedUntilSeconds, setBlockedUntilSeconds] = useState(0);
    const [blockKind, setBlockKind] = useState<'none' | 'rate_limit' | 'account_locked'>('none');

    // ── Step 1: request reset email ─────────────
    const emailError = emailTouched ? validateEmailAddress(email) : undefined;

    const handleRequestCode = useCallback(
        async (e: FormEvent) => {
            e.preventDefault();
            setEmailTouched(true);
            if (emailError || !email.trim()) return;
            setLoading(true);
            setError('');
            setInfoMessage('');
            try {
                const response = await forgotPassword({ emailAddress: email });
                setInfoMessage(response.message);
                setStep(2);
            } catch (err) {
                if (err instanceof ApiError) {
                    setError(err.message || 'Failed to send reset email. Please try again.');
                } else {
                    setError('An unexpected error occurred.');
                }
            } finally {
                setLoading(false);
            }
        },
        [email, emailError],
    );

    // ── Step 2: verify 6-digit code ─────────────
    const otpValue = otpDigits.join('');
    const isOtpComplete = otpValue.length === OTP_LENGTH && /^\d{6}$/.test(otpValue);

    const handleVerifyCode = useCallback(
        async (e: FormEvent) => {
            e.preventDefault();
            if (!isOtpComplete) {
                setError('Enter the full 6-digit code.');
                return;
            }
            setLoading(true);
            setError('');
            setInfoMessage('');
            try {
                await verifyResetCode({ emailAddress: email, token: otpValue });
                setStep(3);
            } catch (err) {
                if (err instanceof ApiError) {
                    if (err.isAccountLocked && err.retryAfterSeconds) {
                        setBlockedUntilSeconds(err.retryAfterSeconds);
                        setBlockKind('account_locked');
                        setError('');
                    } else if ((err.isAuthRateLimited || err.isRateLimited) && err.retryAfterSeconds) {
                        setBlockedUntilSeconds(err.retryAfterSeconds);
                        setBlockKind('rate_limit');
                        setError('');
                    } else {
                        setError(err.message || 'Invalid or expired code.');
                    }
                } else {
                    setError('An unexpected error occurred.');
                }
            } finally {
                setLoading(false);
            }
        },
        [email, otpValue, isOtpComplete],
    );

    useEffect(() => {
        if (blockedUntilSeconds <= 0) {
            setBlockKind('none');
        }
    }, [blockedUntilSeconds]);

    // ── Step 3: set new password ─────────────────
    const pwStrength = checkPasswordStrength(newPw);
    const pwValid = isPasswordValid(pwStrength);
    const [pwTouched, setPwTouched] = useState(false);
    const [confirmTouched, setConfirmTouched] = useState(false);
    const pwError = pwTouched && !pwValid
        ? 'Password does not meet all requirements.'
        : undefined;
    const confirmError = confirmTouched && newPw !== confirmPw
        ? 'Passwords do not match.'
        : undefined;

    const handleResetPassword = useCallback(
        async (e: FormEvent) => {
            e.preventDefault();
            setPwTouched(true);
            setConfirmTouched(true);
            if (!pwValid || newPw !== confirmPw) return;
            setLoading(true);
            setError('');
            try {
                await resetPassword({ emailAddress: email, token: otpValue, newPassword: newPw });
                setStep(4);
            } catch (err) {
                if (err instanceof ApiError) {
                    setError(err.message || 'Failed to reset password. Please try again.');
                } else {
                    setError('An unexpected error occurred.');
                }
            } finally {
                setLoading(false);
            }
        },
        [email, otpValue, newPw, confirmPw, pwValid],
    );

    // ─────────────────────────────────────────────
    // Render steps
    // ─────────────────────────────────────────────

    return (
        <AuthLayout>
            {/* Back to login */}
            {step !== 4 && (
                <Link to="/login" className="auth-back-link">
                    <BackIcon />
                    Back to sign in
                </Link>
            )}

            {/* Step indicator */}
            {step !== 4 && <StepBar current={step} total={3} />}

            {/* ── Step 1: Email ─────────────────────── */}
            {step === 1 && (
                <>
                    <header className="auth-page-header">
                        <p className="auth-page-eyebrow">Password reset</p>
                        <h1 className="auth-page-title">Forgot your password?</h1>
                        <p className="auth-page-sub">
                            Enter your email address and we'll send you a 6-digit reset code.
                        </p>
                    </header>

                    {error && <StatusBanner variant="error" message={error} />}
                    {infoMessage && <StatusBanner variant="info" message={infoMessage} />}

                    <form className="auth-form" onSubmit={handleRequestCode} noValidate>
                        <div className="auth-field">
                            <label htmlFor="fp-email" className="auth-label">Email address</label>
                            <input
                                id="fp-email"
                                type="email"
                                autoComplete="email"
                                autoCapitalize="off"
                                className={`auth-input${emailError ? ' auth-input--error' : ''}`}
                                placeholder="you@company.com"
                                value={email}
                                maxLength={100}
                                disabled={loading}
                                onChange={(e) => setEmail(e.target.value)}
                                onBlur={() => setEmailTouched(true)}
                                aria-describedby={emailError ? 'fp-email-error' : undefined}
                                aria-invalid={!!emailError}
                                required
                            />
                            <FieldError id="fp-email-error" message={emailError} />
                        </div>

                        <button type="submit" className="auth-submit" disabled={loading}>
                            {loading ? <><span className="auth-spinner" />Sending code…</> : 'Send reset code'}
                        </button>
                    </form>
                </>
            )}

            {/* ── Step 2: Verify code ───────────────── */}
            {step === 2 && (
                <>
                    <header className="auth-page-header">
                        <p className="auth-page-eyebrow">Check your inbox</p>
                        <h1 className="auth-page-title">Enter the code</h1>
                        <p className="auth-page-sub">
                            We sent a 6-digit code to <strong>{email}</strong>. It expires shortly.
                        </p>
                    </header>

                    {(blockKind === 'account_locked' && blockedUntilSeconds > 0) ||
                    (blockKind === 'rate_limit' && blockedUntilSeconds > 0) ||
                    error ? (
                        <div style={{ marginBottom: 20 }}>
                            {blockKind === 'account_locked' && blockedUntilSeconds > 0 && (
                                <CountdownBanner
                                    variant="lock"
                                    seconds={blockedUntilSeconds}
                                    title="Reset code temporarily locked"
                                    message="Too many invalid code attempts. Please wait before trying again:"
                                    onExpire={() => {
                                        setBlockedUntilSeconds(0);
                                        setBlockKind('none');
                                    }}
                                />
                            )}

                            {blockKind === 'rate_limit' && blockedUntilSeconds > 0 && (
                                <CountdownBanner
                                    variant="warn"
                                    seconds={blockedUntilSeconds}
                                    title="Too many code attempts"
                                    message="Please wait before entering another reset code:"
                                    onExpire={() => {
                                        setBlockedUntilSeconds(0);
                                        setBlockKind('none');
                                    }}
                                />
                            )}

                            {error && <StatusBanner variant="error" message={error} />}
                        </div>
                    ) : null}

                    <form
                        className="auth-form"
                        onSubmit={handleVerifyCode}
                        noValidate
                        style={{ alignItems: 'center' }}
                    >
                        <OtpInput value={otpDigits} onChange={setOtpDigits} disabled={loading} />

                        <button
                            type="submit"
                            className="auth-submit"
                            style={{ width: '100%' }}
                            disabled={loading || !isOtpComplete || blockedUntilSeconds > 0}
                        >
                            {loading ? <><span className="auth-spinner" />Verifying…</> : 'Verify code'}
                        </button>

                        <button
                            type="button"
                            className="auth-link"
                            style={{ fontSize: '0.8125rem' }}
                            onClick={() => {
                                setError('');
                                setOtpDigits(Array(OTP_LENGTH).fill(''));
                                setStep(1);
                            }}
                        >
                            Didn't receive it? Send again
                        </button>
                    </form>
                </>
            )}

            {/* ── Step 3: New password ──────────────── */}
            {step === 3 && (
                <>
                    <header className="auth-page-header">
                        <p className="auth-page-eyebrow">Create new password</p>
                        <h1 className="auth-page-title">Set your password</h1>
                        <p className="auth-page-sub">
                            Choose a strong password that meets all the requirements below.
                        </p>
                    </header>

                    {error && <StatusBanner variant="error" message={error} />}

                    <form className="auth-form" onSubmit={handleResetPassword} noValidate>
                        {/* New password */}
                        <div className="auth-field">
                            <label htmlFor="fp-new-pw" className="auth-label">New password</label>
                            <div className="auth-input-wrap">
                                <input
                                    id="fp-new-pw"
                                    type={showPw ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    className={`auth-input auth-input--pw${pwError ? ' auth-input--error' : ''}`}
                                    placeholder="········"
                                    value={newPw}
                                    maxLength={128}
                                    disabled={loading}
                                    onChange={(e) => setNewPw(e.target.value)}
                                    onBlur={() => setPwTouched(true)}
                                    aria-describedby="fp-pw-strength fp-new-pw-error"
                                    aria-invalid={!!pwError}
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
                            <div id="fp-pw-strength"><PasswordStrengthMeter password={newPw} /></div>
                            <FieldError id="fp-new-pw-error" message={pwError} />
                        </div>

                        {/* Confirm password */}
                        <div className="auth-field">
                            <label htmlFor="fp-confirm-pw" className="auth-label">Confirm password</label>
                            <div className="auth-input-wrap">
                                <input
                                    id="fp-confirm-pw"
                                    type={showPw ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    className={`auth-input auth-input--pw${confirmError ? ' auth-input--error' : ''}`}
                                    placeholder="········"
                                    value={confirmPw}
                                    maxLength={128}
                                    disabled={loading}
                                    onChange={(e) => setConfirmPw(e.target.value)}
                                    onBlur={() => setConfirmTouched(true)}
                                    aria-describedby={confirmError ? 'fp-confirm-pw-error' : undefined}
                                    aria-invalid={!!confirmError}
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
                            <FieldError id="fp-confirm-pw-error" message={confirmError} />
                        </div>

                        <button
                            type="submit"
                            className="auth-submit"
                            disabled={loading}
                        >
                            {loading ? <><span className="auth-spinner" />Resetting…</> : 'Reset password'}
                        </button>
                    </form>
                </>
            )}

            {/* ── Step 4: Success ───────────────────── */}
            {step === 4 && (
                <>
                    <div className="auth-verify-icon" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                            <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <header className="auth-page-header">
                        <p className="auth-page-eyebrow">All done</p>
                        <h1 className="auth-page-title">Password reset</h1>
                        <p className="auth-page-sub">
                            Your password has been updated successfully. You can now sign in with
                            your new password.
                        </p>
                    </header>
                    <button
                        type="button"
                        className="auth-submit"
                        onClick={() => navigate('/login', { replace: true })}
                    >
                        Back to sign in
                    </button>
                </>
            )}
        </AuthLayout>
    );
}