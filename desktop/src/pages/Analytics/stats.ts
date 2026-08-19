// 数据分析页纯函数（可单测，不依赖 React/API）
// 与 TaskCenter/unified.ts 约定一致：纯函数独立成模块，组件只做渲染
import type { StatisticsOverview, PublishTrendPoint } from '@/api/statistics-api'

/** 平台中文名（与 Publish.tsx PLATFORM_META 一致） */
export const PLATFORM_LABELS: Record<string, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  weibo: '微博',
  zhihu: '知乎',
  bilibili: 'B站',
  wechat_mp: '公众号',
}

/** 平台品牌色（与 Publish.tsx PLATFORM_COLORS 一致） */
export const PLATFORM_COLORS: Record<string, string> = {
  douyin: '#161823',
  xiaohongshu: '#ff2442',
  weibo: '#ff5722',
  zhihu: '#0084ff',
  bilibili: '#fb7299',
  wechat_mp: '#07c160',
}

export function platformName(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform
}

/** 趋势柱：高度百分比（相对最大值）+ hover 文本 */
export interface TrendBar {
  date: string
  count: number
  heightPct: number
  label: string
}

/** 30 天趋势转柱状图数据：以最大值为 100%，有数据时最小 4% 保证柱体可见 */
export function toTrendBars(points: PublishTrendPoint[]): TrendBar[] {
  const max = Math.max(1, ...points.map((p) => p.count))
  return points.map((p) => ({
    date: p.date,
    count: p.count,
    heightPct: p.count === 0 ? 0 : Math.max(4, Math.round((p.count / max) * 100)),
    label: p.date + ' · ' + p.count + ' 篇',
  }))
}

/** 简易周报行 */
export interface WeeklyReportRow {
  key: string
  label: string
  value: number
  suffix: string
}

/** 简易周报：近 7 天发布 / 完成任务 / 素材总数（素材新增暂无独立字段，按已有 assetCount 呈现） */
export function buildWeeklyReport(overview: StatisticsOverview): WeeklyReportRow[] {
  return [
    { key: 'published', label: '本周发布', value: overview.weekPublished, suffix: '篇' },
    { key: 'tasks', label: '本周完成任务', value: overview.weekCompletedTasks, suffix: '个' },
    { key: 'assets', label: '素材总数', value: overview.assetCount, suffix: '个' },
  ]
}

/** 一句话洞察（0.7 需求：本周发布 X · 完成任务 Y · 待审核 Z + 一句话洞察） */
export function weeklyInsight(overview: StatisticsOverview): string {
  if (overview.weekPublished > 0) {
    return '本周已发布 ' + overview.weekPublished + ' 篇内容，保持输出节奏'
  }
  if (overview.pendingReview > 0) {
    return '有 ' + overview.pendingReview + ' 篇内容待审核，处理后可安排发布'
  }
  if (overview.weekCompletedTasks > 0) {
    return '本周完成了 ' + overview.weekCompletedTasks + ' 个任务，期待产出内容'
  }
  return '本周暂无发布与任务记录，去需求对话发起新任务吧'
}
