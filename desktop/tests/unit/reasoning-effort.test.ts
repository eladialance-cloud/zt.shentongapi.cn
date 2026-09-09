import {
  DEFAULT_REASONING_EFFORT,
  REASONING_EFFORTS,
  normalizeReasoningEffort,
} from '../../src/pages/HermesChat/reasoningEffort'

describe('reasoningEffort', () => {
  it('默认自动且含 6 档', () => {
    expect(DEFAULT_REASONING_EFFORT).toBe('auto')
    expect(REASONING_EFFORTS.map((o) => o.value)).toEqual([
      'auto', 'minimal', 'low', 'medium', 'high', 'xhigh',
    ])
  })

  it('normalize 合法值透传，非法回退默认', () => {
    expect(normalizeReasoningEffort('high')).toBe('high')
    expect(normalizeReasoningEffort('xhigh')).toBe('xhigh')
    expect(normalizeReasoningEffort('unknown')).toBe(DEFAULT_REASONING_EFFORT)
    expect(normalizeReasoningEffort(undefined)).toBe(DEFAULT_REASONING_EFFORT)
  })
})