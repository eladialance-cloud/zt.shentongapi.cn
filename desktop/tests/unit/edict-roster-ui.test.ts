// 编制（一键组队套餐）在渲染层的过滤与回退行为
import type { EdictOfficial, EdictTask } from '@shared/edict-types'
import { OFFICIAL_META, buildOfficialCards, officialCount, OFFICIAL_IDS } from '@/pages/TaskCenter/edict-data'
import { DEPTS, deptsForRoster } from '@/pages/TaskCenter/panels-data'

const STARTER = ['taizi', 'zhongshu', 'shangshu', 'bingbu', 'gongbu']

function official(id: string, inRoster: boolean): EdictOfficial {
  return { id, label: id, status: 'idle', role: '', inRoster }
}

describe('officialCount（军机处角标）', () => {
  it('未提供编制 ⇒ 全集 12', () => {
    expect(officialCount(undefined)).toBe(12)
    expect(officialCount([])).toBe(12)
    expect(OFFICIAL_IDS).toHaveLength(12)
  })

  it('按编制计数（轻量版 5 个）', () => {
    expect(officialCount(STARTER)).toBe(5)
  })
})

describe('deptsForRoster（三省六部面板）', () => {
  it('未提供编制 ⇒ 与改动前一致（11 个）', () => {
    expect(deptsForRoster(undefined)).toBe(DEPTS)
    expect(deptsForRoster(undefined)).toHaveLength(11)
  })

  it('轻量版只留编制内官署', () => {
    expect(deptsForRoster(STARTER).map((d) => d.id)).toEqual(['taizi', 'zhongshu', 'shangshu', 'bingbu', 'gongbu'])
  })

  it('zaochao 叫司礼监，不再与钦天监重名', () => {
    const labels = DEPTS.map((d) => d.label)
    expect(DEPTS.find((d) => d.id === 'zaochao')?.label).toBe('司礼监')
    expect(labels.filter((l) => l === '钦天监')).toHaveLength(0)
  })
})

describe('buildOfficialCards 透传 inRoster', () => {
  const task = { id: 'JJC-1', org: '工部', state: 'Doing' } as unknown as EdictTask

  it('主进程标了 inRoster=false 的官署被标为编制外', () => {
    const officials = OFFICIAL_META.map((m) => official(m.id, STARTER.includes(m.id)))
    const cards = buildOfficialCards(officials, [task])
    expect(cards.find((c) => c.id === 'gongbu')?.inRoster).toBe(true)
    expect(cards.find((c) => c.id === 'hubu')?.inRoster).toBe(false)
  })

  it('缺省（旧主进程/加载中）视为在编，保持旧行为', () => {
    const officials = OFFICIAL_META.map((m) => official(m.id, true))
    const cards = buildOfficialCards(officials, [task])
    expect(cards.every((c) => c.inRoster)).toBe(true)
  })
})

describe('roster 模块加载与回退', () => {
  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI
    // jest.resetModules 在本地 @types 里没声明，运行时可用
    ;(jest as unknown as { resetModules: () => void }).resetModules()
  })

  it('没有 electronAPI ⇒ 回退全集', async () => {
    const mod = await import('@/pages/TaskCenter/roster')
    const st = await mod.ensureEdictRoster()
    expect(st.officials).toEqual([...mod.ALL_OFFICIAL_IDS])
    expect(st.isDefault).toBe(true)
    expect(mod.isInRoster('hubu')).toBe(true)
  })

  it('主进程给了编制 ⇒ 按编制，且 isInRoster 生效', async () => {
    ;(window as unknown as { electronAPI: unknown }).electronAPI = {
      team: {
        currentRoster: async () => ({
          ok: true,
          presetId: 'starter',
          officials: STARTER,
          installed: [...STARTER, 'menxia', 'libu'],
          isDefault: false,
        }),
      },
    }
    const mod = await import('@/pages/TaskCenter/roster')
    const st = await mod.ensureEdictRoster()
    expect(st.presetId).toBe('starter')
    expect(st.officials).toEqual(STARTER)
    expect(st.installed).toContain('menxia')
    expect(mod.isInRoster('gongbu')).toBe(true)
    expect(mod.isInRoster('hubu')).toBe(false)
  })
})
