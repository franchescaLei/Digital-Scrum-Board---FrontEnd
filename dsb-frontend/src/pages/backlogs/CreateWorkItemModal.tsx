import { useEffect, useMemo, useRef, useState } from 'react';
import { createWorkItem, getWorkItemParents, type WorkItemParentOption } from '../../api/workItemsApi';
import { lookupUsers, lookupTeams, type UserLookup } from '../../api/lookupsApi';
import { FieldError, TooltipIcon } from './modalPrimitives';
import { useDebounced } from './useDebounced';
import { getTodayLocal } from '../../utils/dateFormatter';

const PRIORITIES = ['Low', 'Medium', 'High'] as const;

function filterParents(rows: WorkItemParentOption[], q: string): WorkItemParentOption[] {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(p => (p.title ?? '').toLowerCase().includes(s));
}

export function CreateWorkItemModal({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
    const [workType, setWorkType] = useState<'Story' | 'Task'>('Story');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('Medium');
    const [dueDate, setDueDate] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);

    const parentPickedLabelRef = useRef('');
    const assigneePickedLabelRef = useRef('');
    const teamPickedLabelRef = useRef('');
    const comboRowRef = useRef<HTMLDivElement>(null);

    const [parentRows, setParentRows] = useState<WorkItemParentOption[]>([]);
    const [parentsLoading, setParentsLoading] = useState(false);
    const [parentsError, setParentsError] = useState('');
    const [parentInput, setParentInput] = useState('');
    const [parentID, setParentID] = useState<number | null>(null);
    const parentInputDebounced = useDebounced(parentInput, 200);
    const [parentListOpen, setParentListOpen] = useState(false);

    const [assigneeInput, setAssigneeInput] = useState('');
    const [assignedUserID, setAssignedUserID] = useState<number | null>(null);
    const assigneeQueryDebounced = useDebounced(assigneeInput, 280);
    const [assigneeRows, setAssigneeRows] = useState<UserLookup[]>([]);
    const [assigneeLoading, setAssigneeLoading] = useState(false);
    const [assigneeLookupError, setAssigneeLookupError] = useState('');
    const [assigneeListOpen, setAssigneeListOpen] = useState(false);

    const [teamInput, setTeamInput] = useState('');
    const [teamID, setTeamID] = useState<number | null>(null);
    const teamQueryDebounced = useDebounced(teamInput, 280);
    const [teamRows, setTeamRows] = useState<{ teamID: number; teamName: string }[]>([]);
    const [teamLoading, setTeamLoading] = useState(false);
    const [teamLookupError, setTeamLookupError] = useState('');
    const [teamListOpen, setTeamListOpen] = useState(false);

    useEffect(() => {
        if (!parentListOpen && !assigneeListOpen && !teamListOpen) return;
        const onMouseDown = (e: MouseEvent) => {
            const row = comboRowRef.current;
            if (!row || row.contains(e.target as Node)) return;
            setParentListOpen(false);
            setAssigneeListOpen(false);
            setTeamListOpen(false);
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [parentListOpen, assigneeListOpen, teamListOpen]);

    useEffect(() => {
        let cancelled = false;
        setParentsLoading(true);
        setParentsError('');
        setParentRows([]);
        setParentID(null);
        setParentInput('');
        parentPickedLabelRef.current = '';
        void getWorkItemParents(workType)
            .then(rows => {
                if (!cancelled) setParentRows(rows);
            })
            .catch(() => {
                if (!cancelled) {
                    setParentsError('Could not load parent work items.');
                    setParentRows([]);
                }
            })
            .finally(() => {
                if (!cancelled) setParentsLoading(false);
            });
        return () => { cancelled = true; };
    }, [workType]);

    const filteredParents = useMemo(
        () => filterParents(parentRows, parentInputDebounced),
        [parentRows, parentInputDebounced],
    );

    useEffect(() => {
        let cancelled = false;
        setAssigneeLoading(true);
        setAssigneeLookupError('');
        void lookupUsers({ search: assigneeQueryDebounced, limit: 25 })
            .then(rows => {
                if (!cancelled) setAssigneeRows(rows);
            })
            .catch(() => {
                if (!cancelled) {
                    setAssigneeLookupError('Could not load users.');
                    setAssigneeRows([]);
                }
            })
            .finally(() => {
                if (!cancelled) setAssigneeLoading(false);
            });
        return () => { cancelled = true; };
    }, [assigneeQueryDebounced]);

    useEffect(() => {
        let cancelled = false;
        setTeamLoading(true);
        setTeamLookupError('');
        void lookupTeams({ search: teamQueryDebounced, limit: 25 })
            .then(rows => {
                if (!cancelled) setTeamRows(rows.map(t => ({
                    teamID: t.teamID,
                    teamName: t.teamName.trim().toLowerCase() === 'default team' ? 'Unassigned' : t.teamName
                })));
            })
            .catch(() => {
                if (!cancelled) {
                    setTeamLookupError('Could not load teams.');
                    setTeamRows([]);
                }
            })
            .finally(() => {
                if (!cancelled) setTeamLoading(false);
            });
        return () => { cancelled = true; };
    }, [teamQueryDebounced]);

    const validate = () => {
        const e: Record<string, string> = {};
        if (!title.trim()) e.title = 'Title is required.';
        else if (title.length > 50) e.title = 'Title must be 50 characters or fewer.';

        const desc = description.trim();
        if (!desc) e.description = 'Description is required.';
        else if (desc.length > 2000) e.description = 'Description must be 2000 characters or fewer.';

        if (dueDate && dueDate < getTodayLocal()) {
            e.dueDate = 'Due date cannot be in the past.';
        }

        if (!PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) {
            e.priority = 'Choose a valid priority.';
        }

        if (parentID == null || !Number.isFinite(parentID)) {
            e.parent = workType === 'Story'
                ? 'Choose a parent epic for this story.'
                : 'Choose a parent epic or story for this task.';
        } else {
            const match = parentRows.find(p => p.workItemID === parentID);
            if (!match) {
                e.parent = 'Selected parent is no longer valid for this type. Pick again.';
            } else if (workType === 'Task' && match.typeName === 'Story' && match.dueDate && dueDate) {
                if (dueDate > match.dueDate) {
                    e.dueDate = `Task due date cannot be later than its parent story's due date (${match.dueDate}).`;
                }
            }
        }

        if (assignedUserID != null && !Number.isFinite(assignedUserID)) {
            e.assignee = 'Choose a user from the list or clear the assignee field.';
        }

        if (assigneeInput.trim() && assignedUserID == null) {
            e.assignee = 'Please select a user from the dropdown.';
        }

        if (teamInput.trim() && teamID == null) {
            e.team = 'Please select a team from the dropdown.';
        }

        return e;
    };

    const handleSubmit = async () => {
        const e = validate();
        setErrors(e);
        if (Object.keys(e).length > 0) return;
        if (parentID == null) return;

        setLoading(true);
        try {
            await createWorkItem({
                type: workType,
                title: title.trim(),
                description: description.trim(),
                priority,
                parentWorkItemID: parentID,
                teamID: teamID ?? null,
                assignedUserID: assignedUserID ?? null,
                dueDate: dueDate || null,
            });
            onCreated?.();
            onClose();
        } catch (err) {
            setErrors({ submit: err instanceof Error ? err.message : 'Failed to create work item.' });
        } finally {
            setLoading(false);
        }
    };

    const pickParent = (p: WorkItemParentOption) => {
        const label = (p.title ?? '').trim() || `Work item #${p.workItemID}`;
        const withType = `${label} (${p.typeName})`;
        parentPickedLabelRef.current = withType;
        setParentID(p.workItemID);
        setParentInput(withType);
        setParentListOpen(false);
        setErrors(prev => {
            const next = { ...prev };
            delete next.parent;
            return next;
        });
    };

    const pickAssignee = (u: UserLookup) => {
        const name = (u.displayName ?? '').trim() || 'Member';
        assigneePickedLabelRef.current = name;
        setAssignedUserID(u.userID);
        setAssigneeInput(name);
        setAssigneeListOpen(false);
        setErrors(prev => {
            const next = { ...prev };
            delete next.assignee;
            return next;
        });
    };

    const pickTeam = (t: { teamID: number; teamName: string }) => {
        teamPickedLabelRef.current = (t.teamName ?? '').trim();
        setTeamID(t.teamID);
        setTeamInput(t.teamName);
        setTeamListOpen(false);
    };

    const onParentInputChange = (v: string) => {
        setParentInput(v);
        if (parentID != null && v.trim() !== parentPickedLabelRef.current.trim()) {
            setParentID(null);
            parentPickedLabelRef.current = '';
        }
    };

    const onAssigneeInputChange = (v: string) => {
        setAssigneeInput(v);
        if (assignedUserID != null && v.trim() !== assigneePickedLabelRef.current.trim()) {
            setAssignedUserID(null);
            assigneePickedLabelRef.current = '';
        }
    };

    const clearParent = () => {
        setParentID(null);
        setParentInput('');
        parentPickedLabelRef.current = '';
        setParentListOpen(true);
        setErrors(prev => {
            const next = { ...prev };
            delete next.parent;
            return next;
        });
    };

    const clearAssignee = () => {
        setAssignedUserID(null);
        setAssigneeInput('');
        assigneePickedLabelRef.current = '';
        setAssigneeListOpen(true);
        setErrors(prev => {
            const next = { ...prev };
            delete next.assignee;
            return next;
        });
    };

    const onTeamInputChange = (v: string) => {
        setTeamInput(v);
        if (!v.trim()) {
            setTeamID(null);
            teamPickedLabelRef.current = '';
            return;
        }
        if (teamID != null && v.trim() !== teamPickedLabelRef.current.trim()) {
            setTeamID(null);
        }
    };

    const clearTeam = () => {
        setTeamID(null);
        setTeamInput('');
        teamPickedLabelRef.current = '';
        setTeamListOpen(true);
        setErrors(prev => {
            const next = { ...prev };
            delete next.team;
            return next;
        });
    };

    return (
        <div className="bl-modal-overlay" role="dialog" aria-modal="true" aria-label="Create Work Item">
            <div className="bl-modal bl-modal--wide" onClick={e => e.stopPropagation()}>
                <div className="bl-modal-header">
                    <div>
                        <p className="bl-modal-eyebrow">New Work Item</p>
                        <h2 className="bl-modal-title">Create Story or Task</h2>
                    </div>
                    <button className="bl-modal-close" onClick={onClose} aria-label="Close">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    </button>
                </div>

                <div className="bl-modal-body">
                    {errors.submit && <div className="form-error" style={{ marginBottom: 14 }}>{errors.submit}</div>}

                    <div className="bl-field">
                        <div className="bl-field-label-row">
                            <label className="bl-field-label" htmlFor="cwi-title">
                                Title <span className="bl-required">*</span>
                            </label>
                            <TooltipIcon text="A concise title (max 50 characters). Required by the server." />
                        </div>
                        <input
                            id="cwi-title"
                            className={`input${errors.title ? ' input--error' : ''}`}
                            placeholder="e.g. Add password reset flow"
                            value={title}
                            maxLength={50}
                            disabled={loading}
                            onChange={e => setTitle(e.target.value)}
                        />
                        <FieldError message={errors.title} />
                    </div>

                    <div className="bl-field">
                        <div className="bl-field-label-row">
                            <label className="bl-field-label" htmlFor="cwi-desc">
                                Description <span className="bl-required">*</span>
                            </label>
                            <TooltipIcon text="Context and acceptance criteria (required; max 2000 characters)." />
                        </div>
                        <textarea
                            id="cwi-desc"
                            className={`input input--textarea${errors.description ? ' input--error' : ''}`}
                            placeholder="What needs to be done, including acceptance criteria…"
                            value={description}
                            maxLength={2000}
                            rows={3}
                            disabled={loading}
                            onChange={e => setDescription(e.target.value)}
                        />
                        <FieldError message={errors.description} />
                    </div>

                    <div className="bl-field-row">
                        <div className="bl-field">
                            <div className="bl-field-label-row">
                                <label className="bl-field-label" htmlFor="cwi-type">
                                    Type <span className="bl-required">*</span>
                                </label>
                                <TooltipIcon text="Story: under an epic. Task: under an epic or a story." />
                            </div>
                            <select
                                id="cwi-type"
                                className="select"
                                value={workType}
                                disabled={loading}
                                onChange={e => {
                                    const v = e.target.value;
                                    if (v === 'Story' || v === 'Task') setWorkType(v);
                                }}
                            >
                                <option value="Story">Story</option>
                                <option value="Task">Task</option>
                            </select>
                        </div>
                        <div className="bl-field">
                            <div className="bl-field-label-row">
                                <label className="bl-field-label" htmlFor="cwi-priority">
                                    Priority <span className="bl-required">*</span>
                                </label>
                                <TooltipIcon text="Low, Medium, or High (server validation)." />
                            </div>
                            <select
                                id="cwi-priority"
                                className={`select${errors.priority ? ' input--error' : ''}`}
                                value={priority}
                                disabled={loading}
                                onChange={e => setPriority(e.target.value as (typeof PRIORITIES)[number])}
                            >
                                {PRIORITIES.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                            <FieldError message={errors.priority} />
                        </div>
                    </div>

                    <div className="bl-field">
                        <div className="bl-field-label-row">
                            <label className="bl-field-label" htmlFor="cwi-due">
                                Due date <span className="bl-optional-label">(optional)</span>
                            </label>
                            <TooltipIcon text="Optional target completion date for this work item." />
                        </div>
                        <input
                            id="cwi-due"
                            type="date"
                            className={`input input--date${errors.dueDate ? ' input--error' : ''}`}
                            value={dueDate}
                            disabled={loading}
                            onChange={e => setDueDate(e.target.value)}
                        />
                        <FieldError message={errors.dueDate} />
                    </div>

                    <div ref={comboRowRef}>
                        <div className="bl-field bl-field--combo">
                            <div className="bl-field-label-row">
                                <label className="bl-field-label" htmlFor="cwi-parent-combo">
                                    Parent <span className="bl-required">*</span>
                                </label>
                                <TooltipIcon
                                    text={
                                        workType === 'Story'
                                            ? 'Stories must be created under an epic. Type to filter, then pick from the list.'
                                            : 'Tasks may be under an epic or a story. Type to filter, then pick from the list.'
                                    }
                                />
                            </div>
                            <div className={`bl-combo${parentListOpen ? ' bl-combo--open' : ''}`}>
                                <div className="bl-combo__field">
                                    <input
                                        id="cwi-parent-combo"
                                        className={`input bl-combo__input${errors.parent ? ' input--error' : ''}`}
                                        placeholder={workType === 'Story' ? 'Search epics…' : 'Search epics or stories…'}
                                        value={parentInput}
                                        disabled={loading || parentsLoading}
                                        autoComplete="off"
                                        role="combobox"
                                        aria-expanded={parentListOpen}
                                        aria-controls="cwi-parent-listbox"
                                        aria-autocomplete="list"
                                        onChange={e => onParentInputChange(e.target.value)}
                                        onFocus={() => setParentListOpen(true)}
                                    />
                                    <button
                                        type="button"
                                        className="bl-combo__clear-btn"
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={clearParent}
                                        aria-label="Clear parent"
                                        title="Clear parent"
                                        disabled={loading || parentsLoading}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                            <path d="M3 3l8 8M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                        </svg>
                                    </button>
                                </div>
                                {parentListOpen && (
                                    <div id="cwi-parent-listbox" className="bl-combo-dropdown" role="listbox" aria-label="Parent work items">
                                        {parentsLoading ? (
                                            Array.from({ length: 4 }).map((_, i) => <div className="loading-skel bl-combo__skel" key={i} />)
                                        ) : parentsError ? (
                                            <div className="bl-combo-dropdown-msg bl-combo-dropdown-msg--error">{parentsError}</div>
                                        ) : filteredParents.length === 0 ? (
                                            <div className="bl-combo-dropdown-msg">No matches.</div>
                                        ) : (
                                            filteredParents.map(p => {
                                                const label = (p.title ?? '').trim() || `Work item #${p.workItemID}`;
                                                return (
                                                    <button
                                                        key={p.workItemID}
                                                        type="button"
                                                        role="option"
                                                        className="bl-combo-option"
                                                        onMouseDown={e => e.preventDefault()}
                                                        onClick={() => pickParent(p)}
                                                    >
                                                        <span className="bl-combo-option__title">{label}</span>
                                                        <span className="bl-combo-option__meta">{p.typeName}</span>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                            <FieldError message={errors.parent} />
                        </div>

                        <div className="bl-field-row bl-field-row--combo" style={{ marginTop: 14 }}>
                            <div className="bl-field bl-field--combo">
                                <div className="bl-field-label-row">
                                    <label className="bl-field-label" htmlFor="cwi-assignee-combo">
                                        Assignee <span className="bl-optional-label">(optional)</span>
                                    </label>
                                    <TooltipIcon text="Type to filter users, then pick from the list. Leave empty for no assignee." />
                                </div>
                                <div className={`bl-combo${assigneeListOpen ? ' bl-combo--open' : ''}`}>
                                    <div className="bl-combo__field">
                                        <input
                                            id="cwi-assignee-combo"
                                            className={`input bl-combo__input${errors.assignee ? ' input--error' : ''}`}
                                            placeholder="Search name or email…"
                                            value={assigneeInput}
                                            disabled={loading}
                                            autoComplete="off"
                                            role="combobox"
                                            aria-expanded={assigneeListOpen}
                                            aria-controls="cwi-assignee-listbox"
                                            aria-autocomplete="list"
                                            onChange={e => onAssigneeInputChange(e.target.value)}
                                            onFocus={() => setAssigneeListOpen(true)}
                                        />
                                        <button
                                            type="button"
                                            className="bl-combo__clear-btn"
                                            onMouseDown={e => e.preventDefault()}
                                            onClick={clearAssignee}
                                            aria-label="Clear assignee"
                                            title="Clear assignee"
                                            disabled={loading}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                                <path d="M3 3l8 8M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                            </svg>
                                        </button>
                                    </div>
                                    {assigneeListOpen && (
                                        <div id="cwi-assignee-listbox" className="bl-combo-dropdown" role="listbox" aria-label="Assignees">
                                            {assigneeLookupError && <div className="bl-combo-dropdown-msg bl-combo-dropdown-msg--error">{assigneeLookupError}</div>}
                                            {assigneeLoading ? (
                                                Array.from({ length: 3 }).map((_, i) => <div className="loading-skel bl-combo__skel" key={i} />)
                                            ) : assigneeRows.length === 0 ? (
                                                <div className="bl-combo-dropdown-msg">No matches.</div>
                                            ) : (
                                                assigneeRows.map(u => {
                                                    const label = (u.displayName ?? '').trim() || 'Member';
                                                    return (
                                                        <button
                                                            key={u.userID}
                                                            type="button"
                                                            role="option"
                                                            className="bl-combo-option"
                                                            onMouseDown={e => e.preventDefault()}
                                                            onClick={() => pickAssignee(u)}
                                                        >
                                                            <span className="bl-combo-option__title">{label}</span>
                                                            {u.emailAddress ? (
                                                                <span className="bl-combo-option__meta">{u.emailAddress}</span>
                                                            ) : null}
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                </div>
                                <FieldError message={errors.assignee} />
                            </div>
                            <div className="bl-field bl-field--combo">
                                <div className="bl-field-label-row">
                                    <label className="bl-field-label" htmlFor="cwi-team-combo">
                                        Team <span className="bl-optional-label">(optional)</span>
                                    </label>
                                    <TooltipIcon text="Optional team for this work item. Epics ignore team on create; stories and tasks may have one." />
                                </div>
                                <div className={`bl-combo${teamListOpen ? ' bl-combo--open' : ''}`}>
                                    <div className="bl-combo__field">
                                        <input
                                            id="cwi-team-combo"
                                            className="input bl-combo__input"
                                            placeholder="Search team…"
                                            value={teamInput}
                                            disabled={loading}
                                            autoComplete="off"
                                            role="combobox"
                                            aria-expanded={teamListOpen}
                                            aria-controls="cwi-team-listbox"
                                            aria-autocomplete="list"
                                            onChange={e => onTeamInputChange(e.target.value)}
                                            onFocus={() => setTeamListOpen(true)}
                                        />
                                        <button
                                            type="button"
                                            className="bl-combo__clear-btn"
                                            onMouseDown={e => e.preventDefault()}
                                            onClick={clearTeam}
                                            aria-label="Clear team"
                                            title="Clear team"
                                            disabled={loading}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                                <path d="M3 3l8 8M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                            </svg>
                                        </button>
                                    </div>
                                    {teamListOpen && (
                                        <div id="cwi-team-listbox" className="bl-combo-dropdown" role="listbox" aria-label="Teams">
                                            {teamLookupError && <div className="bl-combo-dropdown-msg bl-combo-dropdown-msg--error">{teamLookupError}</div>}
                                            {teamLoading ? (
                                                Array.from({ length: 3 }).map((_, i) => <div className="loading-skel bl-combo__skel" key={i} />)
                                            ) : teamRows.length === 0 ? (
                                                <div className="bl-combo-dropdown-msg">No matches.</div>
                                            ) : (
                                                teamRows.map(t => (
                                                    <button
                                                        key={t.teamID}
                                                        type="button"
                                                        role="option"
                                                        className="bl-combo-option"
                                                        onMouseDown={e => e.preventDefault()}
                                                        onClick={() => pickTeam(t)}
                                                    >
                                                        <span className="bl-combo-option__title">{t.teamName}</span>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                                <FieldError message={errors.team} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bl-modal-footer">
                    <button className="btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
                    <button className="btn-primary" onClick={handleSubmit} disabled={loading} aria-busy={loading}>
                        {loading ? <><span className="btn-spinner" />Creating…</> : 'Create Work Item'}
                    </button>
                </div>
            </div>
        </div>
    );
}
