/**
 * 编制（官署套餐）对派发的影响测试
 *
 * 关键约束：
 *  - 轻量版编制里没有户部，兜底派发必须顺延到编制内部门（工部），否则会派给不存在的 profile
 *  - 全集编制下行为与改动前完全一致（兜底仍是户部、提示词文案不变）
 */
import {
  buildNodePrompt,
  edictOfficials,
  resolveExecuteDept,
  rosterDepts,
  type EdictDeps,
} from '../../electron/main/edict-orchestrator'
import type { EdictTask } from '../../electron/shared/edict-types'

const STARTER = ['taizi', 'zhongshu', 'shangshu', 'bingbu', 'gongbu']
const FULL = [
  'taizi', 'zhongshu', 'menxia', 'shangshu', 'libu', 'hubu',
  'libu_hr', 'bingbu', 'xingbu', 'gongbu', 'zaochao', 'qintianjian',
]

function task(over: Partial<EdictTask> = {}): EdictTask {
  return { id: 'JJC-20260913-001', title: '测试旨意', state: 'Assigned', ...over } as unknown as EdictTask
}

function deps(roster?: string[]): EdictDeps {
  return {
    spawnKanban: async () => ({ code: 0, stdout: '', stderr: '' }),
    runHermes: async () => '',
    readBoard: () => [],
    writeBoard: (t) => t,
    now: () => 0,
    ...(roster ? { getRoster: () => roster } : {}),
  }
}

describe('rosterDepts', () => {
  it('未提供编制 ⇒ 全部六部', () => {
    expect(rosterDepts(undefined)).toEqual(['工部', '兵部', '户部', '礼部', '刑部', '吏部'])
    expect(rosterDepts([])).toHaveLength(6)
  })

  it('按编制过滤（轻量版只剩工部/兵部）', () => {
    expect(rosterDepts(STARTER)).toEqual(['工部', '兵部'])
  })
})

describe('resolveExecuteDept 只在编制内路由', () => {
  it('全集编制：兜底仍是户部（与改动前一致）', () => {
    expect(resolveExecuteDept('', task(), FULL)).toEqual({ dept: '户部', source: 'fallback' })
  })

  it('轻量版编制：兜底顺延到工部（户部不在编制内）', () => {
    expect(resolveExecuteDept('', task(), STARTER)).toEqual({ dept: '工部', source: 'fallback' })
  })

  it('轻量版编制：尚书省提到户部也不再派给户部', () => {
    expect(resolveExecuteDept('建议由户部负责数据统计', task(), STARTER)).toEqual({ dept: '工部', source: 'fallback' })
    expect(resolveExecuteDept('建议由兵部负责', task(), STARTER)).toEqual({ dept: '兵部', source: 'shangshu' })
  })

  it('轻量版编制：下旨指定户部也被拒绝（避免派给没有 profile 的官署）', () => {
    const r = resolveExecuteDept('', task({ assigneeOrg: '户部' }), STARTER)
    expect(r.dept).not.toBe('户部')
    expect(r.source).toBe('fallback')
  })

  it('全集编制：下旨指定户部照旧生效', () => {
    expect(resolveExecuteDept('', task({ assigneeOrg: '户部' }), FULL)).toEqual({ dept: '户部', source: 'issue' })
  })
})

describe('buildNodePrompt 尚书省候选部门按编制生成', () => {
  it('全集编制：提示词与旧文案一致', () => {
    const p = buildNodePrompt('Assigned', task(), undefined, undefined, FULL)
    expect(p).toContain('工部-工程/兵部-基建安全/户部-数据分析/礼部-文档UI/刑部-审查测试/吏部-人事')
  })

  it('轻量版编制：只给编制内部门', () => {
    const p = buildNodePrompt('Assigned', task(), undefined, undefined, STARTER)
    expect(p).toContain('工部-工程/兵部-基建安全')
    expect(p).not.toContain('户部-数据分析')
    expect(p).not.toContain('刑部-审查测试')
  })
})

describe('edictOfficials 标注是否在编', () => {
  it('按编制打 inRoster 标记', () => {
    const offs = edictOfficials(deps(STARTER))
    expect(offs.find((o) => o.id === 'gongbu')?.inRoster).toBe(true)
    expect(offs.find((o) => o.id === 'hubu')?.inRoster).toBe(false)
  })

  it('未提供编制 ⇒ 全部在编（兼容旧行为）', () => {
    const offs = edictOfficials(deps())
    expect(offs.every((o) => o.inRoster === true)).toBe(true)
  })
})