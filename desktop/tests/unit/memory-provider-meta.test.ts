import {
  MEMORY_PROVIDERS,
  MEMORY_PROVIDER_NAMES,
  isKnownMemoryProvider,
} from '../../electron/shared/memory-providers'

describe('MEMORY_PROVIDERS 元数据', () => {
  it('覆盖上游 8 个 provider 且字段完整', () => {
    expect(MEMORY_PROVIDERS).toHaveLength(8)
    expect(MEMORY_PROVIDERS.map((p) => p.name)).toEqual([
      'honcho',
      'hindsight',
      'mem0',
      'retaindb',
      'supermemory',
      'holographic',
      'openviking',
      'byterover',
    ])
    for (const p of MEMORY_PROVIDERS) {
      expect(p.name).toBeTruthy()
      expect(p.description).toBeTruthy()
      expect(Array.isArray(p.envVars)).toBe(true)
    }
  })

  it('MEMORY_PROVIDER_NAMES 与列表一致', () => {
    expect(MEMORY_PROVIDER_NAMES).toEqual(MEMORY_PROVIDERS.map((p) => p.name))
  })

  it('isKnownMemoryProvider 校验', () => {
    expect(isKnownMemoryProvider('mem0')).toBe(true)
    expect(isKnownMemoryProvider('byterover')).toBe(true)
    expect(isKnownMemoryProvider('')).toBe(false)
    expect(isKnownMemoryProvider(undefined)).toBe(false)
    expect(isKnownMemoryProvider('unknown')).toBe(false)
  })

  it('提供官方外链的 provider 具有 url', () => {
    const withUrl = MEMORY_PROVIDERS.filter((p) => p.url)
    expect(withUrl.length).toBeGreaterThanOrEqual(6)
    for (const p of withUrl) {
      expect(p.url).toMatch(/^https:\/\//)
    }
  })
})