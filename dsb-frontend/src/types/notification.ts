export type UnreadNotificationCount = {
  unreadCount: number;
};

export type NotificationListItem = {
  notificationID: number;
  notificationType: string;
  message: string;
  relatedWorkItemID?: number | null;
  relatedSprintID?: number | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
};

export type NotificationListResponse = {
  page: number;
  pageSize: number;
  total: number;
  unreadCount: number;
  items: NotificationListItem[];
};