/**
 * 官署「编制」持久化测试（edict-roster）
 *
 * 背景：一键组队选的套餐原先只存在内存，退出即丢失，导致启动引导只能无脑补全全集。
 * 这里锁定落盘/读取/回退行为，避免再退化成「选了没意义」。
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  ALL_EDICT_OFFICIALS,
  getRosterPath,
  isInRoster,
  normalizeOfficials,
  readRoster,
  resolveRoster,
  writeRoster,
} from '../../electron/main/edict-roster'
import { TEAM_PRESETS } from '../../electron/main/team-preset'

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'edict-roster-'))
}

describe('edict-roster', () => {
  it('全集与套餐口径一致（轻量版 5 个，旗舰版 12 个）', () => {
    expect(ALL_EDICT_OFFICIALS.length).toBe(12)
    expect(TEAM_PRESETS.starter.officials.length).toBe(5)
    expect(TEAM_PRESETS.flagship.officials.length).toBe(12)
    for (const id of TEAM_PRESETS.flagship.officials) {
      expect(ALL_EDICT_OFFICIALS).toContain(id)
    }
  })

  it('normalizeOfficials：去重、丢弃未知 id、按全集顺序排列', () => {
    expect(normalizeOfficials(['gongbu', 'taizi', 'gongbu', 'nope'])).toEqual(['taizi', 'gongbu'])
  })

  it('写读往返：编制与套餐 id 都能取回', () => {
    const dir = tmpDir()
    writeRoster(dir, 'starter', TEAM_PRESETS.starter.officials)
    const got = readRoster(dir)
    expect(got?.presetId).toBe('starter')
    expect(got?.officials).toEqual(['taizi', 'zhongshu', 'shangshu', 'bingbu', 'gongbu'])
    expect(got?.updatedAt).toBeTruthy()
  })

  it('原子写：不残留 .tmp 文件', () => {
    const dir = tmpDir()
    writeRoster(dir, 'standard', TEAM_PRESETS.standard.officials)
    expect(fs.existsSync(getRosterPath(dir))).toBe(true)
    expect(fs.existsSync(getRosterPath(dir) + '.tmp')).toBe(false)
  })

  it('文件缺失 / 损坏 / 编制为空 ⇒ 一律 null', () => {
    const dir = tmpDir()
    expect(readRoster(dir)).toBeNull()
    fs.writeFileSync(getRosterPath(dir), '{ not json', 'utf-8')
    expect(readRoster(dir)).toBeNull()
    fs.writeFileSync(getRosterPath(dir), JSON.stringify({ presetId: 'starter', officials: [] }), 'utf-8')
    expect(readRoster(dir)).toBeNull()
    fs.writeFileSync(getRosterPath(dir), JSON.stringify({ officials: ['bogus'] }), 'utf-8')
    expect(readRoster(dir)).toBeNull()
  })

  it('resolveRoster：无记录回退全集（兼容老用户），有记录按记录', () => {
    const dir = tmpDir()
    expect(resolveRoster(dir)).toEqual([...ALL_EDICT_OFFICIALS])
    writeRoster(dir, 'starter', TEAM_PRESETS.starter.officials)
    expect(resolveRoster(dir)).toEqual(['taizi', 'zhongshu', 'shangshu', 'bingbu', 'gongbu'])
  })

  it('isInRoster：未提供编制视为全部在编', () => {
    expect(isInRoster('hubu', undefined)).toBe(true)
    expect(isInRoster('hubu', [])).toBe(true)
    expect(isInRoster('hubu', ['gongbu'])).toBe(false)
    expect(isInRoster('gongbu', ['gongbu'])).toBe(true)
  })
})