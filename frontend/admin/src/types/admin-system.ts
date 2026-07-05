// 管理端系统配置模块类型定义
// 数据合同真源：Task 28 - 系统配置

import type { AdminPaginatedResult } from './admin-auth'

/** 系统配置分区 */
export type SystemConfigSection = 'cache' | 'rate_limit' | 'notification'

/** 缓存层级 */
export type CacheLayer = 'L1' | 'L2' | 'L3'

/** 缓存配置 */
export interface CacheConfig {
  /** L1 TTL(秒) */
  l1Ttl: number
  /** L2 TTL(Redis,秒) */
  l2Ttl: number
  /** L3 TTL(Qdrant,秒) */
  l3Ttl: number
}

/** 限流配置(按等级) */
export interface RateLimitConfig {
  /** 日调用上限(按等级 1-5) */
  dailyCallLimitByLevel: Record<number, number>
  /** 并发上限 */
  concurrencyLimit: number
  /** 月积分上限(按等级 1-5) */
  monthlyCreditsLimitByLevel: Record<number, number>
}

/** 通知配置 */
export interface NotificationConfig {
  /** 邮件 SMTP 配置 */
  smtp: {
    host: string
    port: number
    username: string
    /** AES 加密存储,前端不回显明文 */
    passwordMasked?: string
    from: string
    enabled: boolean
  }
  /** 短信配置 */
  sms: {
    provider: string
    accessKeyId: string
    accessKeySecretMasked?: string
    signName: string
    enabled: boolean
  }
  /** 客户端推送配置 */
  push: {
    appId: string
    appKeyMasked?: string
    enabled: boolean
  }
}

/** 系统配置(联合) */
export type SystemConfig = CacheConfig | RateLimitConfig | NotificationConfig

/** 清空缓存 DTO */
export interface ClearCacheDto {
  layer: CacheLayer
}

/** 更新系统配置 DTO */
export interface UpdateSystemConfigDto {
  section: SystemConfigSection
  config: Record<string, unknown>
}

/** 租户状态 */
export type TenantStatus = 'active' | 'suspended'

/** 租户条目 */
export interface Tenant {
  id: number
  name: string
  /** 配额 */
  quota: {
    /** 用户数上限 */
    users: number
    /** 调用量上限 */
    calls: number
    /** 存储上限(MB) */
    storage: number
  }
  status: TenantStatus
  createdAt: string
  updatedAt: string
}

/** 新增租户 DTO */
export interface CreateTenantDto {
  name: string
  quota: {
    users: number
    calls: number
    storage: number
  }
}

/** 更新租户 DTO */
export interface UpdateTenantDto {
  name?: string
  quota?: {
    users: number
    calls: number
    storage: number
  }
}

/** 公告类型 */
export type AnnouncementType = 'info' | 'warning' | 'critical'

/** 公告发布范围 */
export type AnnouncementScope = 'all' | 'level_specific'

/** 公告状态 */
export type AnnouncementStatus = 'draft' | 'published'

/** 公告条目 */
export interface Announcement {
  id: number
  title: string
  content: string
  type: AnnouncementType
  /** 发布范围 */
  scope: AnnouncementScope
  /** 指定用户等级(scope=level_specific 时生效,1-5) */
  targetLevel?: number
  /** 是否启用 */
  isActive: boolean
  status: AnnouncementStatus
  /** 发布时间 ISO 8601 */
  publishedAt?: string
  createdAt: string
  updatedAt: string
}

/** 新增公告 DTO */
export interface CreateAnnouncementDto {
  title: string
  content: string
  type: AnnouncementType
  scope: AnnouncementScope
  targetLevel?: number
  isActive: boolean
}

/** 更新公告 DTO */
export interface UpdateAnnouncementDto {
  title?: string
  content?: string
  type?: AnnouncementType
  scope?: AnnouncementScope
  targetLevel?: number
  isActive?: boolean
}

/** 公告查询参数 */
export interface AnnouncementQuery {
  status?: AnnouncementStatus
  page?: number
  pageSize?: number
}

/** 复用通用分页结果 */
export type { AdminPaginatedResult }
