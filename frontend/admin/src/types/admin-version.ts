// 管理端客户端版本管理模块类型定义
// 数据合同真源：Task 27 - 客户端版本管理

import type { AdminPaginatedResult } from './admin-auth'

/** 客户端平台 */
export type VersionPlatform = 'win' | 'mac'

/** 客户端版本条目 */
export interface VersionItem {
  id: number
  /** 语义版本号 x.y.z */
  version: string
  platform: VersionPlatform
  /** 下载 URL */
  downloadUrl: string
  /** 更新日志 */
  changelog?: string
  /** 是否强制更新 */
  forceUpdate: boolean
  /** 灰度比例 0-100 */
  grayscalePercent: number
  /** 是否为最新版本 */
  isLatest?: boolean
  /** 发布时间 ISO 8601 */
  releasedAt?: string
  createdAt: string
  updatedAt: string
}

/** 版本查询参数 */
export interface VersionQuery {
  platform?: VersionPlatform
  page?: number
  pageSize?: number
}

/** 新增版本 DTO */
export interface CreateVersionDto {
  version: string
  platform: VersionPlatform
  downloadUrl: string
  changelog?: string
  forceUpdate: boolean
  grayscalePercent: number
}

/** 更新版本 DTO */
export interface UpdateVersionDto {
  version?: string
  platform?: VersionPlatform
  downloadUrl?: string
  changelog?: string
  forceUpdate?: boolean
  grayscalePercent?: number
}

/** 最新版本信息 */
export interface LatestVersion {
  version: string
  platform: VersionPlatform
  downloadUrl: string
  changelog?: string
  forceUpdate: boolean
  releasedAt?: string
}

/** 版本统计 */
export interface VersionStats {
  versionId: number
  version: string
  platform: VersionPlatform
  /** 安装数 */
  installCount: number
  /** 活跃数 */
  activeCount: number
}

/** 复用通用分页结果 */
export type { AdminPaginatedResult }
