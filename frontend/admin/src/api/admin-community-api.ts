// 社区管理 API
//
// 端点契约：
//   GET    /admin/community/posts/pending        待审核帖子列表
//   POST   /admin/community/posts/:id/approve    通过帖子
//   POST   /admin/community/posts/:id/reject     拒绝帖子
//   DELETE /admin/community/posts/:id            删除帖子
//   PATCH  /admin/community/posts/:id/pin        置顶/取消置顶
//   PATCH  /admin/community/posts/:id/essence    加精/取消加精
//   GET    /admin/community/channels             频道列表
//   POST   /admin/community/channels             创建频道
//   PUT    /admin/community/channels/:id         更新频道
//   DELETE /admin/community/channels/:id         删除频道
//   GET    /admin/community/tags                 标签列表
//   DELETE /admin/community/tags/:id             删除标签

import { adminRequest } from './admin-auth-api'

// ===== 帖子审核 =====

export async function listPendingPosts(page = 1, pageSize = 20) {
  return adminRequest('get', '/admin/community/posts/pending', {
    params: { page, pageSize }
  })
}

export async function approvePost(id: number) {
  return adminRequest('post', `/admin/community/posts/${id}/approve`)
}

export async function rejectPost(id: number, reason: string) {
  return adminRequest('post', `/admin/community/posts/${id}/reject`, {
    data: { reason }
  })
}

export async function deletePost(id: number) {
  return adminRequest('delete', `/admin/community/posts/${id}`)
}

export async function togglePinPost(id: number, pinned: boolean) {
  return adminRequest('patch', `/admin/community/posts/${id}/pin`, {
    data: { isPinned: pinned }
  })
}

export async function toggleEssencePost(id: number, essence: boolean) {
  return adminRequest('patch', `/admin/community/posts/${id}/essence`, {
    data: { isEssence: essence }
  })
}

// ===== 频道管理 =====

export async function listChannels() {
  return adminRequest('get', '/admin/community/channels')
}

export async function createChannel(data: {
  id: string
  name: string
  slug: string
  description?: string
  icon?: string
  color?: string
}) {
  return adminRequest('post', '/admin/community/channels', { data })
}

export async function updateChannel(
  id: string,
  data: Partial<{
    name: string
    description: string
    icon: string
    color: string
    isEnabled: boolean
    sortOrder: number
  }>
) {
  return adminRequest('put', `/admin/community/channels/${id}`, { data })
}

export async function deleteChannel(id: string) {
  return adminRequest('delete', `/admin/community/channels/${id}`)
}

// ===== 标签管理 =====

export async function listTags() {
  return adminRequest('get', '/admin/community/tags')
}

export async function deleteTag(id: number) {
  return adminRequest('delete', `/admin/community/tags/${id}`)
}
