/**
 * 一键组队流水线测试
 */
import {
  TEAM_PRESETS,
  getPreset,
  computePlan,
  runTeamCreation,
  type TeamPresetDeps,
  type TeamProgress,
} from '../../electron/main/team-preset'
import { exprToRunTime, exprToWeekday, listInstalledOfficials, writeOfficialSoul, syncOfficialSouls, DEFAULT_CRONS } from '../../electron/main/team-ipc'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

function makeDeps(over: Partial<TeamPresetDeps> = {}): TeamPresetDeps & { progress: TeamProgress[] } {
  const progress: TeamProgress[] = []
  const deps: TeamPresetDeps & { progress: TeamProgress[] } = {
    progress,
    listInstalled: async () => [],
    initBitable: async () => ({ ok: true }),
    writeSoul: async () => ({ ok: true }),
    ensureAgent: async () => ({ ok: true }),
    createCron: async () => ({ ok: true, created: 1 }),
    removeOfficial: async () => ({ ok: true }),
    onProgress: (p) => progress.push(p),
    ...over,
  }
  return deps
}

describe('team-preset', () => {
  it('套餐定义齐全且官署都在合法编制内', () => {
    expect(Object.keys(TEAM_PRESETS).sort()).toEqual(['flagship', 'standard', 'starter'])
    expect(TEAM_PRESETS.flagship.officials.length).toBe(12)
    expect(TEAM_PRESETS.starter.officials.length).toBe(5)
    expect(TEAM_PRESETS.standard.recommended).toBe(true)
  })

  it('getPreset 未知套餐返回 null', () => {
    expect(getPreset('nope')).toBeNull()
    expect(getPreset('flagship')?.name).toBe('旗舰版')
  })

  it('computePlan 算增量：待建/待删/是否首次', () => {
    const p1 = computePlan(['a', 'b', 'c'], [])
    expect(p1).toEqual({ toCreate: ['a', 'b', 'c'], toRemove: [], isFirstRun: true })
    const p2 = computePlan(['a', 'b'], ['b', 'c'])
    expect(p2).toEqual({ toCreate: ['a'], toRemove: ['c'], isFirstRun: false })
  })

  it('首次创建：跑完全部步骤，创建全部官署与定时任务', async () => {
    const deps = makeDeps({ listInstalled: async () => [] })
    const r = await runTeamCreation('starter', deps)
    expect(r.ok).toBe(true)
    expect(r.created).toEqual(TEAM_PRESETS.starter.officials)
    expect(r.removed).toEqual([])
    expect(deps.progress.some((p) => p.step === 'done')).toBe(true)
  })

  it('换套餐：新增差集官署并移除套餐外官署', async () => {
    // 已装 flagship 全部 → 换成 starter（5 个），应移除 7 个、新增 0 个
    const deps = makeDeps({ listInstalled: async () => [...TEAM_PRESETS.flagship.officials] })
    const r = await runTeamCreation('starter', deps)
    expect(r.created).toEqual([])
    expect(r.removed.length).toBe(7)
    expect(r.ok).toBe(true)
  })

  it('单步失败不中断：飞书建表失败仍继续写 SOUL 与定时任务', async () => {
    const deps = makeDeps({ initBitable: async () => ({ ok: false, error: '飞书凭证未配置' }) })
    const r = await runTeamCreation('starter', deps)
    expect(r.failed.some((f) => f.step === 'bitable')).toBe(true)
    expect(r.ok).toBe(true) // bitable 非 hard fail
    // SOUL / cron 仍执行
    expect(deps.progress.some((p) => p.step === 'cron')).toBe(true)
  })

  it('Agent 创建失败算硬失败（ok=false）', async () => {
    const deps = makeDeps({ ensureAgent: async () => ({ ok: false, error: 'Hermes 未安装' }) })
    const r = await runTeamCreation('starter', deps)
    expect(r.ok).toBe(false)
    expect(r.failed.some((f) => f.step === 'agent')).toBe(true)
  })

  it('未知套餐直接返回错误', async () => {
    const r = await runTeamCreation('nope' as never, makeDeps())
    expect(r.ok).toBe(false)
    expect(r.error).toContain('未知套餐')
  })
})

describe('team-ipc helpers', () => {
  it('exprToRunTime 解析 cron 的时:分', () => {
    expect(exprToRunTime('0 8 * * *')).toBe('08:00')
    expect(exprToRunTime('30 20 * * *')).toBe('20:30')
    expect(exprToRunTime('bad')).toBe('08:00')
  })

  it('exprToWeekday：非周任务 undefined，周日 0→7', () => {
    expect(exprToWeekday('0 8 * * *')).toBeUndefined()
    expect(exprToWeekday('0 8 * * 1')).toBe(1)
    expect(exprToWeekday('0 8 * * 0')).toBe(7)
  })

  it('listInstalledOfficials 只返回已存在的官署', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'team-ipc-'))
    fs.mkdirSync(path.join(home, 'profiles', 'taizi'), { recursive: true })
    fs.mkdirSync(path.join(home, 'profiles', 'gongbu'), { recursive: true })
    const got = listInstalledOfficials(home, ['taizi', 'zhongshu', 'gongbu'])
    expect(got.sort()).toEqual(['gongbu', 'taizi'])
  })

  it('writeOfficialSoul：蓝本 → 占位符替换（有链接则替换，无则保留并计入 missing）', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'team-soul-'))
    const profiles = path.join(root, 'profilesSrc')
    const data = path.join(root, 'edict-data')
    const home = path.join(root, 'hermes-home')
    fs.mkdirSync(profiles, { recursive: true })
    fs.mkdirSync(data, { recursive: true })
    fs.writeFileSync(
      path.join(profiles, 'gongbu.md'),
      '## 角色定位\n工部\n## 飞书表\n{{FEISHU_DOC:工部·内容生产表}}\n{{FEISHU_DOC:某某表}}',
      'utf8',
    )
    // 预置一张已回填链接的表
    fs.writeFileSync(
      path.join(data, 'official-tables.json'),
      JSON.stringify({
        gongbu: {
          agentId: 'gongbu',
          tables: [{ envKey: 'FEISHU_CONTENT_TABLE', name: '工部·内容生产表', access: 'rw', url: 'https://x/base/app?table=tbl1' }],
          updatedAt: new Date().toISOString(),
        },
      }),
      'utf8',
    )
    const r = writeOfficialSoul(profiles, data, home, 'gongbu')
    expect(r.ok).toBe(true)
    expect(r.replaced).toBe(1)
    expect(r.missing).toContain('某某表')
    const written = fs.readFileSync(path.join(home, 'profiles', 'gongbu', 'SOUL.md'), 'utf8')
    expect(written).toContain('https://x/base/app?table=tbl1')
    expect(written).toContain('{{FEISHU_DOC:某某表}}')
  })

  it('writeOfficialSoul 拒绝非法官署 id（防路径穿越）', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'team-soul2-'))
    const r = writeOfficialSoul(root, root, root, '../../etc/passwd')
    expect(r.ok).toBe(false)
  })

  it('syncOfficialSouls 批量回填：无链接的占位符保留并计入 missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'team-sync-'))
    const profiles = path.join(root, 'profiles')
    const data = path.join(root, 'data')
    const home = path.join(root, 'home')
    fs.mkdirSync(profiles, { recursive: true })
    fs.mkdirSync(data, { recursive: true })
    fs.writeFileSync(
      path.join(profiles, 'libu.md'),
      '## 定位\n礼部\n{{FEISHU_DOC:礼部·数据情报表}}\n{{FEISHU_DOC:军机处·任务主表（共享）}}',
      'utf8',
    )
    // 仅回填礼部自己的表，共享表未建
    fs.writeFileSync(
      path.join(data, 'official-tables.json'),
      JSON.stringify({
        libu: {
          agentId: 'libu',
          tables: [
            { envKey: 'FEISHU_INTEL_TABLE', name: '礼部·数据情报表', access: 'rw', url: 'https://x/base/app?table=libu1' },
            { envKey: 'FEISHU_TASK_MAIN_TABLE', name: '军机处·任务主表（共享）', access: 'rw', url: null },
          ],
          updatedAt: new Date().toISOString(),
        },
      }),
      'utf8',
    )
    const r = syncOfficialSouls({ edictProfilesDir: profiles, edictDataRoot: data, hermesHome: home }, ['libu'])
    expect(r.synced).toBe(1)
    expect(r.totalReplaced).toBe(1)
    expect(r.items[0].missing).toContain('军机处·任务主表（共享）')
    const written = fs.readFileSync(path.join(home, 'profiles', 'libu', 'SOUL.md'), 'utf8')
    expect(written).toContain('https://x/base/app?table=libu1')
    expect(written).toContain('{{FEISHU_DOC:军机处·任务主表（共享）}}')
  })

  it('syncOfficialSouls 缺蓝本时该项失败但不抛异常', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'team-sync2-'))
    const r = syncOfficialSouls(
      { edictProfilesDir: path.join(root, 'none'), edictDataRoot: root, hermesHome: root },
      ['bingbu'],
    )
    expect(r.ok).toBe(false)
    expect(r.synced).toBe(0)
    expect(r.items[0].ok).toBe(false)
  })

  it('DEFAULT_CRONS 覆盖全部官署，且高风险动作只走 flow 不自动群发', () => {
    for (const id of Object.keys(DEFAULT_CRONS)) {
      expect(Array.isArray(DEFAULT_CRONS[id])).toBe(true)
    }
    // 兵部/工部用 flow 直跑脚本（确定型）
    expect(DEFAULT_CRONS.bingbu[0].executeKind).toBe('flow')
    expect(DEFAULT_CRONS.gongbu[0].executeKind).toBe('flow')
  })
})
