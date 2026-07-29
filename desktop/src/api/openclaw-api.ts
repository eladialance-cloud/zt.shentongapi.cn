// OpenClaw 派发基座 API
//
// v0.3.1 Task 25 - 四大基座 API 对齐
//
// 端点契约（8 endpoints）：
//   GET    /openclaw/health                  健康检查
//   GET    /openclaw/instances               实例列表
//   POST   /openclaw/instances               创建实例
//   DELETE /openclaw/instances/:id           删除实例
//   POST   /openclaw/instances/:id/sync      同步 AI 员工到 OpenClaw
//   GET    /openclaw/instances/:id/status    实例运行状态
//   PUT    /openclaw/instances/:id/config    更新实例配置
//   POST   /openclaw/instances/:id/pull-status  从 OpenClaw 拉取状态快照
//
// 说明：OpenClaw 是本地派发基座（端口 51096），负责意图解析、SKILL 匹配
// 并向垂直 AI 员工派发任务。本模块与 service-manager-api（进程级启停）互补：
//   - service-manager-api：管理本地服务进程的启动/停止/重启
//   - openclaw-api：管理 OpenClaw 业务实例、同步 AI 员工、拉取状态

import { httpClient } from './http-client'
import type {
  OpenClawInstance,
  OpenClawStatusInfo,
  OpenClawConfig,
  CreateOpenClawInstanceDto,
  UpdateOpenClawConfigDto,
  SyncResult,
  PullStatusResult,
  HealthCheckResult
} from '@/types/openclaw'

/**
 * 健康检查
 * GET /openclaw/health
 */
export async function getHealth(): Promise<HealthCheckResult> {
  return httpClient.get<HealthCheckResult>('/openclaw/health')
}

/**
 * 实例列表
 * GET /openclaw/instances
 */
export async function listInstances(): Promise<OpenClawInstance[]> {
  const result = await httpClient.get<{ list: OpenClawInstance[]; total: number }>(
    '/openclaw/instances'
  )
  return result?.list ?? []
}

/**
 * 创建实例
 * POST /openclaw/instances
 */
export async function createInstance(
  dto: CreateOpenClawInstanceDto
): Promise<OpenClawInstance> {
  return httpClient.post<OpenClawInstance>('/openclaw/instances', dto)
}

/**
 * 删除实例
 * DELETE /openclaw/instances/:id
 */
export async function deleteInstance(id: number): Promise<void> {
  await httpClient.delete<void>(`/openclaw/instances/${id}`)
}

/**
 * 同步 AI 员工到 OpenClaw 实例
 * POST /openclaw/instances/:id/sync
 *
 * 将后端登记的 AI 员工列表推送到 OpenClaw，使其具备派发目标。
 */
export async function syncInstance(id: number): Promise<SyncResult> {
  return httpClient.post<SyncResult>(`/openclaw/instances/${id}/sync`)
}

/**
 * 实例运行状态
 * GET /openclaw/instances/:id/status
 */
export async function getInstanceStatus(
  id: number
): Promise<OpenClawStatusInfo> {
  return httpClient.get<OpenClawStatusInfo>(`/openclaw/instances/${id}/status`)
}

/**
 * 更新实例配置
 * PUT /openclaw/instances/:id/config
 */
export async function updateInstanceConfig(
  id: number,
  dto: UpdateOpenClawConfigDto
): Promise<OpenClawInstance> {
  return httpClient.put<OpenClawInstance>(
    `/openclaw/instances/${id}/config`,
    dto
  )
}

/**
 * 从 OpenClaw 拉取状态快照
 * POST /openclaw/instances/:id/pull-status
 *
 * 主动从 OpenClaw 进程拉取最新运行状态并写入后端，用于状态栏/机房展示。
 */
export async function pullStatus(id: number): Promise<PullStatusResult> {
  return httpClient.post<PullStatusResult>(`/openclaw/instances/${id}/pull-status`)
}

export default {
  getHealth,
  listInstances,
  createInstance,
  deleteInstance,
  syncInstance,
  getInstanceStatus,
  updateInstanceConfig,
  pullStatus
}
