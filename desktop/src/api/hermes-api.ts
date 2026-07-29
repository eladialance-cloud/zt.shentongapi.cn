// Hermes 瀹炰緥绠＄悊 API
//
// 绔偣濂戠害锛?//   GET    /hermes/instances                          瀹炰緥鍒楄〃
//   POST   /hermes/instances                          鍒涘缓瀹炰緥 body: { name, skillIds }
//   GET    /hermes/instances/:id                      瀹炰緥璇︽儏
//   POST   /hermes/instances/:id/start                鍚姩瀹炰緥
//   POST   /hermes/instances/:id/stop                 鍋滄瀹炰緥
//   DELETE /hermes/instances/:id                      鍒犻櫎瀹炰緥
//   GET    /hermes/instances/:id/call-logs?page=      浠诲姟鍘嗗彶
//   POST   /hermes/instances/:id/execute              鎵ц浠诲姟 body: ExecuteTaskDto
//   POST   /hermes/instances/:id/skills/:skillId/mount    鎸傝浇鎶€鑳藉寘
//   POST   /hermes/instances/:id/skills/:skillId/unmount  鍗歌浇鎶€鑳藉寘
//   GET    /hermes/skills/market                      鎶€鑳藉寘甯傚満
//   GET    /hermes/skills/installed                   宸插畨瑁呮妧鑳藉寘
//   GET    /hermes/skills/categories                  鎶€鑳藉寘鍒嗙被
//   POST   /hermes/skills/:skillId/install            瀹夎鎶€鑳藉寘
//   DELETE /hermes/skills/:skillId/uninstall        鍗歌浇鎶€鑳藉寘
//   POST   /hermes/skills/:skillId/rate               璇勫垎 body: { rating }

import { httpClient } from './http-client'
import type {
  HermesInstance,
  CreateInstanceDto,
  CallLog,
  HermesSkill,
  InstalledSkill,
  SkillCategory,
  ExecuteTaskDto,
  PaginatedResult,
  PaginationQuery
} from '@/types/hermes'

/** 鍋ュ悍妫€鏌ョ粨鏋滐紙Hermes 鍩哄骇锛?*/
export interface HermesHealthResult {
  status: 'healthy' | 'unhealthy' | 'degraded'
  version?: string
  /** 杩愯涓疄渚嬫暟 */
  runningInstanceCount?: number
  latencyMs?: number
  message?: string
}

/** 鎶€鑳藉寘璇勫垎鍒楄〃椤?*/
export interface SkillRatingItem {
  id: number
  userId: number
  userName: string
  rating: number
  comment?: string
  createdAt: string
}

/** 鎶€鑳藉寘鏇存柊妫€鏌ョ粨鏋?*/
export interface SkillUpdateCheckResult {
  /** 鏄惁鏈夋柊鐗堟湰 */
  hasUpdate: boolean
  /** 鏈€鏂扮増鏈彿 */
  latestVersion?: string
  /** 褰撳墠鐗堟湰鍙?*/
  currentVersion?: string
  /** 鏇存柊璇存槑 */
  releaseNotes?: string
}

/** 鍒涘缓鎶€鑳藉寘 DTO锛坅dmin only锛?*/
export interface CreateSkillDto {
  name: string
  description: string
  author: string
  version: string
  category?: string
  pricePerMinute?: number
  config?: Record<string, unknown>
}

/**
 * 瀹炰緥鍒楄〃
 * GET /hermes/instances
 */
export async function listInstances(): Promise<HermesInstance[]> {
  return httpClient.get<HermesInstance[]>('/hermes/instances')
}

/**
 * 鍒涘缓瀹炰緥
 * POST /hermes/instances
 */
export async function createInstance(dto: CreateInstanceDto): Promise<HermesInstance> {
  return httpClient.post<HermesInstance>('/hermes/instances', dto)
}

/**
 * 瀹炰緥璇︽儏
 * GET /hermes/instances/:id
 */
export async function getInstance(id: number): Promise<HermesInstance> {
  return httpClient.get<HermesInstance>(`/hermes/instances/${id}`)
}

/**
 * 鍚姩瀹炰緥
 * POST /hermes/instances/:id/start
 */
export async function startInstance(id: number): Promise<HermesInstance> {
  return httpClient.post<HermesInstance>(`/hermes/instances/${id}/start`)
}

/**
 * 鍋滄瀹炰緥
 * POST /hermes/instances/:id/stop
 */
export async function stopInstance(id: number): Promise<HermesInstance> {
  return httpClient.post<HermesInstance>(`/hermes/instances/${id}/stop`)
}

/**
 * 鍒犻櫎瀹炰緥
 * DELETE /hermes/instances/:id
 */
export async function deleteInstance(id: number): Promise<void> {
  await httpClient.delete<void>(`/hermes/instances/${id}`)
}

/**
 * 浠诲姟鍘嗗彶
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
 * 鎵ц浠诲姟
 * POST /hermes/instances/:id/execute
 */
export async function executeTask(
  instanceId: number,
  dto: ExecuteTaskDto
): Promise<CallLog> {
  return httpClient.post<CallLog>(
    `/hermes/instances/${instanceId}/execute`,
    dto
  )
}

/**
 * 鍗歌浇鎶€鑳藉寘锛堜粠瀹炰緥鍗歌浇锛? * POST /hermes/instances/:id/skills/:skillId/unmount
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
 * 鎸傝浇鎶€鑳藉寘锛堝埌瀹炰緥锛? * POST /hermes/instances/:id/skills/:skillId/mount
 */
export async function mountSkill(
  instanceId: number,
  skillId: number
): Promise<HermesInstance> {
  return httpClient.post<HermesInstance>(
    `/hermes/instances/${instanceId}/skills/${skillId}/mount`
  )
}

/**
 * 鎶€鑳藉寘甯傚満
 * GET /hermes/skills/market
 */
export async function listSkillMarket(): Promise<HermesSkill[]> {
  return httpClient.get<HermesSkill[]>('/hermes/skills/market')
}

/**
 * 宸插畨瑁呮妧鑳藉寘
 * GET /hermes/skills/installed
 */
export async function listInstalledSkills(): Promise<InstalledSkill[]> {
  return httpClient.get<InstalledSkill[]>('/hermes/skills/installed')
}

/**
 * 鎶€鑳藉寘鍒嗙被
 * GET /hermes/skills/categories
 */
export async function listSkillCategories(): Promise<SkillCategory[]> {
  return httpClient.get<SkillCategory[]>('/hermes/skills/categories')
}

/**
 * 瀹夎鎶€鑳藉寘
 * POST /hermes/skills/:skillId/install
 */
export async function installSkill(skillId: number): Promise<HermesSkill> {
  return httpClient.post<HermesSkill>(`/hermes/skills/${skillId}/install`)
}

/**
 * 鍗歌浇鎶€鑳藉寘锛堜粠鏈湴绉婚櫎锛? * DELETE /hermes/skills/:skillId/uninstall
 */
export async function uninstallSkill(skillId: number): Promise<void> {
  await httpClient.delete<void>(`/hermes/skills/${skillId}/uninstall`)
}

/**
 * 鎶€鑳藉寘璇勫垎
 * POST /hermes/skills/:skillId/rate
 */
export async function rateSkill(
  skillId: number,
  rating: number
): Promise<HermesSkill> {
  return httpClient.post<HermesSkill>(`/hermes/skills/${skillId}/rate`, {
    rating
  })
}

/**
 * 鍋ュ悍妫€鏌? * GET /hermes/health
 */
export async function getHealth(): Promise<HermesHealthResult> {
  return httpClient.get<HermesHealthResult>('/hermes/health')
}

/**
 * 鎶€鑳藉寘璇勫垎鍒楄〃
 * GET /hermes/skills/:skillId/ratings
 */
export async function getSkillRatings(
  skillId: number
): Promise<SkillRatingItem[]> {
  return httpClient.get<SkillRatingItem[]>(`/hermes/skills/${skillId}/ratings`)
}

/**
 * 鎶€鑳藉寘鏇存柊妫€鏌? * GET /hermes/skills/:skillId/update-check
 */
export async function checkSkillUpdate(
  skillId: number
): Promise<SkillUpdateCheckResult> {
  return httpClient.get<SkillUpdateCheckResult>(
    `/hermes/skills/${skillId}/update-check`
  )
}

/**
 * 鍒涘缓鎶€鑳藉寘锛坅dmin only锛? * POST /hermes/skills
 */
export async function createSkill(dto: CreateSkillDto): Promise<HermesSkill> {
  return httpClient.post<HermesSkill>('/hermes/skills', dto)
}

export default {
  getHealth,
  listInstances,
  createInstance,
  getInstance,
  startInstance,
  stopInstance,
  deleteInstance,
  getCallLogs,
  executeTask,
  mountSkill,
  unmountSkill,
  listSkillMarket,
  listInstalledSkills,
  listSkillCategories,
  installSkill,
  uninstallSkill,
  rateSkill,
  getSkillRatings,
  checkSkillUpdate,
  createSkill
}
