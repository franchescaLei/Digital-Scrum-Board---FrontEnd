import { useEffect, useRef, useState } from 'react';

// ── Icons ─────────────────────────────────────
const LockIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="3" y="7" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="8" cy="11" r="1" fill="currentColor" />
    </svg>
);

const ClockIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const AlertIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <line x1="8" y1="7" x2="8" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="8" cy="12" r="0.5" fill="currentColor" stroke="currentColor" strokeWidth="0.5" />
    </svg>
);

// ── Types ─────────────────────────────────────
type BannerVariant = 'error' | 'warn' | 'lock' | 'info' | 'success';

interface CountdownBannerProps {
    /** Total seconds to count down from */
    seconds: number;
    /** Called when countdown reaches zero */
    onExpire?: () => void;
    /** Banner variant; 'lock' = account locked (more severe) */
    variant?: BannerVariant;
    /** Title line above countdown */
    title?: string;
    /** Optional message below the timer */
    message?: string;
}

function formatSeconds(total: number): string {
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    if (minutes > 0) {
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    return `${seconds}s`;
}

export default function CountdownBanner({
    seconds,
    onExpire,
    variant = 'warn',
    title,
    message,
}: CountdownBannerProps) {
    const [remaining, setRemaining] = useState(Math.max(0, Math.ceil(seconds)));
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const onExpireRef = useRef(onExpire);

    // Keep the latest callback without touching refs during render.
    useEffect(() => {
        onExpireRef.current = onExpire;
    }, [onExpire]);

    useEffect(() => {
        setRemaining(Math.max(0, Math.ceil(seconds)));
    }, [seconds]);

    useEffect(() => {
        if (remaining <= 0) {
            onExpireRef.current?.();
            return;
        }
        intervalRef.current = setInterval(() => {
            setRemaining((prev) => {
                if (prev <= 1) {
                    clearInterval(intervalRef.current!);
                    onExpireRef.current?.();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(intervalRef.current!);
    }, [remaining, seconds]); // restart when countdown value/initial seconds change

    if (remaining <= 0) return null;

    const isLock = variant === 'lock';
    const Icon = isLock ? LockIcon : variant === 'error' ? AlertIcon : ClockIcon;
    const defaultTitle = isLock
        ? 'Account temporarily locked'
        : 'Too many attempts';
    const defaultMessage = isLock
        ? 'Your account is locked after repeated failed attempts. You may try again in:'
        : 'You may try again in:';

    return (
        <div
            className={`auth-banner auth-banner--${variant}`}
            role="alert"
            aria-live="assertive"
        >
            <span className="auth-banner-icon">
                <Icon />
            </span>
            <div className="auth-banner-body">
                <span className="auth-banner-title">{title ?? defaultTitle}</span>
                <span className="auth-banner-text">{message ?? defaultMessage}</span>
                <span className="auth-countdown" aria-label={`${remaining} seconds remaining`}>
                    {formatSeconds(remaining)}
                </span>
            </div>
        </div>
    );
}

// ── Simple status banner (no countdown) ──────
interface StatusBannerProps {
    variant: BannerVariant;
    title?: string;
    message: string;
}

export function StatusBanner({ variant, title, message }: StatusBannerProps) {
    const Icon = variant === 'lock' ? LockIcon : variant === 'error' ? AlertIcon : ClockIcon;
    return (
        <div className={`auth-banner auth-banner--${variant}`} role="alert">
            <span className="auth-banner-icon"><Icon /></span>
            <div className="auth-banner-body">
                {title && <span className="auth-banner-title">{title}</span>}
                <span className="auth-banner-text">{message}</span>
            </div>
        </div>
    );
}