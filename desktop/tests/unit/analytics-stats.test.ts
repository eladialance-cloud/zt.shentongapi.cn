// 数据分析页纯函数单测（Task 7）
// 覆盖：platformName 平台中文名映射、toTrendBars 高度百分比与最小可见高度、
//       buildWeeklyReport 周报行、weeklyInsight 一句话洞察优先级
import {
  buildWeeklyReport,
  platformName,
  PLATFORM_COLORS,
  toTrendBars,
  weeklyInsight,
} from '@/pages/Analytics/stats'
import type { StatisticsOverview } from '@/api/statistics-api'

function overview(overrides: Partial<StatisticsOverview> = {}): StatisticsOverview {
  return {
    weekPublished: 0,
    weekCompletedTasks: 0,
    assetCount: 0,
    pendingReview: 0,
    publishTrend30d: [],
    platformDist: [],
    ...overrides,
  }
}

describe('platformName 平台中文名', () => {
  it('内置平台映射中文名', () => {
    expect(platformName('douyin')).toBe('抖音')
    expect(platformName('xiaohongshu')).toBe('小红书')
    expect(platformName('weibo')).toBe('微博')
    expect(platformName('zhihu')).toBe('知乎')
    expect(platformName('bilibili')).toBe('B站')
    expect(platformName('wechat_mp')).toBe('公众号')
  })

  it('未知平台原样返回，颜色映射覆盖 6 平台', () => {
    expect(platformName('kuaishou')).toBe('kuaishou')
    expect(PLATFORM_COLORS.douyin).toBe('#161823')
    expect(Object.keys(PLATFORM_COLORS)).toHaveLength(6)
  })
})

describe('toTrendBars 趋势转柱状', () => {
  it('按最大值计算高度百分比并生成 hover 文本', () => {
    const bars = toTrendBars([
      { date: '2026-08-01', count: 2 },
      { date: '2026-08-02', count: 4 },
      { date: '2026-08-03', count: 0 },
    ])
    expect(bars[0].heightPct).toBe(50)
    expect(bars[1].heightPct).toBe(100)
    expect(bars[2].heightPct).toBe(0)
    expect(bars[1].label).toBe('2026-08-02 · 4 篇')
  })

  it('全 0 时不除零，高度全为 0', () => {
    const bars = toTrendBars([
      { date: '2026-08-01', count: 0 },
      { date: '2026-08-02', count: 0 },
    ])
    expect(bars.every((b) => b.heightPct === 0)).toBe(true)
  })

  it('有数据时最小高度 4%，保证柱体可见', () => {
    const bars = toTrendBars([
      { date: '2026-08-01', count: 1 },
      { date: '2026-08-02', count: 100 },
    ])
    expect(bars[0].heightPct).toBeGreaterThanOrEqual(4)
    expect(bars[1].heightPct).toBe(100)
  })
})

describe('buildWeeklyReport 周报行', () => {
  it('近 7 天发布 / 完成任务 / 素材总数按序输出', () => {
    const rows = buildWeeklyReport(
      overview({ weekPublished: 3, weekCompletedTasks: 5, assetCount: 12 }),
    )
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['本周发布', 3],
      ['本周完成任务', 5],
      ['素材总数', 12],
    ])
  })
})

describe('weeklyInsight 一句话洞察', () => {
  it('优先级：发布 > 待审核 > 完成任务 > 空态', () => {
    expect(weeklyInsight(overview({ weekPublished: 2 }))).toContain('已发布 2 篇')
    expect(weeklyInsight(overview({ pendingReview: 1 }))).toContain('待审核')
    expect(weeklyInsight(overview({ weekCompletedTasks: 4 }))).toContain('完成')
    expect(weeklyInsight(overview())).toContain('需求对话')
  })
})
