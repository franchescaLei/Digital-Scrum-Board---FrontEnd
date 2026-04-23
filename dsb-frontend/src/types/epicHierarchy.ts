// ─────────────────────────────────────────────
// EPIC HIERARCHY TYPES
// ─────────────────────────────────────────────

export type WorkItemHierarchyDto = {
  workItemID: number;
  typeName: string;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  dueDate?: string | null;
  assignedUserID: number | null;
  assignedUserName?: string | null;
  parentWorkItemID: number | null;
  teamID: number | null;
  teamName?: string | null;
  sprintID: number | null;
  sprintName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  children: WorkItemHierarchyDto[];
};
