import apiClient from './apiClient';

export interface UserAdminListItem {
    userID: number;
    firstName: string;
    middleName?: string | null;
    nameExtension?: string | null;
    lastName: string;
    emailAddress: string;
    roleID: number;
    roleName: string;
    teamID: number | null;
    teamName: string | null;
    disabled: boolean;
    isLocked: boolean;
    mustChangePassword: boolean;
    emailVerified: boolean;
}

export interface PagedUsersResponse {
    page: number;
    pageSize: number;
    total: number;
    items: UserAdminListItem[];
}

export interface TeamListItem {
    teamID: number;
    teamName: string;
    description?: string | null;
    isActive: boolean;
}

export interface PagedTeamsResponse {
    page: number;
    pageSize: number;
    total: number;
    items: TeamListItem[];
}

export interface RoleListItem {
    roleID: number;
    roleName: string;
    description?: string | null;
}

export interface PatchUserAccessBody {
    roleID?: number;
    teamID?: number | null;
    removeFromTeam?: boolean;
}

/** Response shape from PATCH /api/users/{id}/access (Ok result). */
export interface PatchUserAccessResponse {
    message?: string;
    userID?: number;
    emailAddress?: string;
    teamID?: number | null;
    teamName?: string | null;
}

async function fetchAllPages<T>(
    fetchPage: (page: number, pageSize: number) => Promise<{ total: number; items: T[] }>,
    pageSize = 200,
): Promise<T[]> {
    let page = 1;
    const all: T[] = [];
    for (;;) {
        const res = await fetchPage(page, pageSize);
        all.push(...res.items);
        if (all.length >= res.total || res.items.length === 0) break;
        page++;
    }
    return all;
}

export function fetchAllUsers(): Promise<UserAdminListItem[]> {
    return fetchAllPages((page, pageSize) =>
        apiClient.get<PagedUsersResponse>(`/api/users?page=${page}&pageSize=${pageSize}`),
    );
}

export function fetchAllTeams(): Promise<TeamListItem[]> {
    return fetchAllPages((page, pageSize) =>
        apiClient.get<PagedTeamsResponse>(`/api/teams?page=${page}&pageSize=${pageSize}&isActive=true`),
    );
}

export function fetchRoles(): Promise<RoleListItem[]> {
    return apiClient.get<RoleListItem[]>('/api/users/roles');
}

export function disableUser(userId: number): Promise<{ message: string }> {
    return apiClient.patch(`/api/users/${userId}/disable`);
}

export function enableUser(userId: number): Promise<{ message: string }> {
    return apiClient.patch(`/api/users/${userId}/enable`);
}

export function patchUserAccess(userId: number, body: PatchUserAccessBody): Promise<PatchUserAccessResponse> {
    return apiClient.patch(`/api/users/${userId}/access`, body);
}

export function unlockUser(userId: number): Promise<{ message: string }> {
    return apiClient.post(`/api/auth/unlock/${userId}`);
}

export function forceLockout(userId: number): Promise<{ message: string }> {
    return apiClient.post(`/api/users/${userId}/force-lockout`);
}

export function createTeam(teamName: string): Promise<unknown> {
    return apiClient.post('/api/teams', { teamName });
}

export interface DeleteTeamResponse {
    message: string;
    teamID: number;
    teamName: string;
    reassignedCount: number;
    reassignedUserIds: number[];
    reassignedUserNames: string[];
    reassignedWorkItemCount: number;
    reassignedSprintCount: number;
}

export function deleteTeam(teamId: number): Promise<DeleteTeamResponse> {
    return apiClient.delete(`/api/teams/${teamId}`);
}

/** POST /api/users — matches CreateUserRequestDto (camelCase JSON). */
export interface CreateUserBody {
    firstName: string;
    lastName: string;
    emailAddress: string;
    roleID: number;
    teamID: number;
    middleName?: string | null;
    nameExtension?: string | null;
}

export function createUser(body: CreateUserBody): Promise<unknown> {
    return apiClient.post('/api/users', body);
}
