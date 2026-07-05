// Jest 类型声明（最小化版本）
// 当 @types/jest 未安装时提供基础类型，安装 @types/jest 后此文件可删除
// 仅覆盖本工程 e2e 测试用到的 API

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => any

/** Jest Mock 函数类型 */
interface JestMock<T extends AnyFunction = AnyFunction> {
  (...args: Parameters<T>): ReturnType<T>
  mock: {
    calls: unknown[][]
    results: Array<{ type: 'return' | 'throw'; value: unknown }>
    instances: unknown[]
  }
  mockReturnValue(value: unknown): JestMock<T>
  mockReturnValueOnce(value: unknown): JestMock<T>
  mockResolvedValue(value: unknown): JestMock<T>
  mockResolvedValueOnce(value: unknown): JestMock<T>
  mockRejectedValue(value: unknown): JestMock<T>
  mockRejectedValueOnce(value: unknown): JestMock<T>
  mockImplementation(fn: T): JestMock<T>
  mockImplementationOnce(fn: T): JestMock<T>
  mockReset(): JestMock<T>
  mockClear(): JestMock<T>
  mockRestore(): void
  getMockName(): string
  mockName(name: string): JestMock<T>
}

/** Jest 断言匹配器 */
interface JestMatchers<T> {
  toBe(expected: unknown): void
  toEqual(expected: unknown): void
  toStrictEqual(expected: unknown): void
  toBeTruthy(): void
  toBeFalsy(): void
  toBeNull(): void
  toBeUndefined(): void
  toBeDefined(): void
  toBeNaN(): void
  toContain(expected: unknown): void
  toContainEqual(expected: unknown): void
  toHaveLength(length: number): void
  toMatch(regex: RegExp | string): void
  toMatchObject(expected: unknown): void
  toHaveProperty(path: string | string[], value?: unknown): void
  toBeGreaterThan(n: number): void
  toBeGreaterThanOrEqual(n: number): void
  toBeLessThan(n: number): void
  toBeLessThanOrEqual(n: number): void
  toBeCloseTo(n: number, precision?: number): void
  toBeInstanceOf(cls: new (...args: any[]) => unknown): void
  toThrow(): void
  toThrow(message: string | RegExp | Error): void
  toThrowError(message: string | RegExp | Error): void
  resolves: JestMatchers<T>
  rejects: JestMatchers<T>
  not: JestMatchers<T>
  toHaveBeenCalled(): void
  toHaveBeenCalledTimes(n: number): void
  toHaveBeenCalledWith(...args: unknown[]): void
  toHaveBeenCalledLastWith(...args: unknown[]): void
  toHaveBeenCalledNthWith(n: number, ...args: unknown[]): void
  toHaveReturned(): void
  toHaveReturnedTimes(n: number): void
  toHaveReturnedWith(value: unknown): void
  toHaveLastReturnedWith(value: unknown): void
  toHaveNthReturnedWith(n: number, value: unknown): void
}

/** jest 全局对象 */
declare const jest: {
  fn<T extends AnyFunction = AnyFunction>(implementation?: T): JestMock<T>
  mock(moduleName: string, factory?: () => unknown): void
  unmock(moduleName: string): void
  clearAllMocks(): void
  resetAllMocks(): void
  restoreAllMocks(): void
  useFakeTimers(): void
  useRealTimers(): void
  setSystemTime(time: Date | number): void
  getRealSystemTime(): number
}

declare namespace jest {
  type Mock<T extends AnyFunction = AnyFunction> = JestMock<T>
  type MockedFunction<T extends AnyFunction = AnyFunction> = JestMock<T> & T
  type Mocked<T> = T
}

/** 测试套件与用例声明 */
declare function describe(name: string, fn: () => void): void
declare function describe(name: string, fn: () => Promise<void>): void
declare function it(name: string, fn: () => void | Promise<void>): void
declare function test(name: string, fn: () => void | Promise<void>): void
declare function beforeEach(fn: () => void | Promise<void>): void
declare function afterEach(fn: () => void | Promise<void>): void
declare function beforeAll(fn: () => void | Promise<void>): void
declare function afterAll(fn: () => void | Promise<void>): void

/** expect 断言函数 */
declare function expect<T>(actual: T): JestMatchers<T>

declare namespace expect {
  function objectContaining(object: Record<string, unknown>): unknown
  function arrayContaining(array: unknown[]): unknown
  function stringContaining(string: string): unknown
  function stringMatching(regex: RegExp): unknown
  function any(cls: unknown): unknown
  function anything(): unknown
  function assertions(n: number): void
  function hasAssertions(): void
}

/** Jest 环境全局变量 */
declare const __DEV__: boolean | undefined
