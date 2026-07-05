// Hermes 实例管理模块类型定义
// 数据合同真源：Task 13 - Hermes 实例管理（按分钟计费）

/** Hermes 实例状态 */
export type HermesStatus = 'running' | 'stopped' | 'error'

/** 资源占用信息 */
export interface ResourceUsage {
  /** CPU 占用百分比（0-100） */
  cpuPercent: number
  /** 内存占用 MB */
  memoryUsedMb: number
  /** 内存总量 MB */
  memoryTotalMb: number
}

/** Hermes 实例 */
export interface HermesInstance {
  id: number
  name: string
  status: HermesStatus
  /** 资源占用（running 状态下有效） */
  resourceUsage?: ResourceUsage
  /** 已挂载技能包数量 */
  skillCount: number
  /** 已挂载技能包 ID 列表 */
  skillIds?: number[]
  /** 错误信息（status='error' 时存在） */
  errorMessage?: string
  createdAt: string
  updatedAt?: string
}

/** 创建实例 DTO */
export interface CreateInstanceDto {
  name: string
  /** 初始挂载的技能包 ID 列表 */
  skillIds?: number[]
}

/** 技能包（市场） */
export interface HermesSkill {
  id: number
  name: string
  description: string
  author: string
  /** 价格（积分/分钟），0 表示免费 */
  pricePerMinute: number
  /** 安装次数 */
  installCount: number
  /** 当前用户是否已安装 */
  isInstalled?: boolean
  /** 图标 */
  icon?: string
  /** 版本号 */
  version?: string
}

/** 已安装技能包（与 HermesSkill 一致，但额外含挂载状态） */
export interface InstalledSkill extends HermesSkill {
  /** 是否已挂载到当前实例 */
  mounted?: boolean
}

/** 任务调用类型 */
export type CallType =
  | 'skill_execute'
  | 'tool_call'
  | 'agent_invoke'
  | 'workflow_run'

/** 任务状态 */
export type CallStatus = 'success' | 'failed' | 'timeout' | 'running'

/** 任务历史记录 */
export interface CallLog {
  id: number
  instanceId: number
  callType: CallType
  status: CallStatus
  /** 调用时长（毫秒） */
  durationMs: number
  /** 实际消耗积分（按分钟计费，由后端 HermesBillingService 计算） */
  creditsCost: number
  /** 调用的技能/工具名称 */
  target?: string
  /** 错误信息 */
  errorMessage?: string
  createdAt: string
}

/** 分页结果 */
export interface PaginatedResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** 分页查询 */
export interface PaginationQuery {
  page?: number
  pageSize?: number
}
