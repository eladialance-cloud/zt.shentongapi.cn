// 内容市场 API
//
// 端点契约（HTTP，走 httpClient 自动带 JWT）：
//   POST /market/purchase               购买官方内容（扣积分，幂等）
//   GET  /market/purchased              已购清单
//   GET  /market/items/:type/:id/download  下载安装包（已购或免费）
//
// 本地安装（IPC，走 window.electronAPI.market）：
//   market:install / market:uninstall / market:list / market:export / market:import

import { httpClient } from './http-client'
import type {
  MarketItemType,
  InstalledRecord,
  MarketItemDetail,
  MarketDownloadResult,
} from '@/types/market'
import type { UserSkillSource } from '@/types/skill-source'
import type { PurchasedItem } from '@/types/market'

/** electronAPI.market 是否可用（preload 未注入时降级抛错） */
function getMarket() {
  const market = window.electronAPI?.market
  if (!market) {
    throw new Error('electronAPI.market 不可用（preload 未注入）')
  }
  return market
}

/** 购买官方内容（幂等） */
export async function purchase(type: MarketItemType, itemId: number): Promise<PurchasedItem> {
  return httpClient.post<PurchasedItem>('/market/purchase', { type, itemId })
}

/** 已购清单 */
export async function listPurchased(): Promise<PurchasedItem[]> {
  return httpClient.get<PurchasedItem[]>('/market/purchased')
}

/** 获取安装包（已购或免费） */
export async function getDownloadPackage(
  type: MarketItemType,
  itemId: number,
): Promise<MarketDownloadResult> {
  return httpClient.get<MarketDownloadResult>(`/market/items/${type}/${itemId}/download`)
}

/** 一键安装：购买（免费则直接返回）→ 下载安装包 → 本地写入 */
export async function install(
  type: MarketItemType,
  itemId: number,
): Promise<{ ok: boolean; dir?: string; error?: string }> {
  await purchase(type, itemId)
  const pkg = await getDownloadPackage(type, itemId)
  const result = await getMarket().install(
    pkg.type,
    pkg.id,
    pkg.name,
    pkg.version,
    pkg.pkg as Record<string, unknown>,
  )
  return result as { ok: boolean; dir?: string; error?: string }
}

/** 安装 MCP（官方目录）：免费购买 → 下载配置包 → 本地登记 → 返回 mcpServerId */
export async function installMcp(itemId: number): Promise<{ ok: boolean; mcpServerId?: number; dir?: string; error?: string }> {
  await purchase('mcp', itemId)
  const pkg = await getDownloadPackage('mcp', itemId)
  const result = await getMarket().install(pkg.type, pkg.id, pkg.name, pkg.version, pkg.pkg as Record<string, unknown>)
  if (!result.ok) return { ok: false, error: result.error }
  return { ok: true, mcpServerId: (pkg as unknown as { mcpServerId?: number }).mcpServerId, dir: result.dir }
}
/** 卸载本地内容 */
export async function uninstall(
  type: MarketItemType,
  itemId: number | string,
): Promise<{ ok: boolean; error?: string }> {
  return (await getMarket().uninstall(type, itemId)) as { ok: boolean; error?: string }
}

/** 本地已安装清单 */
export async function listInstalled(): Promise<InstalledRecord[]> {
  return (await getMarket().list()) as InstalledRecord[]
}

/** 导出个人内容 */
export async function exportMarket(): Promise<{ ok: boolean; path?: string; error?: string }> {
  return (await getMarket().export()) as { ok: boolean; path?: string; error?: string }
}

/** 读取本地内容详情(我的详情页) */
export async function getDetail(
  type: MarketItemType,
  itemId: number | string,
): Promise<MarketItemDetail> {
  const res = await getMarket().detail(type, itemId)
  if (!res.ok || !res.detail) {
    throw new Error(res.error || '读取本地详情失败')
  }
  return res.detail
}

/** 自定义导入(选择本地目录/文件,由主进程弹窗) */
export async function importDir(
  type: MarketItemType,
): Promise<{ ok: boolean; record?: InstalledRecord; error?: string }> {
  return (await getMarket().importDir(type)) as { ok: boolean; record?: InstalledRecord; error?: string }
}

/** 登记对话安装内容(source=chat) */
export async function register(
  type: MarketItemType,
  itemId: number | string,
  name: string,
  version: string,
  dir: string,
): Promise<{ ok: boolean; error?: string }> {
  return (await getMarket().register(type, itemId, name, version, dir)) as { ok: boolean; error?: string }
}

/** 更新本地内容(官方新版) */
export async function update(
  type: MarketItemType,
  itemId: number,
  name: string,
  version: string,
  pkg: Record<string, unknown>,
): Promise<{ ok: boolean; dir?: string; error?: string }> {
  return (await getMarket().update(type, itemId, name, version, pkg)) as { ok: boolean; dir?: string; error?: string }
}

/** 扫描本地运行时目录,补登记对话安装内容 */
export async function syncChat(): Promise<{ ok: boolean; added?: number; error?: string }> {
  return (await getMarket().syncChat()) as { ok: boolean; added?: number; error?: string }
}

/** 导入个人内容 */
export async function importMarket(): Promise<{ ok: boolean; imported?: number; error?: string }> {
  return (await getMarket().import()) as { ok: boolean; imported?: number; error?: string }
}

/** 开源技能库（技能源清单）：分页 + 中文分类 + 关键词 */
export async function listSkillSources(query: {
  page?: number
  pageSize?: number
  category?: string
  keyword?: string
} = {}): Promise<{ list: UserSkillSource[]; total: number; page: number; pageSize: number; totalPages: number }> {
  return httpClient.get('/skill-sources', { params: query })
}

/** 开源技能库分类 */
export async function listSkillSourceCategories(): Promise<Array<{ category: string; count: number }>> {
  return httpClient.get('/skill-sources/categories')
}

/** GitHub 直连下载安装开源技能（主进程下载+解压+登记） */
export async function installGithubSkill(
  sourceId: number,
  name: string,
  candidates: Array<{ owner: string; repo: string; defaultBranch?: string }>,
): Promise<{ ok: boolean; dir?: string; error?: string }> {
  return (await getMarket().installGithubSkill(sourceId, name, candidates)) as { ok: boolean; dir?: string; error?: string }
}

export default {
  purchase,
  listPurchased,
  getDownloadPackage,
  install,
  installMcp,
  uninstall,
  listInstalled,
  getDetail,
  importDir,
  register,
  update,
  syncChat,
  exportMarket,
  importMarket,
  listSkillSources,
  listSkillSourceCategories,
  installGithubSkill,
}
