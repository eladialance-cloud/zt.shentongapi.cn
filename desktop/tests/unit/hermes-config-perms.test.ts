// Hermes 配置落盘纪律（安全审计 S-05 部分，按 spec D1 降级为「权限收敛」）
//
// 说明：config.yaml 里含 llm-proxy 静态 Key。Hermes 是编译产物，无法确认 config.yaml 是否支持
// 环境变量插值，所以本批次**不改 api_key 的生成方式**（改错会让 Agent 全面不可用），
// 只把文件权限收敛到 0600，并把「写盘必须带 mode」变成可测的契约。
//
// Windows 上文件权限语义有限（statSync 读不到 0600），所以主断言走 writeFileSync 的调用参数。
jest.mock('node:fs', () => {
  // 本项目 jest 全局类型未声明 requireActual，这里显式窄化（运行时存在）
  const actual = (jest as unknown as { requireActual: (m: string) => typeof import('node:fs') }).requireActual(
    'node:fs',
  )
  return {
    ...actual,
    writeFileSync: jest.fn(actual.writeFileSync),
    chmodSync: jest.fn(actual.chmodSync),
  }
})

import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensureHermesConfig,
  syncHermesConfig,
  syncHermesProfileConfigs,
} from '../../electron/main/hermes-config'

const mockedWrite = writeFileSync as unknown as jest.Mock
const mockedChmod = chmodSync as unknown as jest.Mock

const OPTS = {
  llmProxyBaseUrl: 'https://zt.shentongapi.cn/api/llm-proxy/v1',
  apiKey: 'sk-test-key-1234',
  llmModel: 'm1',
}

beforeEach(() => {
  mockedWrite.mockClear()
  mockedChmod.mockClear()
})

/** 取出对指定后缀文件的写入调用 */
function writeCallsFor(suffix: string): unknown[][] {
  return mockedWrite.mock.calls.filter((c) => typeof c[0] === 'string' && (c[0] as string).endsWith(suffix))
}

describe('hermes 配置落盘纪律', () => {
  it('新建 config.yaml 时以 0600 写入（S-05 部分）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hermes-perm-'))
    try {
      ensureHermesConfig(dir, OPTS)
      const calls = writeCallsFor('config.yaml')
      expect(calls).toHaveLength(1)
      expect(calls[0][2]).toEqual(expect.objectContaining({ mode: 0o600 }))
      expect(mockedChmod).toHaveBeenCalledWith(join(dir, 'config.yaml'), 0o600)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('覆盖写入已存在的 config.yaml 同样带 0600', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hermes-perm-'))
    try {
      ensureHermesConfig(dir, OPTS)
      mockedWrite.mockClear()
      mockedChmod.mockClear()
      syncHermesConfig(dir, { ...OPTS, llmModel: 'm2' })
      const calls = writeCallsFor('config.yaml')
      expect(calls.length).toBeGreaterThan(0)
      for (const c of calls) expect(c[2]).toEqual(expect.objectContaining({ mode: 0o600 }))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('官署 profile 的 config.yaml 同步也带 0600', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hermes-perm-'))
    try {
      ensureHermesConfig(dir, OPTS)
      mockedWrite.mockClear()
      syncHermesProfileConfigs(dir, ['zhongshu', 'libu'])
      const calls = writeCallsFor('config.yaml').filter((c) => String(c[0]).includes('profiles'))
      expect(calls).toHaveLength(2)
      for (const c of calls) expect(c[2]).toEqual(expect.objectContaining({ mode: 0o600 }))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('内容契约不变：api_key 仍按现有方式落盘（本批次刻意不改生成逻辑）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hermes-perm-'))
    try {
      ensureHermesConfig(dir, OPTS)
      const calls = writeCallsFor('config.yaml')
      const written = String(calls[0][1])
      expect(written).toContain('api_key:')
      expect(written).toContain('sk-test-key-1234')
      expect(written).toContain(OPTS.llmProxyBaseUrl)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('posix 环境下文件权限确实为 0600', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hermes-perm-'))
    try {
      ensureHermesConfig(dir, OPTS)
      const f = join(dir, 'config.yaml')
      if (process.platform !== 'win32') expect(statSync(f).mode & 0o777).toBe(0o600)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
