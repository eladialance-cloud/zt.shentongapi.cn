// 管理端数据统计运营 API
//
// 端点契约：
//   GET    /admin/stats/overview                数据大盘
//   GET    /admin/stats/trends                  趋势分析
//   GET    /admin/stats/rankings                排行榜
//   GET    /admin/stats/retention               用户留存
//   GET    /admin/stats/realtime                实时数据(降级轮询)
//   ws     admin:stats:realtime                 实时数据 WebSocket 推送

import { adminRequest } from './admin-auth-api'
import type {
  RankingItem,
  RankingQuery,
  StatsOverview,
  StatsOverviewQuery,
  StatsRealtime,
  StatsRetention,
  StatsTrends,
  StatsTrendsQuery,
  RetentionQuery
} from '@/types/admin-stats'

/** 数据大盘 */
export async function getStatsOverview(
  query: StatsOverviewQuery = {}
): Promise<StatsOverview> {
  return adminRequest<StatsOverview>('get', '/admin/stats/overview', {
    params: query as Record<string, unknown>
  })
}

/** 趋势分析 */
export async function getStatsTrends(
  query: StatsTrendsQuery
): Promise<StatsTrends> {
  return adminRequest<StatsTrends>('get', '/admin/stats/trends', {
    params: query as unknown as Record<string, unknown>
  })
}

/** 排行榜 */
export async function getRankings(
  query: RankingQuery
): Promise<RankingItem[]> {
  return adminRequest<RankingItem[]>('get', '/admin/stats/rankings', {
    params: query as unknown as Record<string, unknown>
  })
}

/** 用户留存 */
export async function getStatsRetention(
  query: RetentionQuery = {}
): Promise<StatsRetention> {
  return adminRequest<StatsRetention>('get', '/admin/stats/retention', {
    params: query as Record<string, unknown>
  })
}

/** 实时数据(降级轮询) */
export async function getStatsRealtime(): Promise<StatsRealtime> {
  return adminRequest<StatsRealtime>('get', '/admin/stats/realtime')
}

export default {
  getStatsOverview,
  getStatsTrends,
  getRankings,
  getStatsRetention,
  getStatsRealtime
}
