// 公告 API - 获取已发布公告
//
// 注意：当前调用 GET /admin/announcements?published=true
// 该端点为管理后台端点（@Controller('admin/announcements')），
// 后端通过 @Public() 跳过全局 JwtAuthGuard，但由 AdminGuard 校验 adminToken。
// 桌面端（普通用户侧）调用此端点需携带 adminToken，否则将返回 401/403。
// 待后续后端提供 GET /announcements（用户端公开端点）后，应切换调用路径。

import { httpClient } from './http-client'

export interface Announcement {
  id: number
  title: string
  content?: string
  type: 'info' | 'warning' | 'success'
  createdAt: string
  publishedAt?: string
}

interface AnnouncementListResponse {
  list: Array<{
    id: number
    title: string
    content?: string
    type?: string
    createdAt: string
    publishedAt?: string
    published?: boolean
  }>
  total: number
}

/**
 */
export async function listPublishedAnnouncements(
  params?: { page?: number; pageSize?: number }
): Promise<{ list: Announcement[]; total: number }> {
  const res = await httpClient.get<AnnouncementListResponse>('/admin/announcements', {
    params: { published: true, page: params?.page ?? 1, pageSize: params?.pageSize ?? 10 },
  })

  const list: Announcement[] = (res?.list || []).map((item) => ({
    id: item.id,
    title: item.title,
    content: item.content,
    type: (item.type === 'warning' ? 'warning' : item.type === 'success' ? 'success' : 'info') as Announcement['type'],
    createdAt: item.createdAt,
    publishedAt: item.publishedAt,
  }))

  return { list, total: res?.total ?? list.length }
}
