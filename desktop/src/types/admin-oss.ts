
import type { AdminPaginatedResult } from './admin-auth'

/** 存储提供商 */
export type OssProvider = 'local' | 'aliyun' | 'tencent' | 'qiniu' | 'minio'

/** OSS 配置 */
export interface OssConfig {
  id: number
  name: string
  provider: OssProvider
  endpoint?: string
  region?: string
  bucket?: string
  accessKey?: string
  secretKey?: string
  isDefault: boolean
  isActive: boolean
  extraConfig?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface OssTestResult {
  success: boolean
  message: string
  latencyMs?: number
}

export interface OssStorageStats {
  totalCapacity: number
  usedCapacity: number
  fileCount: number
}

/** 创建 OSS 配置 DTO */
export interface CreateOssConfigDto {
  name: string
  provider: OssProvider
  endpoint?: string
  region?: string
  bucket?: string
  accessKey?: string
  secretKey?: string
  isDefault?: boolean
  extraConfig?: Record<string, unknown>
}

/** 更新 OSS 配置 DTO */
export interface UpdateOssConfigDto extends Partial<CreateOssConfigDto> {
  isActive?: boolean
}

export interface OssConfigQuery {
  page?: number
  pageSize?: number
  provider?: OssProvider
  isActive?: boolean
}

export type OssConfigPaginatedResult = AdminPaginatedResult<OssConfig>
