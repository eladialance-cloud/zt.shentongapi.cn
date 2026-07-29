//

import { httpClient } from './http-client'

export type NotificationType = 'info' | 'warning' | 'success' | 'error'

export interface NotificationItem {
  id: number
  title: string
  content?: string
  type: NotificationType
  read: boolean
  createdAt: string
}

export interface NotificationListResponse {
  list: NotificationItem[]
  total: number
  unreadCount: number
}

export interface NotificationQuery {
  page?: number
  pageSize?: number
}

/**
 * GET /notifications?page=&pageSize=
 */
export async function listNotifications(
  params?: NotificationQuery
): Promise<NotificationListResponse> {
  return httpClient.get<NotificationListResponse>('/notifications', { params })
}

/**
 * PATCH /notifications/:id/read
 */
export async function markNotificationRead(id: number): Promise<void> {
  await httpClient.patch<void>(`/notifications/${id}/read`)
}

/**
 * PATCH /notifications/read-all
 */
export async function markAllNotificationsRead(): Promise<void> {
  await httpClient.patch<void>('/notifications/read-all')
}

export default {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
}
