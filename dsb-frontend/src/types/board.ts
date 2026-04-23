export type ActiveBoard = {
  sprintID: number;
  sprintName: string;
};

export type WorkItemBoardDto = {
  workItemID: number;
  title: string;
  status: string;
  typeName?: string | null;
  priority?: string | null;
  assignedUserID: number | null;
  assignedUserName?: string | null;
  teamID?: number | null;
  commentCount: number;
  dueDate?: string | null;
  boardOrder?: number;
};

export type BoardResponse = {
  sprintID: number;
  sprintName: string;
  sprintManagerId?: number | null;
  sprintManagerName?: string | null;
  sprintTeamID?: number | null;
  sprintTeamName?: string | null;
  todo: WorkItemBoardDto[];
  ongoing: WorkItemBoardDto[];
  forChecking: WorkItemBoardDto[];
  completed: WorkItemBoardDto[];
};
