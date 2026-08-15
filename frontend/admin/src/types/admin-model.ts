// 管理端大模型配置模块类型定义
// v0.7.0+：供应商体系（添加第三方供应商 -> 读取模型 -> 勾选 -> 逐模型定价 -> 导入）

import type { AdminPaginatedResult } from './admin-auth'

/** 连接状态 */
export type ConnectionStatus = 'untested' | 'connected' | 'failed'

/** 模型能力 */
export type ModelCapability =
  | 'vision'
  | 'function_calling'
  | 'streaming'
  | 'reasoning'
  | 'json_mode'

/** 模型类型标签（路由/计费分类，由输出类型×输入类型推导）：chat 文本对话 / vision 图片识图 / image 文生图 / image_edit 图生图 / video 视频生成 / tts 语音合成 */
export type ModelType = 'chat' | 'vision' | 'image' | 'image_edit' | 'video' | 'tts' | string

/** 供应商读取类型：对话 / 图片 / 视频（同一 Key，URL 后缀由厂商模板自动匹配） */
export type ProviderType = 'chat' | 'image' | 'video'

/** 模型输出类型：text 文本 / image 图片 / video 视频 / audio 语音 */
export type ModelOutputType = 'text' | 'image' | 'video' | 'audio'

/** 模型输入类型（能力，多选）：text 文字 / image 图片 / video 视频 / audio 语音 */
export type ModelInputType = 'text' | 'image' | 'video' | 'audio'

/** 高级能力（多选） */
export type AdvancedCapability =
  | 'function_calling'
  | 'streaming'
  | 'reasoning'
  | 'json_mode'

/** 用户等级 */
export type MinUserLevel = 1 | 2 | 3 | 4 | 5

/** 模型配置项 */
export interface AdminModelItem {
  id: number
  /** 所属供应商 ID */
  providerId: number | null
  /** 供应商 slug */
  provider: string
  /** 供应商显示名 */
  providerName: string
  /** 模型 ID(unique) */
  modelId: string
  /** 真正发送给上游 API 的模型名 */
  upstreamModelId: string
  /** 分类标签 */
  modelType: ModelType
  /** 图片生成积分/张 */
  pricePerImage?: number | null
  /** 排序权重（越小越靠前） */
  sortOrder?: number
  /** 按次计费积分（TTS 等按次调用模型） */
  pricePerCall?: number | null
  /** 视频生成价格矩阵 */
  videoPrices?: Record<string, Record<string, number>>
  /** 生成参数选项 */
  generationParams?: Record<string, unknown>
  /** 显示名 */
  displayName: string
  apiKeyMasked?: string
  apiEndpoint?: string
  connectionStatus?: ConnectionStatus
  lastTestedAt?: string
  /** 输入单价(积分/千token) */
  inputPricePerToken: number
  /** 输出单价(积分/千token) */
  outputPricePerToken: number
  minUserLevel: MinUserLevel
  enabled: boolean
  syncStatus: 'pending' | 'synced' | 'failed'
  syncErrorMessage?: string
  capabilities: ModelCapability[]
  /** 输出类型（text/image/video/audio） */
  outputType: ModelOutputType
  /** 输入类型（能力，多选） */
  inputTypes: ModelInputType[]
  /** 高级能力（多选） */
  advancedCapabilities: AdvancedCapability[]
  concurrencyLimit?: number
  rateLimitPerMinute?: number
  lastSyncedAt?: string
  createdAt: string
  updatedAt: string
  /** P2：调用模式（14 种字典 key） */
  callMode?: CallModeKey
  /** P2：场景标签（固定字典多选） */
  scenarioTags?: string[]
  /** P2：计费方式 token/per_image/per_call/per_minute/per_second */
  pricingMode?: string | null
  /** P2：视频分辨率档 × 积分/秒 */
  videoPerSecond?: Record<string, number> | null
  /** P2：动态规格字段值 */
  specs?: Record<string, unknown> | null
  /** P2：模型图标 URL */
  iconUrl?: string | null
  /** P2：成本价（元） */
  costPrice?: number | null
  /** P2：管理员备注 */
  remark?: string | null
  /** P2：按分钟计费积分 */
  pricePerMinute?: number | null
}

/** 模型查询参数 */
export interface AdminModelQuery {
  provider?: string | ''
  enabled?: boolean | ''
  keyword?: string
  modelType?: string
  page?: number
  pageSize?: number
}

/** 供应商状态 */
export type ProviderStatus = 'active' | 'disabled'

/** 第三方 API 供应商 */
export interface AdminProviderItem {
  id: number
  name: string
  slug: string
  baseUrl: string
  apiKeyMasked?: string
  hasApiKey: boolean
  config?: Record<string, unknown> | null
  status: ProviderStatus
  connectionStatus: ConnectionStatus
  lastTestedAt?: string
  isBuiltin: boolean
  /** 是否全局中转（全站唯一，优先用于所有模型的 BaseURL+Key） */
  isGlobal?: boolean
  /** API 风格：openai_compatible / dashscope_native / anthropic / custom */
  apiStyle?: string
  /** 每分钟限流（0 = 不限制） */
  rateLimitPerMinute?: number
  /** 并发限制（0 = 不限制） */
  concurrencyLimit?: number
  /** 余额查询 URL（空字符串表示关闭余额监控） */
  balanceUrl?: string
  /** 余额查询请求头（JSON） */
  balanceHeaders?: Record<string, unknown> | null
  /** 余额查询附加参数（JSON） */
  balanceExtra?: Record<string, unknown> | null
  /** 最近一次余额（积分） */
  lastBalance?: number
  /** 最近一次余额检查时间 */
  balanceCheckedAt?: string
  /** 余额告警阈值（积分） */
  balanceAlertThreshold?: number
  modelCount: number
  createdAt: string
  updatedAt: string
}

/** 新增供应商 DTO */
export interface CreateProviderDto {
  name: string
  baseUrl: string
  apiKey?: string
  /** API 风格：openai_compatible / dashscope_native / anthropic / custom */
  apiStyle?: string
  config?: Record<string, unknown>
  /** 是否设为全局中转（置 true 会取消其他供应商的全局标记） */
  isGlobal?: boolean
}

/** 更新供应商 DTO */
export interface UpdateProviderDto {
  name?: string
  baseUrl?: string
  apiKey?: string
  config?: Record<string, unknown>
  status?: ProviderStatus
  isGlobal?: boolean
}

/** 测试供应商 DTO */
export interface TestProviderDto {
  providerId?: number
  baseUrl?: string
  apiKey?: string
  model?: string
  /** 适配配置（chatPath/modelsPath/generation 等） */
  config?: Record<string, unknown>
}

/** 测试结果 */
export interface TestProviderResult {
  success: boolean
  providerId: number | null
  response: string
}

/** 上游模型项（读取模型列表结果） */
export interface UpstreamModel {
  modelId: string
  ownedBy?: string
  upstreamInputPrice?: number
  upstreamOutputPrice?: number
  alreadyExists: boolean
}

/** 读取上游模型结果 */
export interface FetchProviderModelsResult {
  provider: AdminProviderItem
  models: UpstreamModel[]
}

/** 勾选导入的单个模型（逐模型定价 + 模型类型） */
export interface ImportProviderModelItem {
  /** 上游模型 ID（实际发送） */
  upstreamModelId: string
  displayName?: string
  modelType?: ModelType
  /** 输出类型（text/image/video/audio） */
  outputType?: ModelOutputType
  /** 输入类型（能力，多选） */
  inputTypes?: ModelInputType[]
  /** 高级能力（多选） */
  advancedCapabilities?: AdvancedCapability[]
  /** 最终输入单价(积分/千token) */
  inputPricePer1k?: number
  /** 最终输出单价(积分/千token) */
  outputPricePer1k?: number
  capabilities?: ModelCapability[]
  enabled?: boolean
}

/** 勾选导入 DTO */
export interface ImportProviderModelsDto {
  models: ImportProviderModelItem[]
}

/** 导入结果 */
export interface ImportProviderModelsResult {
  imported: number
  skipped: number
  errors: Array<{ modelId: string; error: string }>
}

/** 新增模型 DTO（支持 P2 调用模式/规格/计费全字段） */
export interface CreateAdminModelDto {
  provider: string
  modelId: string
  displayName: string
  apiKey?: string
  apiEndpoint?: string
  inputPricePerToken?: number
  outputPricePerToken?: number
  capabilities: ModelCapability[]
  enabled: boolean
  concurrencyLimit?: number
  rateLimitPerMinute?: number
  minUserLevel: MinUserLevel
  providerId?: number
  modelType?: ModelType
  upstreamModelId?: string
  pricePerImage?: number
  sortOrder?: number
  pricePerCall?: number | null
  videoPrices?: Record<string, Record<string, number>>
  generationParams?: Record<string, unknown>
  outputType?: ModelOutputType
  inputTypes?: ModelInputType[]
  advancedCapabilities?: AdvancedCapability[]
  callMode?: CallModeKey
  scenarioTags?: string[]
  pricingMode?: string
  videoPerSecond?: Record<string, number>
  specs?: Record<string, unknown>
  costPrice?: number
  remark?: string
  pricePerMinute?: number
}

/** 更新模型 DTO */
export interface UpdateAdminModelDto {
  provider?: string
  modelId?: string
  displayName?: string
  apiKey?: string
  apiEndpoint?: string
  inputPricePerToken?: number
  outputPricePerToken?: number
  capabilities?: ModelCapability[]
  /** 输出类型（text/image/video/audio） */
  outputType?: ModelOutputType
  /** 输入类型（能力，多选） */
  inputTypes?: ModelInputType[]
  /** 高级能力（多选） */
  advancedCapabilities?: AdvancedCapability[]
  enabled?: boolean
  concurrencyLimit?: number
  rateLimitPerMinute?: number
  minUserLevel?: MinUserLevel
  modelType?: ModelType
  upstreamModelId?: string
  pricePerImage?: number | null
  sortOrder?: number
  pricePerCall?: number | null
  videoPrices?: Record<string, Record<string, number>>
  generationParams?: Record<string, unknown>
  callMode?: CallModeKey
  scenarioTags?: string[]
  pricingMode?: string
  videoPerSecond?: Record<string, number>
  specs?: Record<string, unknown>
  iconUrl?: string
  costPrice?: number
  remark?: string
  pricePerMinute?: number
}

/** 复用通用分页结果 */
export type { AdminPaginatedResult }

// ===== P2：调用模式元数据（与后端 call-modes 字典同步） =====

/** 调用模式 key（14 种字典 key，与后端 call-modes 字典同步） */
export type CallModeKey = 'text_chat' | 'embedding' | 'rerank' | 'vision' | 'ocr' | 'image' | 'image_edit' | 'video' | 'video_edit' | 'music' | 'stt' | 'tts' | 'voice_conversion' | 'realtime'

/** 计费方式 key（与后端计费字典同步） */
export type BillingMode = 'token' | 'per_image' | 'per_call' | 'per_minute' | 'per_second'

/** 调用模式定义（后端 GET /admin/models/call-modes 下发） */
export interface CallModeDef {
  key: CallModeKey
  label: string
  group: 'text' | 'multimodal' | 'generation' | 'voice'
  apiPath: string
  sync: boolean
  async: boolean
  streaming: boolean
  output: ModelOutputType
  inputs: ModelInputType[]
  billingModes: BillingMode[]
  recommendedBilling: BillingMode
  specFields: string[]
  advancedCaps: string[]
  recommendedScenarioTags: string[]
}

/** 动态规格字段 schema */
export interface SpecFieldSchema {
  label: string
  type: 'number' | 'text' | 'select' | 'multiselect' | 'json' | 'boolean'
  options?: string[]
  default?: unknown
  placeholder?: string
  min?: number
  max?: number
}

/** 动态表单元数据（一次拉取，缓存到页面状态） */
export interface CallModesMeta {
  callModes: CallModeDef[]
  specFieldSchemas: Record<string, SpecFieldSchema>
  advancedCapLabels: Record<string, string>
  scenarioTags: string[]
}

/** 模型模板参考价格（与后端 ReferencePrice 对齐） */
export interface ModelTemplateReferencePrice {
  inputPricePerToken?: number
  outputPricePerToken?: number
  pricePerImage?: number
  pricePerCall?: number
  pricePerMinute?: number
  videoPerSecond?: Record<string, number>
}

/** 模型配置模板 */
export interface ModelTemplateItem {
  key: string
  name: string
  callMode: CallModeKey
  description: string
  specValues: Record<string, unknown>
  generationParams: Record<string, unknown>
  recommendedScenarioTags: string[]
  referencePrice?: ModelTemplateReferencePrice
}

/** 供应商余额检查结果 */
export interface ProviderBalanceResult {
  providerId: number
  balance: number
  checkedAt: string
  alert: boolean
  threshold: number | null
}

/** 批量上架/改价结果 */
export interface BatchUpdateResult {
  updated: number
}

/** 批量导入配置 JSON 结果 */
export interface ImportModelsJsonResult {
  imported: number
  updated: number
  errors: Array<{ index: number; error: string }>
}

// ===== 模型市场（P1）=====

/** 市场厂商（含该厂商供应商是否已创建） */
export interface MarketVendor {
  vendor: string
  nameSuggestion: string
  baseUrl: string
  chatPath: string
  modelsPath: string
  apiStyle: string
  generation: Record<string, unknown>
  hasProvider: boolean
  providerId: number | null
  presetCount: number
}

/** 市场预设条目 */
export interface MarketPresetItem {
  key: string
  vendor: string
  name: string
  callMode: CallModeKey
  description: string
  upstreamModelId: string
  specValues: Record<string, unknown>
  generationParams: Record<string, unknown>
  recommendedScenarioTags: string[]
  referencePrice?: ModelTemplateReferencePrice
  verified: boolean
  requiresActivation?: boolean
}

/** 市场批量导入单条 */
export interface MarketImportItem {
  presetKey: string
  displayName?: string
  enabled?: boolean
  scenarioTags?: string[]
  priceOverrides?: Record<string, unknown>
}

/** 市场批量导入结果 */
export interface MarketImportResult {
  imported: number
  failed: number
  results: Array<{ presetKey: string; ok: boolean; modelId?: string; error?: string }>
}
