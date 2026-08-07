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
  MarketDownloadResult,
} from '@/types/market'
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

/** 卸载本地内容 */
export async function uninstall(
  type: MarketItemType,
  itemId: number,
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

/** 导入个人内容 */
export async function importMarket(): Promise<{ ok: boolean; imported?: number; error?: string }> {
  return (await getMarket().import()) as { ok: boolean; imported?: number; error?: string }
}

export default {
  purchase,
  listPurchased,
  getDownloadPackage,
  install,
  uninstall,
  listInstalled,
  exportMarket,
  importMarket,
}
