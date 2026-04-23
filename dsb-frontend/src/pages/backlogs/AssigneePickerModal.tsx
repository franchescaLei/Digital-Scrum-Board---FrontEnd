import type { UserLookup } from '../../api/lookupsApi';

export function AssigneePickerModal({
    onClose,
    assigneeSearch,
    setAssigneeSearch,
    assigneeUsers,
    assigneeLoading,
    assigneeError,
    onSelectAssignee,
}: {
    onClose: () => void;
    assigneeSearch: string;
    setAssigneeSearch: (v: string) => void;
    assigneeUsers: UserLookup[];
    assigneeLoading: boolean;
    assigneeError: string;
    onSelectAssignee: (userID: number) => void;
}) {
    return (
        <div
            className="bl-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Pick Assignee"
            onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bl-modal bl-modal--narrow" onClick={e => e.stopPropagation()}>
                <div className="bl-modal-header">
                    <div>
                        <p className="bl-modal-eyebrow">Team Member</p>
                        <h2 className="bl-modal-title">Add Assignee</h2>
                    </div>
                    <button className="bl-modal-close" onClick={onClose} aria-label="Close">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    </button>
                </div>
                <div className="bl-modal-body">
                    {assigneeError && <div className="form-error" style={{ marginBottom: 10 }}>{assigneeError}</div>}
                    <div className="bl-field" style={{ marginBottom: 12 }}>
                        <label className="bl-field-label" htmlFor="assignee-search">Search team members</label>
                        <p className="bl-lookup-hint">Tip: as you type a name or email, the list below updates.</p>
                        <input id="assignee-search" className="input" value={assigneeSearch} onChange={e => setAssigneeSearch(e.target.value)} placeholder="Name or email…" disabled={assigneeLoading} />
                    </div>
                    {assigneeLoading ? (
                        Array.from({ length: 4 }).map((_, i) => <div className="loading-skel" key={i} style={{ marginBottom: 8 }} />)
                    ) : assigneeUsers.length === 0 ? (
                        <div className="scroll-empty">No users found.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {assigneeUsers.map(u => (
                                <button key={u.userID} type="button" className="assignee-option" onClick={() => onSelectAssignee(u.userID)}>
                                    <div className="assignee-avatar">{u.displayName.charAt(0).toUpperCase()}</div>
                                    <div>
                                        <div className="assignee-name">{u.displayName}</div>
                                        <div className="assignee-email">{u.emailAddress}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="bl-modal-footer">
                    <button className="btn-ghost" onClick={onClose} disabled={assigneeLoading}>Close</button>
                </div>
            </div>
        </div>
    );
}
