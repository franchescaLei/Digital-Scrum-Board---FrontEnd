import { useEffect, useRef } from 'react';
import type { AddItemTarget } from './backlogsModalTypes';

export function AddItemMenu({
    onSelect,
    onClose,
    canCreateEpic = false,
    canCreateWorkItem = false,
    canCreateSprint = false,
}: {
    onSelect: (t: AddItemTarget) => void;
    onClose: () => void;
    canCreateEpic?: boolean;
    canCreateWorkItem?: boolean;
    canCreateSprint?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [onClose]);

    // If user has no create permissions, show nothing
    if (!canCreateEpic && !canCreateWorkItem && !canCreateSprint) return null;

    return (
        <div ref={ref} className="add-item-menu" role="menu" aria-label="Add item options">
            {canCreateEpic && (
                <button className="add-item-option" role="menuitem" onClick={() => onSelect('epic')}>
                    <span className="add-item-icon add-item-icon--epic">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.3" /><path d="M4 7h6M4 4.5h4M4 9.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                    </span>
                    <span>
                        <span className="add-item-option-title">Create New Epic</span>
                        <span className="add-item-option-sub">Group related stories under a theme</span>
                    </span>
                </button>
            )}
            {canCreateWorkItem && (
                <button className="add-item-option" role="menuitem" onClick={() => onSelect('workitem')}>
                    <span className="add-item-icon add-item-icon--wi">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8M3 4.5h8M3 9.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                    </span>
                    <span>
                        <span className="add-item-option-title">Create New Work Item</span>
                        <span className="add-item-option-sub">Story or task for the backlog</span>
                    </span>
                </button>
            )}
            {canCreateSprint && (
                <button className="add-item-option" role="menuitem" onClick={() => onSelect('sprint')}>
                    <span className="add-item-icon add-item-icon--sprint">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" /><path d="M7 4.5v2.8l1.8 1.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                    </span>
                    <span>
                        <span className="add-item-option-title">Create New Sprint</span>
                        <span className="add-item-option-sub">Plan an iteration for the team</span>
                    </span>
                </button>
            )}
        </div>
    );
}
