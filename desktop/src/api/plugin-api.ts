// 插件模块 API
//
// 端点契约：
//   GET    /plugins/market                插件市场列表（支持 category / keyword）
//   POST   /plugins/:id/install           安装插件
//   DELETE /plugins/:id                   卸载插件
//   GET    /plugins/installed             已安装插件列表
//   POST   /plugins/:id/enable            启用插件
//   POST   /plugins/:id/disable           禁用插件
//   PATCH  /plugins/:id/config            更新插件配置
//   GET    /plugins/logs                  调用记录列表（分页）

import { httpClient } from './http-client'
import type {
  Plugin,
  PluginCallLog,
  PluginMarketQuery,
  PluginLogQuery,
  PaginatedResult
} from '@/types/plugin'

/**
 * 插件市场列表
 * GET /plugins/market?category=&keyword=
 */
export async function listMarketPlugins(
  query: PluginMarketQuery = {}
): Promise<PaginatedResult<Plugin>> {
  return httpClient.get<PaginatedResult<Plugin>>('/plugins/market', {
    params: query
  })
}

/**
 * 安装插件
 * POST /plugins/:id/install
 */
export async function installPlugin(id: number): Promise<void> {
  await httpClient.post<void>(`/plugins/${id}/install`)
}

/**
 * 卸载插件
 * DELETE /plugins/:id
 */
export async function uninstallPlugin(id: number): Promise<void> {
  await httpClient.delete<void>(`/plugins/${id}`)
}

/**
 * 已安装插件列表
 * GET /plugins/installed
 */
export async function listInstalledPlugins(): Promise<Plugin[]> {
  return httpClient.get<Plugin[]>('/plugins/installed')
}

/**
 * 启用插件
 * POST /plugins/:id/enable
 */
export async function enablePlugin(id: number): Promise<void> {
  await httpClient.post<void>(`/plugins/${id}/enable`)
}

/**
 * 禁用插件
 * POST /plugins/:id/disable
 */
export async function disablePlugin(id: number): Promise<void> {
  await httpClient.post<void>(`/plugins/${id}/disable`)
}

/**
 * 更新插件配置
 * PATCH /plugins/:id/config
 */
export async function updatePluginConfig(
  id: number,
  config: Record<string, unknown>
): Promise<void> {
  await httpClient.patch<void>(`/plugins/${id}/config`, { config })
}

/**
 * 插件调用日志
 * GET /plugins/logs?page=
 */
export async function getPluginLogs(
  query: PluginLogQuery = {}
): Promise<PaginatedResult<PluginCallLog>> {
  return httpClient.get<PaginatedResult<PluginCallLog>>('/plugins/logs', {
    params: query
  })
}

export default {
  listMarketPlugins,
  installPlugin,
  uninstallPlugin,
  listInstalledPlugins,
  enablePlugin,
  disablePlugin,
  updatePluginConfig,
  getPluginLogs
}
