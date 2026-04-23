import { useEffect, useRef } from 'react';
import { logout } from '../../api/authApi';
import type { SessionInvalidationState } from '../../state/sessionInvalidationState';

type SessionInvalidatedModalProps = {
    state: SessionInvalidationState;
};

export default function SessionInvalidatedModal({ state }: SessionInvalidatedModalProps) {
    const logoutBtnRef = useRef<HTMLButtonElement>(null);

    const open = state.active;

    useEffect(() => {
        if (!open) return;

        // Focus the logout button when modal opens
        logoutBtnRef.current?.focus();

        // Prevent all dismiss attempts
        const onKeyDown = (e: KeyboardEvent) => {
            // Block ESC
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }
        };

        // Prevent clicks on backdrop from closing
        const onMouseDown = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };

        window.addEventListener('keydown', onKeyDown, true); // capture phase
        window.addEventListener('mousedown', onMouseDown, true);

        // Prevent pointer events from reaching underlying UI
        document.body.style.pointerEvents = 'none';
        const overlay = document.querySelector('.session-invalidated-modal-overlay') as HTMLElement | null;
        if (overlay) {
            overlay.style.pointerEvents = 'auto';
        }

        return () => {
            window.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('mousedown', onMouseDown, true);
            document.body.style.pointerEvents = '';
        };
    }, [open]);

    const handleLogout = async () => {
        try {
            await logout();
        } finally {
            window.location.href = '/login';
        }
    };

    if (!open) return null;

    const title = 'Session Ended';
    const description =
        state.message ||
        'Your session is no longer valid. Please log in again to continue.';

    return (
        <div
            className="session-invalidated-modal-overlay"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="session-invalidated-modal-title"
            aria-describedby="session-invalidated-modal-desc"
            onMouseDown={(e) => e.preventDefault()}
        >
            <div className="session-invalidated-modal-surface">
                <div className="session-invalidated-modal-icon" aria-hidden="true">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M12 8v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        <circle cx="12" cy="15.5" r="0.75" fill="currentColor" />
                    </svg>
                </div>

                <h2 id="session-invalidated-modal-title" className="session-invalidated-modal-title">
                    {title}
                </h2>

                <p id="session-invalidated-modal-desc" className="session-invalidated-modal-message">
                    {description}
                </p>

                <button
                    ref={logoutBtnRef}
                    type="button"
                    className="session-invalidated-modal-logout-btn"
                    onClick={() => void handleLogout()}
                >
                    Logout
                </button>
            </div>
        </div>
    );
}

