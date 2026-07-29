// 管理端任务中心 API
//
// 端点契约：
//   GET    /admin/tasks/:id   任务详情
//   DELETE /admin/tasks/:id   删除任务

import { adminRequest } from './admin-auth-api'
import type { AdminTaskDetail } from '@/types/admin-task'

/** 获取任务详情 */
export async function getAdminTask(
  id: number
): Promise<AdminTaskDetail> {
  return adminRequest<AdminTaskDetail>('get', `/admin/tasks/${id}`)
}

/** 删除任务 */
export async function deleteAdminTask(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/tasks/${id}`)
}

export default {
  getAdminTask,
  deleteAdminTask
}
