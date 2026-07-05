// 个人设置 API（Task 15）
//
// 端点契约：
//   GET    /users/profile                获取当前用户资料
//   PATCH  /users/:id                    更新资料
//   POST   /users/avatar                 上传头像（multipart）
//   PATCH  /users/password               修改密码
//   GET    /users/api-keys               API Key 列表
//   POST   /users/api-keys               创建 API Key
//   DELETE /users/api-keys/:id           删除 API Key
//   GET    /devices                      已绑定设备列表
//   DELETE /devices/:id                  解绑设备
//   GET    /users/notification-settings  获取通知设置
//   PATCH  /users/notification-settings  更新通知设置

import { httpClient } from './http-client'
import type {
  UserProfile,
  UpdateProfileDto,
  ChangePasswordDto,
  ApiKey,
  CreateApiKeyDto,
  CreateApiKeyResult,
  Device,
  NotificationSettings
} from '@/types/settings'

/** 头像上传响应 */
export interface AvatarUploadResult {
  url: string
}

/** 获取当前用户资料 GET /users/profile */
export async function getProfile(): Promise<UserProfile> {
  return httpClient.get<UserProfile>('/users/profile')
}

/** 更新资料 PATCH /users/:id */
export async function updateProfile(
  id: number,
  dto: UpdateProfileDto
): Promise<UserProfile> {
  return httpClient.patch<UserProfile>(`/users/${id}`, dto)
}

/** 上传头像 POST /users/avatar (multipart) */
export async function uploadAvatar(file: File): Promise<AvatarUploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  return httpClient.post<AvatarUploadResult>('/users/avatar', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

/** 修改密码 PATCH /users/password */
export async function changePassword(dto: ChangePasswordDto): Promise<void> {
  await httpClient.patch<void>('/users/password', dto)
}

/** API Key 列表 GET /users/api-keys */
export async function listApiKeys(): Promise<ApiKey[]> {
  return httpClient.get<ApiKey[]>('/users/api-keys')
}

/** 创建 API Key POST /users/api-keys body: { alias } */
export async function createApiKey(
  dto: CreateApiKeyDto
): Promise<CreateApiKeyResult> {
  return httpClient.post<CreateApiKeyResult>('/users/api-keys', dto)
}

/** 删除 API Key DELETE /users/api-keys/:id */
export async function deleteApiKey(id: number): Promise<void> {
  await httpClient.delete<void>(`/users/api-keys/${id}`)
}

/** 已绑定设备列表 GET /devices */
export async function listDevices(): Promise<Device[]> {
  return httpClient.get<Device[]>('/devices')
}

/** 解绑设备 DELETE /devices/:id */
export async function unbindDevice(id: number): Promise<void> {
  await httpClient.delete<void>(`/devices/${id}`)
}

/** 获取通知设置 GET /users/notification-settings */
export async function getNotificationSettings(): Promise<NotificationSettings> {
  return httpClient.get<NotificationSettings>('/users/notification-settings')
}

/** 更新通知设置 PATCH /users/notification-settings */
export async function updateNotificationSettings(
  dto: NotificationSettings
): Promise<void> {
  await httpClient.patch<void>('/users/notification-settings', dto)
}

export default {
  getProfile,
  updateProfile,
  uploadAvatar,
  changePassword,
  listApiKeys,
  createApiKey,
  deleteApiKey,
  listDevices,
  unbindDevice,
  getNotificationSettings,
  updateNotificationSettings
}
