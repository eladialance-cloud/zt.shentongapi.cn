// 搜索范围 API
//
// v0.3.1 Task 21 - TopBar 搜索范围动态化
//
// 端点契约（可选后端实现）：
//   GET /search/categories  返回 SearchCategory[]
//
// 说明：
// - 优先读 localStorage 缓存（24 小时 TTL）
// - 缓存未命中时尝试调用后端 API（若可用）
// - 后端不可用或失败时 fallback 到 DEFAULT_CATEGORIES
// - 拉取结果回写缓存
//
// 与 TopBar 的关系：替换原硬编码 SEARCH_CATEGORIES，加载状态由调用方管理

import { httpClient } from './http-client'

/** 搜索范围分类 */
export interface SearchCategory {
  /** 分类 key，唯一标识（agent / skill / knowledge / workflow） */
  key: string
  /** 显示名称（如「AI 员工」/「技能」/「知识库」/「工作流」） */
  label: string
  /** 可选图标名（供调用方映射 antd icon） */
  icon?: string
  /** 是否启用（false 时不在搜索范围展示） */
  enabled: boolean
  /** 跳转路由模板（如 '/agents/:id'），供调用方按结果类型路由 */
  routePath: string
}

/** 默认搜索范围分类（与原 SEARCH_CATEGORIES 等价） */
export const DEFAULT_CATEGORIES: SearchCategory[] = [
  { key: 'agent', label: 'AI员工', enabled: true, routePath: '/agents/:id' },
  { key: 'skill', label: '技能', enabled: true, routePath: '/skill-market' },
  { key: 'knowledge', label: '知识库', enabled: true, routePath: '/knowledge/search' },
  { key: 'workflow', label: '工作流', enabled: true, routePath: '/workflow/:id' }
]

/** localStorage 缓存 key */
const CACHE_KEY = 'search-categories-cache'

/** 缓存 TTL：24 小时 */
const CACHE_TTL = 24 * 60 * 60 * 1000

interface CachedPayload {
  data: SearchCategory[]
  ts: number
}

/** 读取 localStorage 缓存（命中且未过期返回数据，否则 null） */
function readCache(): SearchCategory[] | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(CACHE_KEY)
  if (!raw) return null
  try {
    const payload = JSON.parse(raw) as CachedPayload
    if (
      !payload ||
      !Array.isArray(payload.data) ||
      typeof payload.ts !== 'number'
    ) {
      return null
    }
    if (Date.now() - payload.ts >= CACHE_TTL) return null
    return payload.data
  } catch {
    return null
  }
}

/** 写入 localStorage 缓存 */
function writeCache(data: SearchCategory[]): void {
  if (typeof localStorage === 'undefined') return
  const payload: CachedPayload = { data, ts: Date.now() }
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload))
  } catch {
    // localStorage 写入失败（如配额不足）静默忽略
  }
}

/**
 * 获取搜索范围分类列表
 *
 * 优先级：
 * 1. localStorage 缓存命中且未过期 → 直接返回
 * 2. 调用后端 GET /search/categories（若可用）→ 写缓存后返回
 * 3. 上述失败 → 返回 DEFAULT_CATEGORIES（同时写缓存，避免后续频繁失败重试）
 */
export async function getSearchCategories(): Promise<SearchCategory[]> {
  // 1. 优先读缓存
  const cached = readCache()
  if (cached) return cached

  // 2. 尝试调用后端 API
  // 降级处理：/search/categories 端点可能因后端配置缺失返回 404（后端无对应控制器）
  // 失败时（含 404）fallback 到 DEFAULT_CATEGORIES，不阻塞搜索功能
  try {
    const data = await httpClient.get<SearchCategory[]>('/search/categories')
    const sanitized = Array.isArray(data)
      ? data.filter(
          (c) =>
            c &&
            typeof c.key === 'string' &&
            typeof c.label === 'string' &&
            typeof c.routePath === 'string'
        )
      : DEFAULT_CATEGORIES
    const result = sanitized.length > 0 ? sanitized : DEFAULT_CATEGORIES
    writeCache(result)
    return result
  } catch (e) {
    // 3. fallback 默认分类（写缓存避免频繁重试）
    // 404（端点未实现）/ 网络错误 / 5xx 均降级返回 DEFAULT_CATEGORIES
    // 不抛出异常，保证 TopBar 搜索范围始终可用
    void e // 显式忽略错误：降级为默认分类，不阻塞调用方
    writeCache(DEFAULT_CATEGORIES)
    return DEFAULT_CATEGORIES
  }
}

export default {
  getSearchCategories,
  DEFAULT_CATEGORIES
}
