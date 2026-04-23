import apiClient from '../services/apiClient';
import type { WorkItemHierarchyDto } from '../types/epicHierarchy';

export async function getEpicHierarchy(epicId: number): Promise<WorkItemHierarchyDto> {
  return apiClient.get<WorkItemHierarchyDto>(`/api/workitems/epic/${epicId}/hierarchy`);
}
