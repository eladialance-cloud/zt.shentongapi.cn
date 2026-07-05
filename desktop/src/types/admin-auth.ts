// 管理端认证与权限模块类型定义
// 数据合同真源：Task 17 - 管理端认证与权限

/** 权限编码（前端硬编码常量体系） */
export type PermissionCode =
  | 'user:read'
  | 'user:write'
  | 'agent:read'
  | 'agent:write'
  | 'agent:approve'
  | 'workflow:read'
  | 'workflow:write'
  | 'workflow:approve'
  | 'plugin:read'
  | 'plugin:write'
  | 'plugin:approve'
  | 'model:read'
  | 'model:write'
  | 'credits:read'
  | 'credits:adjust'
  | 'payment:read'
  | 'payment:refund'
  | 'audit:read'
  | 'audit:process'
  | 'stats:read'
  | 'version:read'
  | 'version:write'
  | 'system:read'
  | 'system:write'
  | 'apikey_pool:read'
  | 'apikey_pool:write'

/** 权限定义 */
export interface Permission {
  /** 权限编码 */
  code: PermissionCode
  /** 权限名称 */
  name: string
  /** 权限描述 */
  description?: string
  /** 所属分组 */
  group: string
}

/** 管理员用户 */
export interface AdminUser {
  id: number
  username: string
  email?: string
  avatar?: string
  /** 角色 ID 列表 */
  roleIds: number[]
  /** 角色编码列表 */
  roleCodes: string[]
  status: 'active' | 'disabled'
  lastLoginAt?: string
  createdAt: string
  updatedAt: string
}

/** 管理端角色 */
export interface AdminRole {
  id: number
  /** 角色名 */
  name: string
  /** 角色编码 */
  code: string
  /** 已分配的权限编码列表 */
  permissionCodes: PermissionCode[]
  /** 关联用户数 */
  userCount?: number
  description?: string
  createdAt: string
  updatedAt: string
}

/** 管理员登录请求 */
export interface AdminLoginDto {
  username: string
  password: string
  /** 图形验证码 */
  captcha: string
}

/** 管理员登录响应 */
export interface AdminLoginResponse {
  /** 管理端访问令牌 */
  token: string
  /** 令牌过期时间(毫秒时间戳) */
  expiresAt: number
  /** 管理员用户信息 */
  user: AdminUser
  /** 权限编码列表 */
  permissions: PermissionCode[]
}

/** 操作类型 */
export type OperationType =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'ban'
  | 'unban'
  | 'adjust'
  | 'approve'
  | 'reject'
  | 'refund'
  | 'config'
  | 'other'

/** 操作日志 */
export interface OperationLog {
  id: number
  /** 操作时间 ISO 8601 */
  createdAt: string
  /** 操作人 ID */
  userId: number
  /** 操作人用户名 */
  username: string
  /** 操作类型 */
  type: OperationType
  /** 目标资源类型 */
  targetResource: string
  /** 目标资源 ID */
  targetId?: string
  /** 操作 IP */
  ip: string
  /** 详情(自由文本或 JSON) */
  detail: string
}

/** 操作日志查询参数 */
export interface OperationLogQuery {
  userId?: number
  type?: OperationType
  startTime?: string
  endTime?: string
  page?: number
  pageSize?: number
}

/** 通用分页查询参数 */
export interface AdminPaginationQuery {
  page?: number
  pageSize?: number
}

/** 通用分页结果 */
export interface AdminPaginatedResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
