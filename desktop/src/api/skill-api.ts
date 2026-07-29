// SKILL 系统 API
//
// v0.3.1 Task 26 - SKILL 系统 3 类型（flow/reasoning/tool）
//
// 端点契约：
//   GET    /skills                    SKILL 列表（支持 type/category/ownerType/status/keyword 过滤）
//   GET    /skills/:id                SKILL 详情
//   POST   /skills                    创建 SKILL（admin/team leader）
//   PUT    /skills/:id                更新 SKILL
//   DELETE /skills/:id                删除 SKILL
//   POST   /skills/:id/install        安装 SKILL
//   DELETE /skills/:id/install        卸载 SKILL
//   POST   /skills/:id/rate           评分 body: { rating, comment? }
//
// 说明：本模块是 SKILL 系统的统一 CRUD 入口，跨 N8N/Hermes/MCP 三基座。
// 与 hermes-api 的技能包市场（/hermes/skills/*）的关系：
//   - skill-api 提供统一 SKILL 视图，按 type 字段路由到对应基座
//   - hermes-api 提供 Hermes 实例级别的技能包挂载/卸载

import { httpClient } from './http-client'
import type {
  Skill,
  SkillFilter,
  CreateSkillDto,
  UpdateSkillDto,
  RateSkillDto
} from '@/types/skill'

/**
 * SKILL 列表
 * GET /skills?type=&category=&ownerType=&status=&keyword=
 */
export async function listSkills(
  filter: SkillFilter = {}
): Promise<Skill[]> {
  return httpClient.get<Skill[]>('/skills', { params: filter })
}

/**
 * SKILL 详情
 * GET /skills/:id
 */
export async function getSkill(id: string): Promise<Skill> {
  return httpClient.get<Skill>(`/skills/${id}`)
}

/**
 * 创建 SKILL
 * POST /skills
 */
export async function createSkill(dto: CreateSkillDto): Promise<Skill> {
  return httpClient.post<Skill>('/skills', dto)
}

/**
 * 更新 SKILL
 * PUT /skills/:id
 */
export async function updateSkill(
  id: string,
  dto: UpdateSkillDto
): Promise<Skill> {
  return httpClient.put<Skill>(`/skills/${id}`, dto)
}

/**
 * 删除 SKILL
 * DELETE /skills/:id
 */
export async function deleteSkill(id: string): Promise<void> {
  await httpClient.delete<void>(`/skills/${id}`)
}

/**
 * 安装 SKILL
 * POST /skills/:id/install
 */
export async function installSkill(id: string): Promise<void> {
  await httpClient.post<void>(`/skills/${id}/install`)
}

/**
 * 卸载 SKILL
 * DELETE /skills/:id/install
 */
export async function uninstallSkill(id: string): Promise<void> {
  await httpClient.delete<void>(`/skills/${id}/install`)
}

/**
 * 评分
 * POST /skills/:id/rate  body: { rating, comment? }
 */
export async function rateSkill(
  id: string,
  rating: number,
  comment?: string
): Promise<void> {
  const dto: RateSkillDto = { rating, comment }
  await httpClient.post<void>(`/skills/${id}/rate`, dto)
}

export default {
  listSkills,
  getSkill,
  createSkill,
  updateSkill,
  deleteSkill,
  installSkill,
  uninstallSkill,
  rateSkill
}
