//
//
// 自动注入 Authorization: Bearer ${adminToken}。

import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type { TaskItem, TaskQueryDto } from '@/types/admin-task'

export async function listAdminTasks(
  query: TaskQueryDto = {}
): Promise<AdminPaginatedResult<TaskItem>> {
  return adminRequest<AdminPaginatedResult<TaskItem>>('get', '/admin/tasks', {
    params: query as Record<string, unknown>
  })
}

export async function getAdminTask(id: number): Promise<TaskItem> {
  return adminRequest<TaskItem>('get', `/admin/tasks/${id}`)
}

export async function deleteAdminTask(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/tasks/${id}`)
}

export default {
  listAdminTasks,
  getAdminTask,
  deleteAdminTask
}
