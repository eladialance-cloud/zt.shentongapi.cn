// Hermes 实例管理 API
//
// 端点契约：
//   GET    /hermes/instances                          实例列表
//   POST   /hermes/instances                          创建实例 body: { name, skillIds }
//   GET    /hermes/instances/:id                      实例详情
//   POST   /hermes/instances/:id/start                启动实例
//   POST   /hermes/instances/:id/stop                 停止实例
//   DELETE /hermes/instances/:id                      删除实例
//   GET    /hermes/instances/:id/call-logs?page=      任务历史
//   POST   /hermes/instances/:id/skills/:skillId/unmount  卸载技能包
//   GET    /hermes/skills/market                      技能包市场
//   GET    /hermes/skills/installed                   已安装技能包
//   POST   /hermes/skills/:skillId/install            安装技能包

import { httpClient } from './http-client'
import type {
  HermesInstance,
  CreateInstanceDto,
  CallLog,
  HermesSkill,
  InstalledSkill,
  PaginatedResult,
  PaginationQuery
} from '@/types/hermes'

/**
 * 实例列表
 * GET /hermes/instances
 */
export async function listInstances(): Promise<HermesInstance[]> {
  return httpClient.get<HermesInstance[]>('/hermes/instances')
}

/**
 * 创建实例
 * POST /hermes/instances
 */
export async function createInstance(dto: CreateInstanceDto): Promise<HermesInstance> {
  return httpClient.post<HermesInstance>('/hermes/instances', dto)
}

/**
 * 实例详情
 * GET /hermes/instances/:id
 */
export async function getInstance(id: number): Promise<HermesInstance> {
  return httpClient.get<HermesInstance>(`/hermes/instances/${id}`)
}

/**
 * 启动实例
 * POST /hermes/instances/:id/start
 */
export async function startInstance(id: number): Promise<HermesInstance> {
  return httpClient.post<HermesInstance>(`/hermes/instances/${id}/start`)
}

/**
 * 停止实例
 * POST /hermes/instances/:id/stop
 */
export async function stopInstance(id: number): Promise<HermesInstance> {
  return httpClient.post<HermesInstance>(`/hermes/instances/${id}/stop`)
}

/**
 * 删除实例
 * DELETE /hermes/instances/:id
 */
export async function deleteInstance(id: number): Promise<void> {
  await httpClient.delete<void>(`/hermes/instances/${id}`)
}

/**
 * 任务历史
 * GET /hermes/instances/:id/call-logs?page=
 */
export async function getCallLogs(
  id: number,
  query: PaginationQuery = {}
): Promise<PaginatedResult<CallLog>> {
  return httpClient.get<PaginatedResult<CallLog>>(
    `/hermes/instances/${id}/call-logs`,
    { params: query }
  )
}

/**
 * 卸载技能包
 * POST /hermes/instances/:id/skills/:skillId/unmount
 */
export async function unmountSkill(
  instanceId: number,
  skillId: number
): Promise<HermesInstance> {
  return httpClient.post<HermesInstance>(
    `/hermes/instances/${instanceId}/skills/${skillId}/unmount`
  )
}

/**
 * 技能包市场
 * GET /hermes/skills/market
 */
export async function listSkillMarket(): Promise<HermesSkill[]> {
  return httpClient.get<HermesSkill[]>('/hermes/skills/market')
}

/**
 * 已安装技能包
 * GET /hermes/skills/installed
 */
export async function listInstalledSkills(): Promise<InstalledSkill[]> {
  return httpClient.get<InstalledSkill[]>('/hermes/skills/installed')
}

/**
 * 安装技能包
 * POST /hermes/skills/:skillId/install
 */
export async function installSkill(skillId: number): Promise<HermesSkill> {
  return httpClient.post<HermesSkill>(`/hermes/skills/${skillId}/install`)
}

export default {
  listInstances,
  createInstance,
  getInstance,
  startInstance,
  stopInstance,
  deleteInstance,
  getCallLogs,
  unmountSkill,
  listSkillMarket,
  listInstalledSkills,
  installSkill
}
