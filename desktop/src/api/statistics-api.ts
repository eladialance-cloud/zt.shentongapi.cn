// 数据分析 API（Task 7：用户侧聚合接口，Bearer JWT）
//
// 端点契约:
//   GET /statistics/user-overview   用户侧数据分析总览（按当前登录用户聚合）
import { httpClient } from './http-client'

/** 30 天发布趋势点（date: YYYY-MM-DD，升序，缺 0 补零） */
export interface PublishTrendPoint {
  date: string
  count: number
}

/** 平台分布项（已发布计划的 targetPlatforms 平铺计数） */
export interface PlatformDistItem {
  platform: string
  count: number
}

/** 用户侧数据分析总览 */
export interface StatisticsOverview {
  /** 近 7 天已发布计划数（publishedAt 为空回退 createdAt） */
  weekPublished: number
  /** 近 7 天完成任务数（agent_task success + team_tasks completed，任务中心口径） */
  weekCompletedTasks: number
  /** 素材总数（media_assets 按 userId 计数） */
  assetCount: number
  /** 待审核发布计划数 */
  pendingReview: number
  /** 近 30 天每日已发布数 */
  publishTrend30d: PublishTrendPoint[]
  /** 已发布计划平台分布 */
  platformDist: PlatformDistItem[]
}

/** 数据分析总览 GET /statistics/user-overview */
export function getStatisticsOverview(): Promise<StatisticsOverview> {
  return httpClient.get<StatisticsOverview>('/statistics/user-overview')
}

export default {
  getStatisticsOverview,
}
