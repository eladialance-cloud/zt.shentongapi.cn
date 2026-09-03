// 管理端自动化工作台 API（A1 模板 / A2 安全策略 / A3 用户设备视图）
//
// 端点契约：
//   GET    /admin/automation/templates?status=         模板列表（可过滤）
//   POST   /admin/automation/templates                  新建模板
//   PATCH  /admin/automation/templates/:id              更新模板（含上下架）
//   DELETE /admin/automation/templates/:id              删除模板
//   GET    /admin/automation/policies                   安全策略列表
//   PUT    /admin/automation/policies/:key              更新安全策略
//   GET    /admin/automation/overview                   用户 IM 绑定/设备在线/统计
//   GET    /admin/automation/audit?userId=&keyword=&page=&pageSize=  执行历史

import { adminRequest } from './admin-auth-api'

export interface AdminAutomationTemplate {
  id: number
  name: string
  description?: string
  stepsJson: Record<string, unknown>[]
  paramsSchema?: Record<string, unknown>[]
  keywords?: string
  status: string
  builtIn: number
  createdAt?: string
  updatedAt?: string
}

export interface AdminAutomationPolicy {
  id: number
  policyKey: string
  policyValue: unknown
  description?: string
  updatedAt?: string
}

export interface AdminAutomationOverviewUser {
  userId: number
  username: string
  email: string
  bindings: Record<string, string>
  online: boolean
  instanceCount: number
  auditCount: number
}

export interface AdminAutomationAuditItem {
  id: number
  userId: number
  commandId?: string
  direction?: string
  command?: string
  commandType?: string
  status?: string
  message?: string
  createdAt?: string
}

export function adminListAutomationTemplates(status?: string): Promise<AdminAutomationTemplate[]> {
  return adminRequest('get', '/admin/automation/templates', { params: status ? { status } : {} })
}

export function adminCreateAutomationTemplate(data: Record<string, unknown>): Promise<AdminAutomationTemplate> {
  return adminRequest('post', '/admin/automation/templates', { data })
}

export function adminUpdateAutomationTemplate(id: number, data: Record<string, unknown>): Promise<AdminAutomationTemplate> {
  return adminRequest('patch', `/admin/automation/templates/${id}`, { data })
}

export function adminDeleteAutomationTemplate(id: number): Promise<null> {
  return adminRequest('delete', `/admin/automation/templates/${id}`)
}

export function adminListAutomationPolicies(): Promise<AdminAutomationPolicy[]> {
  return adminRequest('get', '/admin/automation/policies')
}

export function adminUpdateAutomationPolicy(key: string, data: Record<string, unknown>): Promise<AdminAutomationPolicy> {
  return adminRequest('put', `/admin/automation/policies/${key}`, { data })
}

export function adminAutomationOverview(): Promise<{ users: AdminAutomationOverviewUser[]; total: number }> {
  return adminRequest('get', '/admin/automation/overview')
}

export function adminAutomationAudit(params: Record<string, unknown>): Promise<{
  list: AdminAutomationAuditItem[]
  total: number
}> {
  return adminRequest('get', '/admin/automation/audit', { params })
}