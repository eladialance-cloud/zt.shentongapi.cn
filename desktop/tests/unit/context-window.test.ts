import { contextWindowForModel, DEFAULT_CONTEXT_WINDOW, fmtTokens } from '../../src/pages/HermesChat/contextWindow'

describe('contextWindowForModel', () => {
  it('已知模型族返回对应窗口', () => {
    expect(contextWindowForModel('gpt-4o')).toBe(128000)
    expect(contextWindowForModel('deepseek-chat')).toBe(131072)
    expect(contextWindowForModel('qwen-2.5')).toBe(32768)
    expect(contextWindowForModel('claude-fable-5')).toBe(1000000)
  })

  it('未知或空回退默认窗口', () => {
    expect(contextWindowForModel('unknown-xyz')).toBe(DEFAULT_CONTEXT_WINDOW)
    expect(contextWindowForModel('')).toBe(DEFAULT_CONTEXT_WINDOW)
    expect(contextWindowForModel(null)).toBe(DEFAULT_CONTEXT_WINDOW)
    expect(contextWindowForModel(undefined)).toBe(DEFAULT_CONTEXT_WINDOW)
  })
})

describe('fmtTokens', () => {
  it('缩写为 M / k / 原值', () => {
    expect(fmtTokens(1_500_000)).toBe('1.5M')
    expect(fmtTokens(128_000)).toBe('128k')
    expect(fmtTokens(9500)).toBe('9.5k')
  })
})