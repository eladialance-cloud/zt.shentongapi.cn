import {
  emptyMemoryProviderConfig,
  normalizeProviderConfig,
  applyActiveProvider,
  applyProviderEnv,
} from '../../electron/main/hermes-memory-provider'

describe('emptyMemoryProviderConfig', () => {
  it('默认未激活且无 provider', () => {
    expect(emptyMemoryProviderConfig()).toEqual({ active: '', providers: {} })
  })
})

describe('normalizeProviderConfig', () => {
  it('过滤非法字段并 trim active', () => {
    const r = normalizeProviderConfig({
      active: '  mem0  ',
      providers: {
        mem0: { MEM0_API_KEY: 'key1', '': 'bad' },
        bad: 'not-object',
        empty: {},
      },
    })
    expect(r.active).toBe('mem0')
    expect(r.providers.mem0).toEqual({ MEM0_API_KEY: 'key1' })
    expect(r.providers.bad).toBeUndefined()
    expect(r.providers.empty).toBeUndefined()
  })

  it('非对象值返回空配置', () => {
    expect(normalizeProviderConfig(null)).toEqual({ active: '', providers: {} })
    expect(normalizeProviderConfig('x')).toEqual({ active: '', providers: {} })
  })

  it('非字符串 env 值转字符串', () => {
    const r = normalizeProviderConfig({ active: '', providers: { mem0: { K: 123, N: null } } })
    expect(r.providers.mem0).toEqual({ K: '123', N: '' })
  })
})

describe('applyActiveProvider', () => {
  it('激活 / 停用', () => {
    expect(applyActiveProvider({ active: '', providers: {} }, 'mem0').active).toBe('mem0')
    expect(applyActiveProvider({ active: 'mem0', providers: {} }, '').active).toBe('')
  })
})

describe('applyProviderEnv', () => {
  const base = { active: 'mem0', providers: { mem0: { MEM0_API_KEY: 'k' } } }
  it('覆盖已有键', () => {
    const r = applyProviderEnv(base, 'mem0', 'MEM0_API_KEY', 'k2')
    expect(r.providers.mem0).toEqual({ MEM0_API_KEY: 'k2' })
  })
  it('空值移除键', () => {
    const r = applyProviderEnv(base, 'mem0', 'MEM0_API_KEY', '')
    expect(r.providers).not.toHaveProperty('mem0')
  })
  it('空 provider/envKey 不动原配置', () => {
    expect(applyProviderEnv(base, '', 'K', 'v')).toEqual(base)
    expect(applyProviderEnv(base, 'mem0', '', 'v')).toEqual(base)
  })
})