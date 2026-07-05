// 管理端认证与权限 API
//
// 端点契约：
//   POST   /admin/auth/login                 管理员登录
//   POST   /admin/auth/logout                管理员登出
//   GET    /admin/auth/profile               当前管理员信息 + 权限
//   POST   /admin/auth/change-password       修改管理员密码（首次登录强制改密）
//   GET    /admin/roles                      角色列表
//   PUT    /admin/roles/:id/permissions      更新角色权限
//   GET    /admin/operation-logs             操作日志查询
//
// 说明：
//   管理端使用独立 adminToken,不与用户端 token 混淆。
//   此文件导出的 adminRequest 是所有 admin-api 文件共用的 HTTP helper,
//   它基于独立的 axios 实例,在请求头手动注入 Authorization: Bearer ${adminToken}。
//   之所以不复用 httpClient: httpClient 的请求拦截器会注入用户端 accessToken,
//   会覆盖管理端 token,因此这里使用独立实例避免冲突。

import axios, { type AxiosRequestConfig } from 'axios'
import { BusinessError, NetworkError } from '@/utils/errors'
import { useAdminAuthStore } from '@/store/admin-auth'
import type {
  AdminLoginDto,
  AdminLoginResponse,
  AdminRole,
  AdminUser,
  OperationLog,
  OperationLogQuery,
  Permission,
  PermissionCode,
  AdminPaginatedResult
} from '@/types/admin-auth'

/** API 基础地址 */
const ADMIN_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || '/api'

/** 后端标准响应体 */
interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

/** 管理端专用 axios 实例(独立于用户端 httpClient) */
const adminAxios = axios.create({
  baseURL: ADMIN_API_BASE_URL,
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
})

/** 响应拦截器:解包 data + 业务码检查 + 网络错误 */
adminAxios.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResponse
    if (body && typeof body.code === 'number') {
      if (body.code === 0) {
        return body.data
      }
      throw new BusinessError(body.code, body.message || '请求失败', body.data)
    }
    return response.data
  },
  (error) => {
    if (!error.response) {
      const isTimeout =
        error.code === 'ECONNABORTED' ||
        (typeof error.message === 'string' && error.message.includes('timeout'))
      return Promise.reject(
        new NetworkError(isTimeout ? '请求超时' : '网络连接失败', {
          isTimeout,
          cause: error
        })
      )
    }
    const body = error.response.data as ApiResponse | undefined
    const msg =
      body?.message || error.message || `请求失败 (${error.response.status})`
    if (body && typeof body.code === 'number' && body.code !== 0) {
      return Promise.reject(new BusinessError(body.code, msg, body.data))
    }
    return Promise.reject(
      new BusinessError(error.response.status, msg, body?.data)
    )
  }
)

/**
 * 管理端通用请求方法(其它 admin-api 文件应复用此方法)
 * 自动从 adminStore 读取 token 并注入 Authorization 头。
 */
export async function adminRequest<T = unknown>(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  url: string,
  options: {
    data?: unknown
    params?: Record<string, unknown>
  } = {}
): Promise<T> {
  const token = useAdminAuthStore.getState().token
  const headers: Record<string, string> = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const config: AxiosRequestConfig = {
    method,
    url,
    headers,
    params: options.params,
    data: options.data
  }
  // 响应拦截器已解包 data,此处直接断言为 T
  return adminAxios.request(config) as unknown as Promise<T>
}

// ===== 权限编码常量(前端硬编码) =====

/** 全部权限定义(按分组组织,供角色权限编辑树使用) */
export const ALL_PERMISSIONS: Permission[] = [
  // 用户管理
  { code: 'user:read', name: '查看用户', group: '用户管理', description: '查询用户列表与详情' },
  { code: 'user:write', name: '编辑用户', group: '用户管理', description: '封禁/解封/调整等级' },
  // Agent
  { code: 'agent:read', name: '查看 Agent', group: 'Agent 管理', description: '查询 Agent 列表' },
  { code: 'agent:write', name: '编辑 Agent', group: 'Agent 管理', description: '上下架/配置 Agent' },
  { code: 'agent:approve', name: '审核 Agent', group: 'Agent 管理', description: '审批 Agent 上架' },
  // 工作流
  { code: 'workflow:read', name: '查看工作流', group: '工作流管理', description: '查询工作流' },
  { code: 'workflow:write', name: '编辑工作流', group: '工作流管理', description: '配置工作流' },
  { code: 'workflow:approve', name: '审核工作流', group: '工作流管理', description: '审批工作流' },
  // 插件
  { code: 'plugin:read', name: '查看插件', group: '插件管理', description: '查询插件' },
  { code: 'plugin:write', name: '编辑插件', group: '插件管理', description: '配置插件' },
  { code: 'plugin:approve', name: '审核插件', group: '插件管理', description: '审批插件' },
  // 模型
  { code: 'model:read', name: '查看模型', group: '模型管理', description: '查询模型配置' },
  { code: 'model:write', name: '编辑模型', group: '模型管理', description: '配置模型' },
  // 积分
  { code: 'credits:read', name: '查看积分', group: '积分管理', description: '查询积分账户' },
  { code: 'credits:adjust', name: '调整积分', group: '积分管理', description: '手动调整余额' },
  // 财务
  { code: 'payment:read', name: '查看订单', group: '财务管理', description: '查询充值订单' },
  { code: 'payment:refund', name: '退款', group: '财务管理', description: '处理退款' },
  // 审核
  { code: 'audit:read', name: '查看审核', group: '审核中心', description: '查询审核任务' },
  { code: 'audit:process', name: '处理审核', group: '审核中心', description: '审批处理' },
  // 统计
  { code: 'stats:read', name: '查看统计', group: '统计中心', description: '查看统计报表' },
  // 版本
  { code: 'version:read', name: '查看版本', group: '版本管理', description: '查询版本' },
  { code: 'version:write', name: '发布版本', group: '版本管理', description: '发布/回滚版本' },
  // 系统
  { code: 'system:read', name: '查看系统', group: '系统管理', description: '查看系统配置' },
  { code: 'system:write', name: '编辑系统', group: '系统管理', description: '修改系统配置' },
  // Key 池
  { code: 'apikey_pool:read', name: '查看 Key 池', group: 'Key 池管理', description: '查询 API Key 池' },
  { code: 'apikey_pool:write', name: '编辑 Key 池', group: 'Key 池管理', description: '增删改 Key' }
]

/** 所有权限编码列表 */
export const ALL_PERMISSION_CODES: PermissionCode[] = ALL_PERMISSIONS.map(
  (p) => p.code
)

/**
 * 管理员登录
 * POST /admin/auth/login  body: { username, password, captcha }
 */
export async function adminLogin(
  dto: AdminLoginDto
): Promise<AdminLoginResponse> {
  return adminRequest<AdminLoginResponse>('post', '/admin/auth/login', {
    data: dto
  })
}

/**
 * 管理员登出
 * POST /admin/auth/logout
 */
export async function adminLogout(): Promise<void> {
  await adminRequest<void>('post', '/admin/auth/logout')
}

/**
 * 获取当前管理员信息 + 权限
 * GET /admin/auth/profile
 */
export async function getAdminProfile(): Promise<{
  user: AdminUser
  permissions: PermissionCode[]
}> {
  return adminRequest<{ user: AdminUser; permissions: PermissionCode[] }>(
    'get',
    '/admin/auth/profile'
  )
}

/**
 * 修改管理员密码（首次登录强制改密）
 * POST /admin/auth/change-password  body: { oldPassword, newPassword }
 */
export async function changeAdminPassword(
  oldPassword: string,
  newPassword: string
): Promise<void> {
  await adminRequest<void>('post', '/admin/auth/change-password', {
    data: { oldPassword, newPassword }
  })
}

/**
 * 角色列表
 * GET /admin/roles
 */
export async function listAdminRoles(): Promise<AdminRole[]> {
  return adminRequest<AdminRole[]>('get', '/admin/roles')
}

/**
 * 更新角色权限
 * PUT /admin/roles/:id/permissions  body: { permissionCodes: string[] }
 */
export async function updateRolePermissions(
  roleId: number,
  permissionCodes: PermissionCode[]
): Promise<void> {
  await adminRequest<void>('put', `/admin/roles/${roleId}/permissions`, {
    data: { permissionCodes }
  })
}

/**
 * 操作日志查询
 * GET /admin/operation-logs?userId=&type=&startTime=&endTime=&page=&pageSize=
 */
export async function listOperationLogs(
  query: OperationLogQuery = {}
): Promise<AdminPaginatedResult<OperationLog>> {
  return adminRequest<AdminPaginatedResult<OperationLog>>(
    'get',
    '/admin/operation-logs',
    { params: query as Record<string, unknown> }
  )
}

export default {
  adminRequest,
  adminLogin,
  adminLogout,
  getAdminProfile,
  changeAdminPassword,
  listAdminRoles,
  updateRolePermissions,
  listOperationLogs,
  ALL_PERMISSIONS,
  ALL_PERMISSION_CODES
}
