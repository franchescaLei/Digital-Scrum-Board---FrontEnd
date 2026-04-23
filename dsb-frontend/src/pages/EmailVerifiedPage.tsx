import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../components/auth/AuthLayout';
import '../styles/emailVerified.css';

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

// ── Confetti particle ─────────────────────────
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
export default function EmailVerifiedPage() {
    const navigate = useNavigate();
    const [animationReady, setAnimationReady] = useState(false);
    const [showConfetti, setShowConfetti] = useState(false);
    const btnRef = useRef<HTMLButtonElement>(null);

    // Sequence: mount → trigger SVG animation → confetti burst → auto-focus button
    useEffect(() => {
        const t1 = window.setTimeout(() => setAnimationReady(true), 50);
        const t2 = window.setTimeout(() => setShowConfetti(true), 400);
        const t3 = window.setTimeout(() => btnRef.current?.focus(), 900);
        return () => {
            window.clearTimeout(t1);
            window.clearTimeout(t2);
            window.clearTimeout(t3);
        };
    }, []);

    const handleProceed = () => {
        navigate('/', { replace: true });
    };

    return (
        <AuthLayout>
            <div className={`email-verified-wrap${animationReady ? ' email-verified-wrap--ready' : ''}`}>
                {/* Confetti burst */}
                {showConfetti && <ConfettiParticles />}

                {/* Icon */}
                <div className="email-verified-icon-ring" aria-label="Email verified successfully">
                    <AnimatedCheckIcon />
                </div>

                {/* Copy */}
                <header className="email-verified-header">
                    <p className="auth-page-eyebrow">Account ready</p>
                    <h1 className="auth-page-title email-verified-title">
                        Email Verified Successfully
                    </h1>
                    <p className="auth-page-sub">
                        Your email address has been confirmed and your account is fully activated.
                        You're all set to access your sprint boards and team workspace.
                    </p>
                </header>

                {/* Feature highlights */}
                <ul className="email-verified-features" aria-label="What's available to you">
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

                {/* CTA */}
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

                {/* Footer note */}
                <p className="email-verified-footnote">
                    You may now sign in at any time using your registered email address.
                </p>
            </div>
        </AuthLayout>
    );
}