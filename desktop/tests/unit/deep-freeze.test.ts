// deepFreeze 回归测试（安全审计 S-20：preload 暴露对象未冻结）
import { deepFreeze } from '../../electron/shared/deep-freeze'

describe('deepFreeze', () => {
  it('冻结顶层与嵌套对象/数组', () => {
    const api = { a: { b: { c: 1 } }, list: [{ x: 1 }], fn: () => 1 }
    deepFreeze(api)
    expect(Object.isFrozen(api)).toBe(true)
    expect(Object.isFrozen(api.a)).toBe(true)
    expect(Object.isFrozen(api.a.b)).toBe(true)
    expect(Object.isFrozen(api.list)).toBe(true)
    expect(Object.isFrozen(api.list[0])).toBe(true)
    expect(Object.isFrozen(api.fn)).toBe(true)
  })

  it('严格模式下写入被拒（原型污染与后期注入都失效）', () => {
    const api: Record<string, unknown> = { nested: { v: 1 } }
    deepFreeze(api)
    let topLevelError: unknown = null
    try {
      api.added = 1
    } catch (err) {
      topLevelError = err
    }
    expect(topLevelError).toBeInstanceOf(TypeError)
    let nestedError: unknown = null
    try {
      ;(api.nested as Record<string, unknown>).v = 2
    } catch (err) {
      nestedError = err
    }
    expect(nestedError).toBeInstanceOf(TypeError)
    expect((api.nested as Record<string, unknown>).v).toBe(1)
  })

  it('循环引用不栈溢出', () => {
    const a: Record<string, unknown> = { name: 'a' }
    const b: Record<string, unknown> = { a }
    a.b = b
    expect(() => deepFreeze(a)).not.toThrow()
    expect(Object.isFrozen(b)).toBe(true)
  })

  it('原始值与 null / undefined 直接返回', () => {
    expect(deepFreeze(1)).toBe(1)
    expect(deepFreeze('x')).toBe('x')
    expect(deepFreeze(null)).toBe(null)
    expect(deepFreeze(undefined)).toBe(undefined)
  })

  it('已冻结对象可重复冻结（幂等）', () => {
    const o = { a: 1 }
    deepFreeze(o)
    expect(() => deepFreeze(o)).not.toThrow()
    expect(Object.isFrozen(o)).toBe(true)
  })

  it('不破坏函数可调用性', () => {
    const api = { f: (n: number) => n + 1 }
    deepFreeze(api)
    expect(api.f(1)).toBe(2)
  })
})
