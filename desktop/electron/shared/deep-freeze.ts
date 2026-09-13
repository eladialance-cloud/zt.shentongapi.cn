/**
 * 递归冻结（安全审计 S-20）。
 *
 * 用途：preload 通过 contextBridge 暴露给渲染层的对象必须冻结，
 * 否则渲染层（或注入脚本）可以给命名空间挂新方法/改属性，属于「凭据检查后仍可被改写」的一类风险。
 *
 * 规则：
 * - 只深入普通对象 / 数组 / 函数；Map / Set / Date / RegExp 等只冻结自身（内部槽无法冻结）；
 * - 用 WeakSet 记录已访问对象，循环引用不会栈溢出；
 * - 幂等：已冻结对象直接返回；
 * - 跳过访问器属性（避免触发 getter 副作用）。
 */
export function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return value
  const target = value as unknown as object
  if (Object.isFrozen(target) || seen.has(target)) return value
  seen.add(target)

  if (Array.isArray(target)) {
    for (const item of target) deepFreeze(item, seen)
  } else {
    const proto = Object.getPrototypeOf(target)
    const isPlain = proto === Object.prototype || proto === null || typeof target === 'function'
    if (isPlain) {
      for (const key of Object.getOwnPropertyNames(target)) {
        const desc = Object.getOwnPropertyDescriptor(target, key)
        if (!desc || !('value' in desc)) continue
        deepFreeze(desc.value, seen)
      }
    }
  }

  Object.freeze(target)
  return value
}
