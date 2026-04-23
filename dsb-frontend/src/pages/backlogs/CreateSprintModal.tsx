import { useEffect, useRef, useState } from 'react';
import { createSprint } from '../../api/sprintsApi';
import { lookupUsers, lookupTeams, type UserLookup } from '../../api/lookupsApi';
import { FieldError, TooltipIcon } from './modalPrimitives';
import { useDebounced } from './useDebounced';
import { getTodayLocal } from '../../utils/dateFormatter';

export function CreateSprintModal({
    onClose,
    onCreated,
    defaultManagedByUserId,
    defaultManagerDisplayName,
}: {
    onClose: () => void;
    onCreated?: () => void;
    defaultManagedByUserId: number | null;
    defaultManagerDisplayName: string;
}) {
    const [sprintName, setSprintName] = useState('');
    const [goal, setGoal] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);

    const managerPickedLabelRef = useRef('');
    const teamPickedLabelRef = useRef('');

    const [managerInput, setManagerInput] = useState(() => (defaultManagerDisplayName ?? '').trim());
    const [managedBy, setManagedBy] = useState<number | null>(defaultManagedByUserId);
    const managerQueryDebounced = useDebounced(managerInput, 280);
    const [managerRows, setManagerRows] = useState<UserLookup[]>([]);
    const [managerLoading, setManagerLoading] = useState(false);
    const [managerLookupError, setManagerLookupError] = useState('');
    const [managerListOpen, setManagerListOpen] = useState(false);
    const sprintComboRowRef = useRef<HTMLDivElement>(null);

    const [teamInput, setTeamInput] = useState('');
    const [teamID, setTeamID] = useState<number | null>(null);
    const teamQueryDebounced = useDebounced(teamInput, 280);
    const [teamRows, setTeamRows] = useState<{ teamID: number; teamName: string }[]>([]);
    const [teamLoading, setTeamLoading] = useState(false);
    const [teamLookupError, setTeamLookupError] = useState('');
    const [teamListOpen, setTeamListOpen] = useState(false);

    useEffect(() => {
        if (!managerListOpen && !teamListOpen) return;
        const onMouseDown = (e: MouseEvent) => {
            const row = sprintComboRowRef.current;
            if (!row || row.contains(e.target as Node)) return;
            setManagerListOpen(false);
            setTeamListOpen(false);
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [managerListOpen, teamListOpen]);

    useEffect(() => {
        if (defaultManagedByUserId != null && (defaultManagerDisplayName ?? '').trim()) {
            managerPickedLabelRef.current = (defaultManagerDisplayName ?? '').trim();
        }
    }, [defaultManagedByUserId, defaultManagerDisplayName]);

    useEffect(() => {
        let cancelled = false;
        setManagerLoading(true);
        setManagerLookupError('');
        void lookupUsers({ search: managerQueryDebounced, limit: 25 })
            .then(rows => {
                if (!cancelled) setManagerRows(rows);
            })
            .catch(() => {
                if (!cancelled) {
                    setManagerLookupError('Could not load users.');
                    setManagerRows([]);
                }
            })
            .finally(() => {
                if (!cancelled) setManagerLoading(false);
            });
        return () => { cancelled = true; };
    }, [managerQueryDebounced]);

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
        if (!sprintName.trim()) e.sprintName = 'Sprint name is required.';
        else if (sprintName.length > 50) e.sprintName = 'Name must be 50 characters or fewer.';
        const g = goal.trim();
        if (!g) e.goal = 'Sprint goal is required.';
        else if (g.length > 255) e.goal = 'Goal must be 255 characters or fewer.';
        if (!startDate) e.startDate = 'Start date is required.';
        if (!endDate) e.endDate = 'End date is required.';
        if (startDate && startDate < getTodayLocal()) e.startDate = 'Start date cannot be in the past.';
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            e.endDate = 'End date must be on or after start date.';
        }
        if (!managerInput.trim()) {
            e.managedBy = 'Sprint manager is required.';
        } else if (managedBy == null) {
            e.managedBy = 'Please select a manager from the dropdown.';
        }
        if (teamInput.trim() && teamID == null) {
            e.team = 'Invalid team choice.';
        }
        return e;
    };

    const handleSubmit = async () => {
        const e = validate();
        setErrors(e);
        if (Object.keys(e).length > 0) return;
        setLoading(true);
        try {
            await createSprint({
                sprintName: sprintName.trim(),
                goal: goal.trim(),
                startDate,
                endDate,
                managedBy: managedBy as number,
                teamID: teamID ?? null,
            });
            onCreated?.();
            onClose();
        } catch (err) {
            setErrors({ submit: err instanceof Error ? err.message : 'Failed to create sprint.' });
        } finally {
            setLoading(false);
        }
    };

    const pickManager = (u: UserLookup) => {
        const name = (u.displayName ?? '').trim() || 'Member';
        managerPickedLabelRef.current = name;
        setManagedBy(u.userID);
        setManagerInput(name);
        setManagerListOpen(false);
        setErrors(prev => {
            const next = { ...prev };
            delete next.managedBy;
            return next;
        });
    };

    const pickTeam = (t: { teamID: number; teamName: string }) => {
        teamPickedLabelRef.current = (t.teamName ?? '').trim();
        setTeamID(t.teamID);
        setTeamInput(t.teamName);
        setTeamListOpen(false);
        setErrors(prev => {
            const next = { ...prev };
            delete next.team;
            return next;
        });
    };

    const onManagerInputChange = (v: string) => {
        setManagerInput(v);
        if (managedBy != null && v.trim() !== managerPickedLabelRef.current.trim()) {
            setManagedBy(null);
            managerPickedLabelRef.current = '';
        }
    };

    const clearManager = () => {
        setManagedBy(null);
        setManagerInput('');
        managerPickedLabelRef.current = '';
        setManagerListOpen(true);
        setErrors(prev => {
            const next = { ...prev };
            delete next.managedBy;
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
        <div className="bl-modal-overlay" role="dialog" aria-modal="true" aria-label="Create Sprint">
            <div className="bl-modal bl-modal--wide" onClick={e => e.stopPropagation()}>
                <div className="bl-modal-header">
                    <div>
                        <p className="bl-modal-eyebrow">New Sprint</p>
                        <h2 className="bl-modal-title">Create Sprint</h2>
                    </div>
                    <button className="bl-modal-close" onClick={onClose} aria-label="Close">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    </button>
                </div>

                <div className="bl-modal-body">
                    {errors.submit && <div className="form-error" style={{ marginBottom: 14 }}>{errors.submit}</div>}

                    <div className="bl-field">
                        <div className="bl-field-label-row">
                            <label className="bl-field-label" htmlFor="cs-name">
                                Sprint Name <span className="bl-required">*</span>
                            </label>
                            <TooltipIcon text="A clear name for this sprint, e.g. 'Sprint 3 – Auth & Boards'." />
                        </div>
                        <input
                            id="cs-name"
                            className={`input${errors.sprintName ? ' input--error' : ''}`}
                            placeholder="e.g. Sprint 3 – Auth & Boards"
                            value={sprintName}
                            maxLength={50}
                            disabled={loading}
                            onChange={e => setSprintName(e.target.value)}
                        />
                        <FieldError message={errors.sprintName} />
                    </div>

                    <div className="bl-field">
                        <div className="bl-field-label-row">
                            <label className="bl-field-label" htmlFor="cs-goal">
                                Sprint Goal <span className="bl-required">*</span>
                            </label>
                            <TooltipIcon text="What should the team achieve by the end of this sprint? Required by the server (max 255 characters)." />
                        </div>
                        <textarea
                            id="cs-goal"
                            className={`input input--textarea${errors.goal ? ' input--error' : ''}`}
                            placeholder="What will the team deliver this sprint?"
                            value={goal}
                            maxLength={255}
                            rows={2}
                            disabled={loading}
                            onChange={e => setGoal(e.target.value)}
                        />
                        <FieldError message={errors.goal} />
                    </div>

                    <div className="bl-field-row">
                        <div className="bl-field">
                            <div className="bl-field-label-row">
                                <label className="bl-field-label" htmlFor="cs-start">
                                    Start Date <span className="bl-required">*</span>
                                </label>
                                <TooltipIcon text="Sprint start date (required)." />
                            </div>
                            <input
                                id="cs-start"
                                type="date"
                                className={`input input--date${errors.startDate ? ' input--error' : ''}`}
                                value={startDate}
                                disabled={loading}
                                onChange={e => setStartDate(e.target.value)}
                            />
                            <FieldError message={errors.startDate} />
                        </div>
                        <div className="bl-field">
                            <div className="bl-field-label-row">
                                <label className="bl-field-label" htmlFor="cs-end">
                                    End Date <span className="bl-required">*</span>
                                </label>
                                <TooltipIcon text="Sprint end date (required). Must be on or after the start date." />
                            </div>
                            <input
                                id="cs-end"
                                type="date"
                                className={`input input--date${errors.endDate ? ' input--error' : ''}`}
                                value={endDate}
                                disabled={loading}
                                onChange={e => setEndDate(e.target.value)}
                            />
                            <FieldError message={errors.endDate} />
                        </div>
                    </div>

                    <div ref={sprintComboRowRef} className="bl-field-row bl-field-row--combo">
                        <div className="bl-field bl-field--combo">
                            <div className="bl-field-label-row">
                                <label className="bl-field-label" htmlFor="cs-manager-combo">
                                    Sprint manager <span className="bl-required">*</span>
                                </label>
                                <TooltipIcon text="Type to filter, then pick a name from the list." />
                            </div>
                            <div className={`bl-combo${managerListOpen ? ' bl-combo--open' : ''}`}>
                                <div className="bl-combo__field">
                                    <input
                                        id="cs-manager-combo"
                                        className={`input bl-combo__input${errors.managedBy ? ' input--error' : ''}`}
                                        placeholder="Search name or email…"
                                        value={managerInput}
                                        disabled={loading}
                                        autoComplete="off"
                                        role="combobox"
                                        aria-expanded={managerListOpen}
                                        aria-controls="cs-manager-listbox"
                                        aria-autocomplete="list"
                                        onChange={e => onManagerInputChange(e.target.value)}
                                        onFocus={() => setManagerListOpen(true)}
                                    />
                                    <button
                                        type="button"
                                        className="bl-combo__clear-btn"
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={clearManager}
                                        aria-label="Clear manager"
                                        title="Clear manager"
                                        disabled={loading}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                            <path d="M3 3l8 8M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                        </svg>
                                    </button>
                                </div>
                                {managerListOpen && (
                                    <div id="cs-manager-listbox" className="bl-combo-dropdown" role="listbox" aria-label="Sprint managers">
                                        {managerLookupError && <div className="bl-combo-dropdown-msg bl-combo-dropdown-msg--error">{managerLookupError}</div>}
                                        {managerLoading ? (
                                            Array.from({ length: 3 }).map((_, i) => <div className="loading-skel bl-combo__skel" key={i} />)
                                        ) : managerRows.length === 0 ? (
                                            <div className="bl-combo-dropdown-msg">No matches.</div>
                                        ) : (
                                            managerRows.map(u => {
                                                const label = (u.displayName ?? '').trim() || 'Member';
                                                return (
                                                    <button
                                                        key={u.userID}
                                                        type="button"
                                                        role="option"
                                                        className="bl-combo-option"
                                                        onMouseDown={e => e.preventDefault()}
                                                        onClick={() => pickManager(u)}
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
                            <FieldError message={errors.managedBy} />
                        </div>
                        <div className="bl-field bl-field--combo">
                            <div className="bl-field-label-row">
                                <label className="bl-field-label" htmlFor="cs-team-combo">
                                    Team <span className="bl-optional-label">(optional)</span>
                                </label>
                                <TooltipIcon text="Leave empty for no team. Type to filter teams." />
                            </div>
                            <div className={`bl-combo${teamListOpen ? ' bl-combo--open' : ''}`}>
                                <div className="bl-combo__field">
                                    <input
                                        id="cs-team-combo"
                                        className={`input bl-combo__input${errors.team ? ' input--error' : ''}`}
                                        placeholder="Search team…"
                                        value={teamInput}
                                        disabled={loading}
                                        autoComplete="off"
                                        role="combobox"
                                        aria-expanded={teamListOpen}
                                        aria-controls="cs-team-listbox"
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
                                    <div id="cs-team-listbox" className="bl-combo-dropdown" role="listbox" aria-label="Teams">
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

                <div className="bl-modal-footer">
                    <button className="btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
                    <button className="btn-primary" onClick={handleSubmit} disabled={loading} aria-busy={loading}>
                        {loading ? <><span className="btn-spinner" />Creating…</> : 'Create Sprint'}
                    </button>
                </div>
            </div>
        </div>
    );
}
