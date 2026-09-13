/**
 * 远端技能安装「接线」验证（安全审计 S-42）。
 *
 * 判定逻辑本身在 tests/unit/policy-remote-artifact.test.ts；
 * 本文件验证 edict-extra.addRemoteSkill 是否真的把四道闸接上：
 *   1) 来源不合格 → 直接拒绝，不发请求、不弹确认；
 *   2) 确认缺失（非 GUI）或用户拒绝 → fail-closed 中止，不发请求；
 *   3) 下载后正文形态校验（体积 / 二进制 / 空）不通过 → 不落盘、不登记；
 *   4) 全部通过才写入 profiles/<官署>/skills 并登记 registry。
 */
import { describe, it, expect, jest, beforeEach, beforeAll } from '@jest/globals'
import * as os from 'node:os'
import * as fs from 'node:fs'
import * as path from 'node:path'

const TEST_ROOT = path.join(os.tmpdir(), 'st-edict-remote-skill-' + Date.now())

// 与 computer-control-mcp 同款 fail-closed 前提：非 GUI（app.isReady() === false）时默认确认必须拒绝
jest.mock('electron', () => ({
  app: { isReady: () => false },
  dialog: { showMessageBox: async () => ({ response: 0 }) },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => {}, removeHandler: () => {} },
}))

import { addRemoteSkill, type EdictExtraDeps } from '../../electron/main/edict-extra'
import type { EdictOp } from '../../electron/shared/edict-types'

const edictDataRoot = path.join(TEST_ROOT, 'edict-data')
const hermesHome = path.join(TEST_ROOT, 'hermes-home')
const SKILL_URL = 'https://raw.githubusercontent.com/openai/skills/main/SKILL.md'
const OK_BODY = '# 数据分析技能\n\n这是一段足够长的技能正文内容。'

function makeDeps(over: Partial<EdictExtraDeps> = {}): EdictExtraDeps {
  return {
    hermesHome,
    edictDataRoot,
    runtimeRoot: path.join(TEST_ROOT, 'runtime'),
    stApiBase: 'https://zt.shentongapi.cn',
    getAuthToken: () => '',
    ensureProfiles: async () => ({ ok: true, created: [] }),
    spawnKanban: async () => ({ code: 0, stdout: '', stderr: '' }),
    runHermes: async () => '',
    readBoard: () => [],
    writeBoard: (tasks) => tasks,
    now: () => Date.now(),
    ...over,
  }
}

/** 构造一个最小 Response 替身（headers.get 按小写键取值） */
function response(body: string, headers: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    text: async () => body,
  } as unknown as Response
}

/** EdictOp 是判别联合（ok:true 无 error），取错误信息需要先收窄 */
const errOf = (r: EdictOp): string => (r.ok ? '' : r.error)

const skillFile = (agentId: string, skillName: string) =>
  path.join(hermesHome, 'profiles', agentId, 'skills', skillName, 'SKILL.md')
const registryFile = () => path.join(edictDataRoot, 'data', 'remote_skills_registry.json')

function countingFetch(body: string) {
  const state = { calls: 0, textReads: 0 }
  const fetchImpl = (async () => {
    state.calls += 1
    return { ...response(body), text: async () => { state.textReads += 1; return body } } as unknown as Response
  }) as unknown as typeof fetch
  return { state, fetchImpl }
}

// jest/jsdom 环境缺少 AbortSignal.timeout（Electron 运行时自带），补 polyfill 避免 fetch 直接抛错
beforeAll(() => {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout !== 'function') {
    ;(AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout = (ms: number) => {
      const ctrl = new AbortController()
      setTimeout(() => ctrl.abort(), ms)
      return ctrl.signal
    }
  }
})

describe('addRemoteSkill 接线（S-42）', () => {
  beforeEach(() => {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true })
    fs.mkdirSync(TEST_ROOT, { recursive: true })
  })

  it('来源域名不在白名单：直接拒绝，不发请求也不弹确认', async () => {
    const { state, fetchImpl } = countingFetch(OK_BODY)
    let confirms = 0
    const r = await addRemoteSkill(
      makeDeps({ fetch: fetchImpl, confirmRemoteSkillInstall: async () => { confirms += 1; return true } }),
      'zhongshu', 'skill-a', 'https://evil.example.com/SKILL.md',
    )
    expect(r.ok).toBe(false)
    expect(errOf(r)).toContain('白名单')
    expect(state.calls).toBe(0)
    expect(confirms).toBe(0)
  })

  it('公网 http 来源被拒绝', async () => {
    const r = await addRemoteSkill(makeDeps(), 'zhongshu', 'skill-a', 'http://raw.githubusercontent.com/a/SKILL.md')
    expect(r.ok).toBe(false)
    expect(errOf(r)).toContain('https')
  })

  it('URL 携带账号密码被拒绝', async () => {
    const r = await addRemoteSkill(makeDeps(), 'zhongshu', 'skill-a', 'https://u:p@raw.githubusercontent.com/a/SKILL.md')
    expect(r.ok).toBe(false)
    expect(errOf(r)).toContain('账号密码')
  })

  it('扩展名不在白名单（.exe）被拒绝', async () => {
    const r = await addRemoteSkill(makeDeps(), 'zhongshu', 'skill-a', 'https://github.com/a/b/raw/main/x.exe')
    expect(r.ok).toBe(false)
    expect(errOf(r)).toContain('扩展名')
  })

  it('官署 ID 非法（路径穿越）被拒绝', async () => {
    const r = await addRemoteSkill(makeDeps(), '../evil', 'skill-a', SKILL_URL)
    expect(r.ok).toBe(false)
    expect(errOf(r)).toContain('非法')
  })

  it('未注入确认回调（非 GUI）：fail-closed 拒绝，不发请求', async () => {
    const { state, fetchImpl } = countingFetch(OK_BODY)
    const r = await addRemoteSkill(makeDeps({ fetch: fetchImpl }), 'zhongshu', 'skill-a', SKILL_URL)
    expect(r.ok).toBe(false)
    expect(errOf(r)).toContain('取消')
    expect(state.calls).toBe(0)
  })

  it('用户在确认弹窗拒绝：中止且不发请求', async () => {
    const { state, fetchImpl } = countingFetch(OK_BODY)
    const r = await addRemoteSkill(
      makeDeps({ fetch: fetchImpl, confirmRemoteSkillInstall: async () => false }),
      'zhongshu', 'skill-a', SKILL_URL,
    )
    expect(r.ok).toBe(false)
    expect(errOf(r)).toContain('取消')
    expect(state.calls).toBe(0)
    expect(fs.existsSync(path.dirname(skillFile('zhongshu', 'skill-a')))).toBe(false)
  })

  it('确认通过：下载并写入 profile skills，registry 记录归一到白名单 URL', async () => {
    const { fetchImpl } = countingFetch(OK_BODY)
    const r = await addRemoteSkill(
      makeDeps({ fetch: fetchImpl, confirmRemoteSkillInstall: async () => true }),
      'zhongshu', 'skill-a', SKILL_URL,
    )
    expect(r.ok).toBe(true)
    expect(fs.readFileSync(skillFile('zhongshu', 'skill-a'), 'utf-8')).toBe(OK_BODY)
    const reg = JSON.parse(fs.readFileSync(registryFile(), 'utf-8'))
    expect(reg).toHaveLength(1)
    expect(reg[0].sourceUrl).toBe(SKILL_URL)
    expect(reg[0].agentId).toBe('zhongshu')
  })

  it('Content-Length 超限：提前拒绝，不读取正文、不落盘', async () => {
    let textReads = 0
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      headers: { get: () => String(300 * 1024) },
      text: async () => { textReads += 1; return OK_BODY },
    })) as unknown as typeof fetch
    const r = await addRemoteSkill(
      makeDeps({ fetch: fetchImpl, confirmRemoteSkillInstall: async () => true }),
      'zhongshu', 'skill-a', SKILL_URL,
    )
    expect(r.ok).toBe(false)
    expect(errOf(r)).toContain('体积上限')
    expect(textReads).toBe(0)
    expect(fs.existsSync(path.dirname(skillFile('zhongshu', 'skill-a')))).toBe(false)
  })

  it('正文含 NUL 字节：按二进制拒绝且不落盘', async () => {
    const { fetchImpl } = countingFetch('SKILL-MD-内容' + String.fromCharCode(0) + '二进制尾部')
    const r = await addRemoteSkill(
      makeDeps({ fetch: fetchImpl, confirmRemoteSkillInstall: async () => true }),
      'zhongshu', 'skill-a', SKILL_URL,
    )
    expect(r.ok).toBe(false)
    expect(errOf(r)).toContain('文本')
    expect(fs.existsSync(path.dirname(skillFile('zhongshu', 'skill-a')))).toBe(false)
  })

  it('正文过短：保持原有「下载内容为空」拒绝语义', async () => {
    const { fetchImpl } = countingFetch('short')
    const r = await addRemoteSkill(
      makeDeps({ fetch: fetchImpl, confirmRemoteSkillInstall: async () => true }),
      'zhongshu', 'skill-a', SKILL_URL,
    )
    expect(r.ok).toBe(false)
    expect(errOf(r)).toContain('下载内容为空')
  })

  it('HTTP 非 200：拒绝且不落盘', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 404, headers: { get: () => null }, text: async () => '' })) as unknown as typeof fetch
    const r = await addRemoteSkill(
      makeDeps({ fetch: fetchImpl, confirmRemoteSkillInstall: async () => true }),
      'zhongshu', 'skill-a', SKILL_URL,
    )
    expect(r.ok).toBe(false)
    expect(errOf(r)).toContain('HTTP 404')
  })
})
