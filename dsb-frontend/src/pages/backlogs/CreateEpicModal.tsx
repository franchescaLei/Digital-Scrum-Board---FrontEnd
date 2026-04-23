import { useEffect, useRef, useState } from 'react';
import { createWorkItem } from '../../api/workItemsApi';
import { lookupUsers, lookupTeams, type UserLookup } from '../../api/lookupsApi';
import { FieldError, TooltipIcon } from './modalPrimitives';
import { useDebounced } from './useDebounced';
import { getTodayLocal } from '../../utils/dateFormatter';

const PRIORITIES = ['Low', 'Medium', 'High'] as const;

export function CreateEpicModal({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>('Medium');
    const [dueDate, setDueDate] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);

    const assigneePickedLabelRef = useRef('');
    const teamPickedLabelRef = useRef('');
    const comboRowRef = useRef<HTMLDivElement>(null);

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
        if (!assigneeListOpen && !teamListOpen) return;
        const onMouseDown = (e: MouseEvent) => {
            const row = comboRowRef.current;
            if (!row || row.contains(e.target as Node)) return;
            setAssigneeListOpen(false);
            setTeamListOpen(false);
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [assigneeListOpen, teamListOpen]);

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

        if (dueDate && dueDate < getTodayLocal()) e.dueDate = 'Due date cannot be in the past.';

        if (!PRIORITIES.includes(priority as (typeof PRIORITIES)[number])) {
            e.priority = 'Choose a valid priority.';
        }

        if (assignedUserID != null && !Number.isFinite(assignedUserID)) {
            e.assignee = 'Choose a user from the list or clear the assignee field.';
        }

        if (teamID != null && !Number.isFinite(teamID)) {
            e.team = 'Choose a team from the list or clear the team field.';
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

        setLoading(true);
        try {
            await createWorkItem({
                type: 'Epic',
                title: title.trim(),
                description: description.trim(),
                priority,
                teamID: teamID ?? null,
                assignedUserID: assignedUserID ?? null,
                dueDate: dueDate || null,
            });
            onCreated?.();
            onClose();
        } catch (err) {
            setErrors({ submit: err instanceof Error ? err.message : 'Failed to create epic.' });
        } finally {
            setLoading(false);
        }
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

    const onAssigneeInputChange = (v: string) => {
        setAssigneeInput(v);
        if (assignedUserID != null && v.trim() !== assigneePickedLabelRef.current.trim()) {
            setAssignedUserID(null);
            assigneePickedLabelRef.current = '';
        }
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
        <div className="bl-modal-overlay" role="dialog" aria-modal="true" aria-label="Create Epic">
            <div className="bl-modal bl-modal--wide" onClick={e => e.stopPropagation()}>
                <div className="bl-modal-header">
                    <div>
                        <p className="bl-modal-eyebrow">New Epic</p>
                        <h2 className="bl-modal-title">Create Epic</h2>
                    </div>
                    <button className="bl-modal-close" onClick={onClose} aria-label="Close">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    </button>
                </div>

                <div className="bl-modal-body">
                    {errors.submit && <div className="form-error" style={{ marginBottom: 14 }}>{errors.submit}</div>}

                    <div className="bl-field">
                        <div className="bl-field-label-row">
                            <label className="bl-field-label" htmlFor="ce-title">
                                Title <span className="bl-required">*</span>
                            </label>
                            <TooltipIcon text="A concise epic name (max 50 characters). Required by the server." />
                        </div>
                        <input
                            id="ce-title"
                            className={`input${errors.title ? ' input--error' : ''}`}
                            placeholder="e.g. Authentication & Access Control"
                            value={title}
                            maxLength={50}
                            disabled={loading}
                            onChange={e => setTitle(e.target.value)}
                        />
                        <FieldError message={errors.title} />
                    </div>

                    <div className="bl-field">
                        <div className="bl-field-label-row">
                            <label className="bl-field-label" htmlFor="ce-desc">
                                Description <span className="bl-required">*</span>
                            </label>
                            <TooltipIcon text="Context, goals, and acceptance criteria (required; max 2000 characters)." />
                        </div>
                        <textarea
                            id="ce-desc"
                            className={`input input--textarea${errors.description ? ' input--error' : ''}`}
                            placeholder="What does this epic cover, including goals and success criteria…"
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
                                <label className="bl-field-label" htmlFor="ce-priority">
                                    Priority <span className="bl-required">*</span>
                                </label>
                                <TooltipIcon text="Low, Medium, or High (server validation)." />
                            </div>
                            <select
                                id="ce-priority"
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
                        <div className="bl-field">
                            <div className="bl-field-label-row">
                                <label className="bl-field-label" htmlFor="ce-due">
                                    Due date <span className="bl-optional-label">(optional)</span>
                                </label>
                            <TooltipIcon text="Optional target completion date for this epic." />
                            </div>
                            <input
                                id="ce-due"
                                type="date"
                                className={`input input--date${errors.dueDate ? ' input--error' : ''}`}
                                value={dueDate}
                                disabled={loading}
                                onChange={e => setDueDate(e.target.value)}
                            />
                            <FieldError message={errors.dueDate} />
                        </div>
                    </div>

                    <div ref={comboRowRef}>
                        <div className="bl-field-row bl-field-row--combo" style={{ marginTop: 0 }}>
                            <div className="bl-field bl-field--combo">
                                <div className="bl-field-label-row">
                                    <label className="bl-field-label" htmlFor="ce-assignee-combo">
                                        Assignee <span className="bl-optional-label">(optional)</span>
                                    </label>
                                    <TooltipIcon text="Type to filter users, then pick from the list. Leave empty for no assignee." />
                                </div>
                                <div className={`bl-combo${assigneeListOpen ? ' bl-combo--open' : ''}`}>
                                    <div className="bl-combo__field">
                                        <input
                                            id="ce-assignee-combo"
                                            className={`input bl-combo__input${errors.assignee ? ' input--error' : ''}`}
                                            placeholder="Search name or email…"
                                            value={assigneeInput}
                                            disabled={loading}
                                            autoComplete="off"
                                            role="combobox"
                                            aria-expanded={assigneeListOpen}
                                            aria-controls="ce-assignee-listbox"
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
                                        <div id="ce-assignee-listbox" className="bl-combo-dropdown" role="listbox" aria-label="Assignees">
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
                                                            <span className="bl-combo-option__meta">{u.emailAddress || ''}</span>
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
                                    <label className="bl-field-label" htmlFor="ce-team-combo">
                                        Team <span className="bl-optional-label">(optional)</span>
                                    </label>
                                    <TooltipIcon text="Type to filter teams, then pick from the list. Leave empty for no team." />
                                </div>
                                <div className={`bl-combo${teamListOpen ? ' bl-combo--open' : ''}`}>
                                    <div className="bl-combo__field">
                                        <input
                                            id="ce-team-combo"
                                            className="input bl-combo__input"
                                            placeholder="Search team name…"
                                            value={teamInput}
                                            disabled={loading}
                                            autoComplete="off"
                                            role="combobox"
                                            aria-expanded={teamListOpen}
                                            aria-controls="ce-team-listbox"
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
                                        <div id="ce-team-listbox" className="bl-combo-dropdown" role="listbox" aria-label="Teams">
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
                                                        <span className="bl-combo-option__meta">ID: {t.teamID}</span>
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
                        {loading ? <><span className="btn-spinner" />Creating…</> : 'Create Epic'}
                    </button>
                </div>
            </div>
        </div>
    );
}
