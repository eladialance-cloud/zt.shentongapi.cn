// 个人设置 - 类型定义（Task 15）
//
// 端点契约：
//   GET    /users/profile                获取当前用户资料
//   PATCH  /users/:id                    更新资料（邮箱/手机/头像）
//   POST   /users/avatar                 上传头像（multipart）
//   PATCH  /users/password               修改密码
//   GET    /users/api-keys               API Key 列表
//   POST   /users/api-keys               创建 API Key（返回一次性明文）
//   DELETE /users/api-keys/:id           删除 API Key
//   GET    /devices                      已绑定设备列表
//   DELETE /devices/:id                  解绑设备
//   GET    /users/notification-settings  获取通知设置
//   PATCH  /users/notification-settings  更新通知设置

/** 用户资料（编辑用） */
export interface UserProfile {
  id: number
  username: string
  email: string
  phone?: string
  avatar?: string
}

/** 资料更新 DTO */
export interface UpdateProfileDto {
  email: string
  phone?: string
  avatar?: string
}

/** 修改密码 DTO */
export interface ChangePasswordDto {
  currentPassword: string
  newPassword: string
}

/** API Key（列表项） */
export interface ApiKey {
  id: number
  alias: string
  /** 解密后的完整 key（后端控制返回时机，列表默认脱敏/明文） */
  apiKey?: string
  /** 脱敏显示用 key */
  maskedKey?: string
  createdAt: string
  lastUsedAt?: string | null
}

/** 创建 API Key DTO */
export interface CreateApiKeyDto {
  alias: string
}

/** 创建 API Key 响应（含一次性明文 key） */
export interface CreateApiKeyResult {
  id: number
  alias: string
  apiKey: string
  createdAt: string
}

/** 已绑定设备 */
export interface Device {
  id: number
  deviceName: string
  /** 脱敏指纹 */
  fingerprint: string
  lastLoginAt?: string | null
  createdAt: string
}

/** 邮件通知开关 */
export interface EmailNotificationSettings {
  /** 对话完成 */
  chatCompleted: boolean
  /** 积分变动 */
  creditsChanged: boolean
  /** 系统公告 */
  systemAnnouncement: boolean
}

/** 客户端推送开关 */
export interface PushNotificationSettings {
  /** 对话回复 */
  chatReply: boolean
  /** Agent 审核结果 */
  agentReviewResult: boolean
  /** 充值到账 */
  rechargeArrived: boolean
}

/** 通知设置 */
export interface NotificationSettings {
  emailNotifications: EmailNotificationSettings
  pushNotifications: PushNotificationSettings
}
