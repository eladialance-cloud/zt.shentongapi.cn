// OpenClaw 实例管理模块类型定义
// 数据合同真源：v0.3.1 Task 25 - 四大基座 API 对齐 (OpenClaw)
//
// OpenClaw 是本地派发基座（端口 8080），负责意图解析、SKILL 匹配与
// 向垂直 AI 员工派发任务。本模块对应 /openclaw/* 端点。

/** OpenClaw 实例状态 */
export type OpenClawStatus = 'running' | 'stopped' | 'error' | 'syncing'

/** OpenClaw 实例运行状态详情 */
export interface OpenClawStatusInfo {
  status: OpenClawStatus
  /** 进程运行时长（秒） */
  uptimeSeconds?: number
  /** CPU 占用百分比（0-100） */
  cpuPercent?: number
  /** 内存占用 MB */
  memoryUsedMb?: number
  /** 已派发的 AI 员工数量 */
  agentCount?: number
  /** 当前活跃任务数 */
  activeTaskCount?: number
  /** 错误信息（status='error' 时存在） */
  errorMessage?: string
  /** 服务版本号 */
  version?: string
}

/** OpenClaw 实例 */
export interface OpenClawInstance {
  id: number
  name: string
  /** 实例状态 */
  status: OpenClawStatus
  /** 基础地址（通常为 http://localhost:8080） */
  baseUrl: string
  /** 实例配置 */
  config?: OpenClawConfig
  /** 已派发 AI 员工 ID 列表 */
  agentIds?: number[]
  /** 上次同步时间 */
  lastSyncedAt?: string
  createdAt: string
  updatedAt?: string
}

/** OpenClaw 实例配置 */
export interface OpenClawConfig {
  /** 意图解析模型 ID */
  intentModelId?: string
  /** 默认派发策略 */
  dispatchStrategy?: 'round_robin' | 'best_match' | 'manual'
  /** 是否启用自动 SKILL 匹配 */
  autoSkillMatch?: boolean
  /** 心跳间隔（秒） */
  heartbeatInterval?: number
  /** 附加参数 */
  [key: string]: unknown
}

/** 创建 OpenClaw 实例 DTO */
export interface CreateOpenClawInstanceDto {
  name: string
  baseUrl?: string
  config?: OpenClawConfig
  agentIds?: number[]
}

/** 更新 OpenClaw 实例配置 DTO */
export interface UpdateOpenClawConfigDto {
  config: OpenClawConfig
}

/** 同步结果 */
export interface SyncResult {
  success: boolean
  message: string
  /** 同步的 AI 员工数量 */
  syncedAgentCount?: number
  /** 同步耗时（毫秒） */
  durationMs?: number
}

/** 拉取状态结果（从 OpenClaw 拉取最新状态到后端） */
export interface PullStatusResult {
  success: boolean
  message: string
  /** 拉取到的状态快照 */
  status?: OpenClawStatusInfo
}

/** 健康检查结果 */
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded'
  /** 服务版本 */
  version?: string
  /** 响应耗时（毫秒） */
  latencyMs?: number
  message?: string
}
