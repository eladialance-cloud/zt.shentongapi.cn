// 管理端 OSS 存储配置管理模块类型定义
// 数据合同真源：后端 SysOssConfig 实体

import type { AdminPaginatedResult } from './admin-auth'

/** OSS 提供商类型 */
export type OssProvider = 'tencent' | 'aliyun' | 'qiniu' | 'aws' | 'minio'

/** OSS 配置项 */
export interface AdminOssConfig {
  id: number
  /** 配置名称 */
  name: string
  /** 提供商 */
  provider: OssProvider
  /** 存储桶名称 */
  bucket: string
  /** 区域 */
  region: string
  /** 自定义端点 */
  endpoint?: string
  /** Access Key */
  accessKey: string
  /** Secret Key（后端返回时已脱敏） */
  secretKey: string
  /** CDN 域名 */
  domain?: string
  /** 是否为默认配置 */
  isDefault: boolean
  /** 是否启用 */
  isEnabled: boolean
  createdAt: string
  updatedAt: string
}

/** OSS 配置列表查询参数 */
export interface AdminOssQuery {
  page?: number
  pageSize?: number
  provider?: OssProvider | ''
  isEnabled?: boolean | ''
}

/** 创建 OSS 配置 DTO */
export interface CreateAdminOssConfigDto {
  name: string
  provider: OssProvider
  bucket: string
  region: string
  endpoint?: string
  accessKey: string
  secretKey: string
  domain?: string
  isDefault?: boolean
  isEnabled?: boolean
}

/** 更新 OSS 配置 DTO */
export interface UpdateAdminOssConfigDto {
  name?: string
  provider?: OssProvider
  bucket?: string
  region?: string
  endpoint?: string
  accessKey?: string
  secretKey?: string
  domain?: string
  isDefault?: boolean
  isEnabled?: boolean
}

/** 测试连接结果 */
export interface OssTestResult {
  success: boolean
  message: string
  /** 上传测试文件 URL（可选） */
  testUrl?: string
  /** 耗时毫秒 */
  durationMs?: number
}

/** 存储统计信息 */
export interface OssStorageStats {
  /** 配置 ID */
  configId: number
  /** 已用存储空间（字节） */
  usedStorage: number
  /** 文件总数 */
  fileCount: number
  /** 本月上传文件数 */
  monthlyUploadCount: number
  /** 本月下载流量（字节） */
  monthlyDownloadTraffic: number
  /** 最近上传时间 */
  lastUploadAt?: string
}

/** 复用通用分页结果 */
export type { AdminPaginatedResult }
