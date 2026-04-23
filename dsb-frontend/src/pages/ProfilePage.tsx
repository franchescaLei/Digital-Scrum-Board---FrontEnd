import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { changePassword, updateProfile } from '../api/authApi';
import { StatusBanner } from '../components/auth/CountdownBanner';
import PasswordStrengthMeter from '../components/auth/PasswordStrengthMeter';
import { checkPasswordStrength, isPasswordValid } from '../components/auth/passwordStrengthUtils';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../services/apiClient';
import type { UserProfile } from '../types/auth';
import '../styles/auth.css';
import '../styles/profile-page.css';

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

const NAME_PART_RE = /^[\p{L}\p{M}\s'.-]+$/u;

function validatePrimaryName(value: string, label: string): string | undefined {
    const t = value.trim();
    if (t.length === 0) return `${label} is required.`;
    if (t.length > 120) return `${label} must be at most 120 characters.`;
    if (!NAME_PART_RE.test(t)) return 'Use letters, spaces, and simple punctuation only.';
    return undefined;
}

function validateOptionalName(value: string): string | undefined {
    const t = value.trim();
    if (t.length === 0) return undefined;
    if (t.length > 120) return 'Must be at most 120 characters.';
    if (!NAME_PART_RE.test(t)) return 'Use letters, spaces, and simple punctuation only.';
    return undefined;
}

function validateExtension(value: string): string | undefined {
    const t = value.trim();
    if (t.length === 0) return undefined;
    if (t.length > 32) return 'Suffix must be at most 32 characters.';
    if (!NAME_PART_RE.test(t)) return 'Use letters, spaces, and simple punctuation only.';
    return undefined;
}

function getInitials(fullName: string): string {
    return (
        fullName
            .split(' ')
            .map((n) => n[0] ?? '')
            .join('')
            .slice(0, 2)
            .toUpperCase() || '?'
    );
}

function roleAccent(roleName: string): string {
    const map: Record<string, string> = {
        Administrator: 'var(--accent-red)',
        'Scrum Master': 'var(--accent-gold)',
        Developer: '#3B82F6',
        'QA Engineer': '#8B5CF6',
    };
    return map[roleName] ?? 'var(--accent-gold)';
}

function teamLabel(user: UserProfile): string {
    // TeamID=1 is the Default Team — semantically "unassigned"
    if (user.teamID === 1) return 'Unassigned';
    if (user.teamName && user.teamName.trim()) return user.teamName.trim();
    if (user.teamID == null) return 'Unassigned';
    return `Team #${user.teamID}`;
}

export default function ProfilePage() {
    const { user, setUser } = useAuth();

    const [firstName, setFirstName] = useState('');
    const [middleName, setMiddleName] = useState('');
    const [lastName, setLastName] = useState('');
    const [nameExtension, setNameExtension] = useState('');

    const [tFirst, setTFirst] = useState(false);
    const [tMiddle, setTMiddle] = useState(false);
    const [tLast, setTLast] = useState(false);
    const [tExt, setTExt] = useState(false);
    const [nameAttempted, setNameAttempted] = useState(false);

    const [nameSubmitting, setNameSubmitting] = useState(false);
    const [nameSuccess, setNameSuccess] = useState(false);
    const [nameApiError, setNameApiError] = useState<string | null>(null);

    const [newPw, setNewPw] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [pwSubmitting, setPwSubmitting] = useState(false);
    const [newTouched, setNewTouched] = useState(false);
    const [confirmTouched, setConfirmTouched] = useState(false);
    const [pwSuccess, setPwSuccess] = useState(false);
    const [pwApiError, setPwApiError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        setFirstName(user.firstName ?? '');
        setMiddleName(user.middleName ?? '');
        setLastName(user.lastName ?? '');
        setNameExtension(user.nameExtension ?? '');
    }, [user]);

    const showName = nameAttempted || tFirst || tMiddle || tLast || tExt;
    const errFirst = showName ? validatePrimaryName(firstName, 'First name') : undefined;
    const errMiddle = showName ? validateOptionalName(middleName) : undefined;
    const errLast = showName ? validatePrimaryName(lastName, 'Last name') : undefined;
    const errExt = showName ? validateExtension(nameExtension) : undefined;

    const pwStrength = useMemo(() => checkPasswordStrength(newPw), [newPw]);
    const newPwValid = useMemo(() => isPasswordValid(pwStrength), [pwStrength]);

    const newError = newTouched && !newPwValid ? 'Password does not meet all requirements.' : undefined;
    const confirmError = confirmTouched && newPw !== confirmPw ? 'Passwords do not match.' : undefined;

    const handleSaveName = useCallback(
        async (e: FormEvent) => {
            e.preventDefault();
            setNameAttempted(true);
            setNameSuccess(false);
            setNameApiError(null);
            const e1 = validatePrimaryName(firstName, 'First name');
            const e2 = validateOptionalName(middleName);
            const e3 = validatePrimaryName(lastName, 'Last name');
            const e4 = validateExtension(nameExtension);
            if (e1 || e2 || e3 || e4 || !user) return;

            setNameSubmitting(true);
            try {
                const next = await updateProfile({
                    firstName: firstName.trim(),
                    middleName: middleName.trim() || null,
                    lastName: lastName.trim(),
                    nameExtension: nameExtension.trim() || null,
                });
                setUser(next);
                setNameSuccess(true);
            } catch (err) {
                setNameApiError(err instanceof ApiError ? err.message : 'Could not save your name.');
            } finally {
                setNameSubmitting(false);
            }
        },
        [firstName, middleName, lastName, nameExtension, user, setUser],
    );

    const handleChangePassword = useCallback(
        async (e: FormEvent) => {
            e.preventDefault();
            setNewTouched(true);
            setConfirmTouched(true);
            setPwSuccess(false);
            setPwApiError(null);
            if (!newPwValid || newPw !== confirmPw) return;

            setPwSubmitting(true);
            try {
                await changePassword({ newPassword: newPw });
                setPwSuccess(true);
                setNewPw('');
                setConfirmPw('');
                setNewTouched(false);
                setConfirmTouched(false);
            } catch (err) {
                setPwApiError(err instanceof ApiError ? err.message : 'Could not update password.');
            } finally {
                setPwSubmitting(false);
            }
        },
        [newPw, confirmPw, newPwValid],
    );

    if (!user) {
        return null;
    }

    const initials = getInitials(user.fullName);

    return (
        <div className="profile-page app-animate-in">
            <header className="page-header profile-page-header">
                <div>
                    <span className="page-eyebrow">Account</span>
                    <h1 className="page-title">Profile</h1>
                    <p className="page-subtitle">
                        Your workspace identity, your legal-style name fields, and password change for this account.
                    </p>
                </div>
            </header>

            <section className="app-card profile-identity-card" aria-labelledby="profile-identity-heading">
                <h2 id="profile-identity-heading" className="sr-only">
                    Your profile
                </h2>
                <div className="profile-identity">
                    <div className="profile-identity-avatar" aria-hidden="true">
                        {initials}
                    </div>
                    <div className="profile-identity-body">
                        <p className="profile-identity-label">Signed in as</p>
                        <p className="profile-identity-name">{user.fullName}</p>
                        <p className="profile-identity-email">{user.emailAddress}</p>
                        <dl className="profile-identity-meta">
                            <div className="profile-identity-row">
                                <dt>Role</dt>
                                <dd>
                                    <span
                                        className="profile-meta-pill profile-meta-pill--role"
                                        style={{ color: roleAccent(user.roleName) }}
                                    >
                                        {user.roleName}
                                    </span>
                                </dd>
                            </div>
                            <div className="profile-identity-row">
                                <dt>Team</dt>
                                <dd>
                                    <span className="profile-meta-pill">{teamLabel(user)}</span>
                                </dd>
                            </div>
                        </dl>
                    </div>
                </div>
            </section>

            <div className="profile-page-forms">
                <section className="app-card profile-card">
                    <h2 className="profile-card-title">Your name</h2>
                    <p className="profile-card-desc">
                        First, middle, last, and suffix are stored on your account. Email and team assignment are still
                        managed by an administrator.
                    </p>

                    {nameSuccess ? (
                        <div className="profile-banner-wrap">
                            <StatusBanner variant="success" message="Name saved." />
                        </div>
                    ) : null}

                    {nameApiError ? (
                        <div className="profile-banner-wrap">
                            <StatusBanner variant="error" message={nameApiError} />
                        </div>
                    ) : null}

                    <form className="auth-form profile-form" onSubmit={handleSaveName} noValidate>
                        <div className="auth-field">
                            <label htmlFor="profile-first" className="auth-label">
                                First name
                            </label>
                            <input
                                id="profile-first"
                                type="text"
                                autoComplete="given-name"
                                className={`auth-input${errFirst ? ' auth-input--error' : ''}`}
                                value={firstName}
                                maxLength={120}
                                disabled={nameSubmitting}
                                onChange={(ev) => {
                                    setFirstName(ev.target.value);
                                    setNameSuccess(false);
                                    setNameApiError(null);
                                }}
                                onBlur={() => setTFirst(true)}
                                aria-describedby={errFirst ? 'profile-first-err' : undefined}
                                aria-invalid={!!errFirst}
                            />
                            <FieldError id="profile-first-err" message={errFirst} />
                        </div>

                        <div className="auth-field">
                            <label htmlFor="profile-middle" className="auth-label">
                                Middle name <span className="auth-label-optional">(optional)</span>
                            </label>
                            <input
                                id="profile-middle"
                                type="text"
                                autoComplete="additional-name"
                                className={`auth-input${errMiddle ? ' auth-input--error' : ''}`}
                                value={middleName}
                                maxLength={120}
                                disabled={nameSubmitting}
                                onChange={(ev) => {
                                    setMiddleName(ev.target.value);
                                    setNameSuccess(false);
                                    setNameApiError(null);
                                }}
                                onBlur={() => setTMiddle(true)}
                                aria-describedby={errMiddle ? 'profile-middle-err' : undefined}
                                aria-invalid={!!errMiddle}
                            />
                            <FieldError id="profile-middle-err" message={errMiddle} />
                        </div>

                        <div className="auth-field">
                            <label htmlFor="profile-last" className="auth-label">
                                Last name
                            </label>
                            <input
                                id="profile-last"
                                type="text"
                                autoComplete="family-name"
                                className={`auth-input${errLast ? ' auth-input--error' : ''}`}
                                value={lastName}
                                maxLength={120}
                                disabled={nameSubmitting}
                                onChange={(ev) => {
                                    setLastName(ev.target.value);
                                    setNameSuccess(false);
                                    setNameApiError(null);
                                }}
                                onBlur={() => setTLast(true)}
                                aria-describedby={errLast ? 'profile-last-err' : undefined}
                                aria-invalid={!!errLast}
                            />
                            <FieldError id="profile-last-err" message={errLast} />
                        </div>

                        <div className="auth-field">
                            <label htmlFor="profile-suffix" className="auth-label">
                                Suffix <span className="auth-label-optional">(optional)</span>
                            </label>
                            <input
                                id="profile-suffix"
                                type="text"
                                autoComplete="honorific-suffix"
                                className={`auth-input${errExt ? ' auth-input--error' : ''}`}
                                value={nameExtension}
                                maxLength={32}
                                disabled={nameSubmitting}
                                onChange={(ev) => {
                                    setNameExtension(ev.target.value);
                                    setNameSuccess(false);
                                    setNameApiError(null);
                                }}
                                onBlur={() => setTExt(true)}
                                aria-describedby={errExt ? 'profile-suffix-err' : undefined}
                                aria-invalid={!!errExt}
                            />
                            <FieldError id="profile-suffix-err" message={errExt} />
                        </div>

                        <button type="submit" className="auth-submit profile-submit" disabled={nameSubmitting}>
                            {nameSubmitting ? (
                                <>
                                    <span className="auth-spinner" />
                                    Saving…
                                </>
                            ) : (
                                'Save name'
                            )}
                        </button>
                    </form>
                </section>

                <section className="app-card profile-card">
                    <h2 className="profile-card-title">Change password</h2>
                    <p className="profile-card-desc">
                        Choose a strong password. It must meet the same rules as the reset-password flow.
                    </p>

                    {pwSuccess ? (
                        <div className="profile-banner-wrap">
                            <StatusBanner variant="success" message="Password updated." />
                        </div>
                    ) : null}

                    {pwApiError ? (
                        <div className="profile-banner-wrap">
                            <StatusBanner variant="error" message={pwApiError} />
                        </div>
                    ) : null}

                    <form className="auth-form profile-form" onSubmit={handleChangePassword} noValidate>
                        <div className="auth-field">
                            <label htmlFor="profile-new-pw" className="auth-label">
                                New password
                            </label>
                            <div className="auth-input-wrap">
                                <input
                                    id="profile-new-pw"
                                    type={showPw ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    className={`auth-input auth-input--pw${newError ? ' auth-input--error' : ''}`}
                                    placeholder="········"
                                    value={newPw}
                                    maxLength={128}
                                    disabled={pwSubmitting}
                                    onChange={(e) => {
                                        setNewPw(e.target.value);
                                        setPwSuccess(false);
                                        setPwApiError(null);
                                    }}
                                    onBlur={() => setNewTouched(true)}
                                    aria-describedby="profile-pw-meter profile-new-err"
                                    aria-invalid={!!newError}
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
                            <div id="profile-pw-meter">
                                <PasswordStrengthMeter password={newPw} />
                            </div>
                            <FieldError id="profile-new-err" message={newError} />
                        </div>

                        <div className="auth-field">
                            <label htmlFor="profile-confirm-pw" className="auth-label">
                                Confirm new password
                            </label>
                            <div className="auth-input-wrap">
                                <input
                                    id="profile-confirm-pw"
                                    type={showPw ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    className={`auth-input auth-input--pw${confirmError ? ' auth-input--error' : ''}`}
                                    placeholder="········"
                                    value={confirmPw}
                                    maxLength={128}
                                    disabled={pwSubmitting}
                                    onChange={(e) => {
                                        setConfirmPw(e.target.value);
                                        setPwSuccess(false);
                                        setPwApiError(null);
                                    }}
                                    onBlur={() => setConfirmTouched(true)}
                                    aria-describedby={confirmError ? 'profile-confirm-err' : undefined}
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
                            <FieldError id="profile-confirm-err" message={confirmError} />
                        </div>

                        <button type="submit" className="auth-submit profile-submit" disabled={pwSubmitting}>
                            {pwSubmitting ? (
                                <>
                                    <span className="auth-spinner" />
                                    Updating…
                                </>
                            ) : (
                                'Update password'
                            )}
                        </button>
                    </form>
                </section>
            </div>
        </div>
    );
}
