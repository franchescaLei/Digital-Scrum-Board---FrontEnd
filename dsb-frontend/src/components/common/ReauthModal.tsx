import { useEffect, useRef } from 'react';
import { logout } from '../../api/authApi';

type ReauthModalProps = {
    open: boolean;
};

export default function ReauthModal({ open }: ReauthModalProps) {
    const logoutBtnRef = useRef<HTMLButtonElement>(null);

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
        const overlay = document.querySelector('.reauth-modal-overlay') as HTMLElement | null;
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

    return (
        <div
            className="reauth-modal-overlay"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reauth-modal-title"
            aria-describedby="reauth-modal-desc"
            onMouseDown={(e) => e.preventDefault()}
        >
            <div className="reauth-modal-surface">
                <div className="reauth-modal-icon" aria-hidden="true">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M12 8v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        <circle cx="12" cy="15.5" r="0.75" fill="currentColor" />
                    </svg>
                </div>

                <h2 id="reauth-modal-title" className="reauth-modal-title">
                    Permissions Updated
                </h2>

                <p id="reauth-modal-desc" className="reauth-modal-message">
                    Your role or team has been updated. Please re-login to refresh your access permissions.
                </p>

                <button
                    ref={logoutBtnRef}
                    type="button"
                    className="reauth-modal-logout-btn"
                    onClick={() => void handleLogout()}
                >
                    Logout
                </button>
            </div>
        </div>
    );
}
