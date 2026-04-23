export function DeleteSprintConfirmModal({
    onClose,
    onConfirm,
}: {
    onClose: () => void;
    onConfirm: () => void;
}) {
    return (
        <div className="bl-modal-overlay" role="dialog" aria-modal="true" aria-label="Confirm Delete" onClick={onClose}>
            <div className="bl-modal bl-modal--narrow" onClick={e => e.stopPropagation()}>
                <div className="bl-modal-header">
                    <div>
                        <p className="bl-modal-eyebrow">Destructive Action</p>
                        <h2 className="bl-modal-title">Delete Sprint?</h2>
                    </div>
                </div>
                <div className="bl-modal-body">
                    <p style={{ fontSize: '0.875rem', color: 'var(--page-sub-color)', lineHeight: 1.6 }}>
                        This will permanently delete the sprint and cannot be undone. Work items will be returned to the backlog.
                    </p>
                </div>
                <div className="bl-modal-footer">
                    <button className="btn-ghost" onClick={onClose}>Cancel</button>
                    <button className="btn-danger" onClick={onConfirm}>Delete Sprint</button>
                </div>
            </div>
        </div>
    );
}
