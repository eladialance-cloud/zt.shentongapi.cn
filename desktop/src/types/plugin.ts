// 插件模块类型定义
// 数据合同真源：Task 10 插件功能模块

/** 插件类型 */
export type PluginType = 'tool' | 'connector' | 'knowledge_base' | 'workflow'

/** 插件定价 */
export interface PluginPricing {
  /** 每次调用消耗积分 */
  pricePerCall: number
  /** 按 Token 计费（输入/输出每千 token 积分） */
  pricePerToken: {
    input: number
    output: number
  }
}

/** 插件 */
export interface Plugin {
  id: number
  name: string
  description: string
  type: PluginType
  /** 作者标识：official / user / 第三方 */
  author: string
  isOfficial: boolean
  version: string
  /** 评分（0-5） */
  rating: number
  /** 累计调用次数 */
  callCount: number
  pricing: PluginPricing
  status: string
  /** 是否已安装（市场页用） */
  isInstalled?: boolean
  /** 是否启用（已安装页用） */
  isEnabled?: boolean
  /** 配置 Schema（用户填写的密钥/参数） */
  configSchema?: unknown
  /** 当前配置值 */
  config?: Record<string, unknown>
  createdAt?: Date
  updatedAt?: Date
}

/** 插件调用日志 */
export interface PluginCallLog {
  id: number
  pluginId: number
  pluginName: string
  input: unknown
  output: unknown
  status: string
  durationMs: number
  creditsCost: number
  errorMessage?: string
  createdAt: Date
}

/** 插件市场查询参数 */
export interface PluginMarketQuery {
  category?: PluginType | string
  keyword?: string
  page?: number
  pageSize?: number
}

/** 插件调用日志查询参数 */
export interface PluginLogQuery {
  pluginId?: number
  status?: string
  page?: number
  pageSize?: number
}

/** 分页结果 */
export interface PaginatedResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
