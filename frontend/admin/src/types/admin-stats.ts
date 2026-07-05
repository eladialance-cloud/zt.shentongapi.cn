// 管理端数据统计运营模块类型定义
// 数据合同真源：Task 26 - 数据统计运营

/** 统计粒度 */
export type StatsGranularity = 'day' | 'week' | 'month'

/** 趋势分析指标 */
export type StatsMetric =
  | 'user_growth'
  | 'call_count'
  | 'revenue'
  | 'consumption'

/** 排行榜类型 */
export type RankingType =
  | 'agent'
  | 'workflow'
  | 'plugin'
  | 'model'

/** 数据大盘 */
export interface StatsOverview {
  /** DAU */
  dau: number
  /** 新增用户 */
  newUsers: number
  /** 总用户 */
  totalUsers: number
  /** 调用量 */
  callCount: number
  /** 总收入(元) */
  totalRevenue: number
  /** 总消费(积分) */
  totalConsumption: number
  /** 平均客单价(元) */
  avgOrderValue: number
  /** 在线用户数 */
  onlineUsers: number
  /** 近 7 天调用量趋势 */
  callTrend7d: Array<{ date: string; value: number }>
  /** 近 7 天收入趋势 */
  revenueTrend7d: Array<{ date: string; value: number }>
  /** 模型消耗占比 */
  modelConsumption: Array<{ name: string; value: number }>
  /** 模块调用占比 */
  moduleCalls: Array<{ name: string; value: number }>
}

/** 数据大盘查询参数 */
export interface StatsOverviewQuery {
  date?: string
}

/** 趋势数据点 */
export interface TrendPoint {
  date: string
  value: number
}

/** 趋势分析结果 */
export interface StatsTrends {
  metric: StatsMetric
  granularity: StatsGranularity
  points: TrendPoint[]
}

/** 趋势查询参数 */
export interface StatsTrendsQuery {
  metric: StatsMetric
  granularity: StatsGranularity
  startDate?: string
  endDate?: string
}

/** 排行榜条目 */
export interface RankingItem {
  id: number
  name: string
  callCount: number
  /** 收入(积分) */
  revenue: number
  /** 平均评分 0-5 */
  avgRating: number
  /** 趋势变化百分比(正为上升) */
  trendPercent: number
}

/** 排行榜查询参数 */
export interface RankingQuery {
  type: RankingType
  /** 周期 day/week/month */
  period?: string
}

/** 留存分析 Cohort 行 */
export interface RetentionCohortRow {
  /** 注册日期(周起始日 ISO 8601) */
  cohortDate: string
  /** 该 cohort 用户数 */
  users: number
  /** Day+1 留存率 0-1 */
  day1: number
  /** Day+7 留存率 */
  day7: number
  /** Day+30 留存率 */
  day30: number
}

/** 留存分析结果 */
export interface StatsRetention {
  period: string
  cohorts: RetentionCohortRow[]
}

/** 留存查询参数 */
export interface RetentionQuery {
  period?: string
}

/** 实时数据 */
export interface StatsRealtime {
  /** 当前在线用户数 */
  onlineUsers: number
  /** 实时调用量(每秒) */
  callsPerSecond: number
  /** 时间戳 */
  timestamp: string
}
