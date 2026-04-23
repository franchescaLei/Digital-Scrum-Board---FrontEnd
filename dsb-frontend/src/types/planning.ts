export type Priority = 'Low' | 'Medium' | 'High';

// Mirrors DigitalScrumBoard1.DTOs.WorkItems.EpicTileDto
export type EpicTile = {
    epicID: number;
    epicTitle: string;
    completedStories: number;
    totalStories: number;
    completedTasks: number;
    totalTasks: number;
};

// Mirrors DigitalScrumBoard1.DTOs.WorkItems.AgendasResponseDto
export type AgendaSprint = {
    sprintID: number;
    sprintName: string;
    status: string;
    startDate: string | null;
    endDate: string | null;
    workItems: AgendaWorkItem[];
};

export type AgendaWorkItem = {
    workItemID: number;
    title: string;
    typeName: string;
    status: string;
    priority: string | null;
    dueDate: string | null;
    parentWorkItemID: number | null;
    sprintID: number | null;
    teamID: number | null;
    assignedUserID: number | null;
    assignedUserTeamId?: number | null;
    assignedUserName?: string | null;
    epicID?: number | null;
    description?: string | null;
};

// Mirrors DigitalScrumBoard1.DTOs.WorkItems.WorkItemDetailsResponseDto
export type WorkItemDetails = {
    workItemID: number;
    typeName: string;
    title: string;
    description?: string | null;
    status: string;
    priority?: string | null;
    dueDate: string | null;
    parentWorkItemID: number | null;
    parentTitle?: string | null;
    teamID: number | null;
    teamName?: string | null;
    assignedUserID: number | null;
    assignedUserName?: string | null;
    sprintID: number | null;
    sprintName?: string | null;
    comments: Array<{
        commentID: number;
        workItemID: number;
        commentedBy: number;
        commentedByName?: string | null;
        commentText: string;
        createdAt: string;
        updatedAt?: string | null;
        isDeleted?: boolean | null;
    }>;
    stories: Array<{
        workItemID: number;
        typeName: string;
        title: string;
        status: string;
        priority?: string | null;
    }>;
    tasks: Array<{
        workItemID: number;
        typeName: string;
        title: string;
        status: string;
        priority?: string | null;
    }>;
};

// Mirrors Sprint DTO shape returned by /api/sprints endpoints
export type SprintSummary = {
    sprintID: number;
    sprintName: string;
    goal?: string | null;
    startDate: string | null;
    endDate: string | null;
    status: string;
    managedBy: number | null;
    /** Display name from server when manager user is loaded; otherwise omit. */
    managedByName?: string | null;
    teamID: number | null;
    /** Team name from server when available. */
    teamName?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    /** Work items of type Story in this sprint (from list API). */
    storyCount: number;
    /** Work items of type Task in this sprint (from list API). */
    taskCount: number;
};

