// SKILL 系统模块类型定义
// 数据合同真源：v0.3.1 Task 26 - SKILL 系统 3 类型 + 知识库 4 层级
//
// SKILL 三大类型：
//   - flow     流程型（按次计费 pricePerCall），由 N8N 工作流承载
//   - reasoning 推理型（按分钟计费 pricePerMinute），由 Hermes 承载
//   - tool     工具型（按次计费 pricePerCall），由 MCP 原生工具承载
//
// 说明：本模块是 SKILL 系统的统一抽象层，与 hermes-api 的技能包市场互补：
//   - hermes-api：Hermes 实例级别的技能包挂载/卸载/市场
//   - skill-api：跨基座的 SKILL 统一 CRUD 与生命周期管理

import type { OwnerType } from '@/types/resource'

/** SKILL 三大类型 */
export type SkillType = 'flow' | 'reasoning' | 'tool'

/** SKILL 状态 */
export type SkillStatus = 'active' | 'inactive' | 'pending'

/** SKILL 统一模型 */
export interface Skill {
  id: string
  name: string
  description: string
  /** SKILL 类型 */
  type: SkillType
  /** 分类 key */
  category: string
  /** 推理型：按分钟计费（积分/分钟）；0 表示免费 */
  pricePerMinute?: number
  /** 流程型/工具型：按次计费（积分/次）；0 表示免费 */
  pricePerCall?: number
  author: string
  version: string
  /** 平均评分（0-5） */
  rating: number
  /** 安装次数 */
  installCount: number
  status: SkillStatus
  /** 归属类型（官方/团队/用户） */
  ownerType: OwnerType
  /** SKILL 配置（随类型不同而结构不同） */
  config?: Record<string, unknown>
  /** 创建时间 */
  createdAt?: string
  /** 更新时间 */
  updatedAt?: string
}

/** SKILL 列表过滤参数 */
export interface SkillFilter {
  /** 按类型过滤 */
  type?: SkillType
  /** 按分类过滤 */
  category?: string
  /** 按归属过滤 */
  ownerType?: OwnerType
  /** 按状态过滤 */
  status?: SkillStatus
  /** 关键词 */
  keyword?: string
}

/** 创建 SKILL DTO */
export interface CreateSkillDto {
  name: string
  description: string
  type: SkillType
  category: string
  pricePerMinute?: number
  pricePerCall?: number
  author: string
  version: string
  ownerType?: OwnerType
  config?: Record<string, unknown>
}

/** 更新 SKILL DTO */
export interface UpdateSkillDto {
  name?: string
  description?: string
  category?: string
  pricePerMinute?: number
  pricePerCall?: number
  version?: string
  status?: SkillStatus
  config?: Record<string, unknown>
}

/** 评分 DTO */
export interface RateSkillDto {
  rating: number
  comment?: string
}
