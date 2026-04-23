import apiClient from '../services/apiClient';

export type UserLookup = {
    userID: number;
    displayName: string;
    emailAddress: string;
    teamID: number | null;
    teamName: string | null;
};

export type TeamLookup = {
    teamID: number;
    teamName: string;
};

function normUser(raw: Record<string, unknown>): UserLookup {
    const tid = raw.teamID ?? raw.TeamID;
    const tn = raw.teamName ?? raw.TeamName;
    return {
        userID: Number(raw.userID ?? raw.UserID ?? 0) || 0,
        displayName: String(raw.displayName ?? raw.DisplayName ?? '').trim(),
        emailAddress: String(raw.emailAddress ?? raw.EmailAddress ?? '').trim(),
        teamID: tid === null || tid === undefined ? null : Number(tid) || null,
        teamName: typeof tn === 'string' && tn.trim() ? tn.trim() : null,
    };
}

function normTeam(raw: Record<string, unknown>): TeamLookup {
    return {
        teamID: Number(raw.teamID ?? raw.TeamID ?? 0) || 0,
        teamName: String(raw.teamName ?? raw.TeamName ?? '').trim(),
    };
}

export async function lookupUsers(params?: {
    search?: string;
    teamId?: number | null;
    limit?: number;
}): Promise<UserLookup[]> {
    const qs = new URLSearchParams();
    const s = params?.search?.trim();
    if (s) qs.set('search', s);
    if (params?.teamId != null && params.teamId !== undefined) qs.set('teamId', String(params.teamId));
    qs.set('limit', String(params?.limit ?? 25));
    const rows = await apiClient.get<unknown>(`/api/lookups/users?${qs.toString()}`);
    if (!Array.isArray(rows)) return [];
    return rows.filter((r): r is Record<string, unknown> => r != null && typeof r === 'object').map(normUser);
}

export async function lookupTeams(params?: { search?: string; limit?: number }): Promise<TeamLookup[]> {
    const qs = new URLSearchParams();
    const s = params?.search?.trim();
    if (s) qs.set('search', s);
    qs.set('limit', String(params?.limit ?? 25));
    const rows = await apiClient.get<unknown>(`/api/lookups/teams?${qs.toString()}`);
    if (!Array.isArray(rows)) return [];
    return rows.filter((r): r is Record<string, unknown> => r != null && typeof r === 'object').map(normTeam);
}
