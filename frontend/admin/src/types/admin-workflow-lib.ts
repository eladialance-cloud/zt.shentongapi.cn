// 管理端工作流模板库模块类型定义
// 数据合同真源：admin-workflow-lib 控制器

/** 工作流模板库实体 */
export interface N8nWorkflowLib {
  id: number
  name: string
  description: string
  category: string
  /** n8n 工作流 JSON 定义 */
  workflowJson?: string
  /** GitHub 来源仓库 */
  sourceRepo?: string
  /** 来源文件路径 */
  sourcePath?: string
  /** 版本号 */
  version?: string
  /** 发布状态 */
  publishStatus: 'draft' | 'pending_review' | 'approved' | 'published' | 'rejected'
  /** 是否已发布 */
  isPublished: boolean
  /** 图标 URL */
  icon?: string
  /** 标签 */
  tags?: string[]
  /** 参数表单定义 (JSON Schema) */
  inputSchema?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

/** 更新工作流模板库 DTO */
export interface UpdateWorkflowLibDto {
  name?: string
  description?: string
  category?: string
  workflowJson?: string
  version?: string
  icon?: string
  tags?: string[]
  inputSchema?: Record<string, unknown>
  publishStatus?: string
  isPublished?: boolean
}

/** 从 GitHub 导入 DTO */
export interface ImportGithubWorkflowDto {
  repoUrl: string
  /** 文件路径（如 workflows/example.json），空则扫描所有 */
  filePath?: string
  /** 分类 */
  category?: string
}

/** GitHub 导入结果 */
export interface ImportGithubWorkflowResult {
  imported: number
  items: N8nWorkflowLib[]
}

/** 执行日志状态 */
export type WorkflowExecStatus = 'success' | 'failed' | 'running'

/** 触发类型 */
export type WorkflowTriggerType = string

/** 工作流执行日志 */
export interface WorkflowExecLog {
  id: number
  workflowId: number
  triggerType: WorkflowTriggerType
  status: WorkflowExecStatus
  /** 输入 JSON */
  input?: Record<string, unknown>
  /** 输出 JSON */
  output?: Record<string, unknown>
  errorMessage?: string
  /** 执行耗时(毫秒) */
  duration?: number
  startedAt: string
  completedAt?: string
  createdAt: string
}

/** 工作流 MCP 绑定 */
export interface WorkflowMcpBind {
  id: number
  workflowId: number
  mcpServerId: number
  toolName?: string
  /** 配置 JSON */
  config?: Record<string, unknown>
  isEnabled: boolean
  createdAt: string
}

/** 创建 MCP 绑定 DTO */
export interface CreateMcpBindDto {
  mcpServerId: number
  toolName?: string
  config?: Record<string, unknown>
}
