import { EventEmitter } from 'node:events'
import { RowExecutor, type RowExecutorHost } from '../../electron/main/service-registry/row-executor'
import type { ServiceInfo, ServiceStatus } from '../../electron/shared/types'
import type { ServiceRow } from '../../electron/main/service-registry/types'

// 可配置的“端口监听”行为：conn 计数第 n 次 createConnection 决定 connect/error。
// conn >= connectFrom 视为端口已监听；否则拒绝连接。每个测试自行重置。
let conn = 0
let connectFrom = 2

jest.mock('node:net', () => ({
  createConnection: jest.fn((_opts: unknown) => {
    conn += 1
    const socket: any = {
      once: (evt: string, cb: (...args: unknown[]) => void) => {
        if (evt === 'connect' && conn >= connectFrom) cb()
        else if (evt === 'error') cb(new Error('ECONNREFUSED'))
        return socket
      },
      destroy: () => {},
    }
    return socket
  }),
}))

jest.mock('tree-kill', () => {
  const fn = jest.fn((_pid: number, _sig: string, cb: () => void) => cb())
  return { __esModule: true, default: fn }
})

const spawnMock = jest.fn()
jest.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}))

function makeChild(pid = 1234) {
  const child = new EventEmitter() as any
  ;(child as any).pid = pid
  child.killed = false
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = jest.fn(() => { child.killed = true })
  return child
}

function row(overrides: Partial<ServiceRow> = {}): ServiceRow {
  return {
    id: 'svc',
    displayName: 'Svc',
    tier: 'base',
    version: '',
    runtimeKey: 'svc',
    port: 8080,
    readyPorts: [],
    readyTimeoutMs: 50,
    launch: 'default',
    dependsOn: [],
    restartOn: [],
    capabilities: {},
    writableDirs: [],
    disabled: false,
    ...overrides,
  }
}

function info(name = 'svc', port = 8080): ServiceInfo {
  return { name, displayName: 'Svc', status: 'unknown', port }
}

function makeHost(overrides: Partial<RowExecutorHost> = {}): {
  host: RowExecutorHost
  onStatus: jest.Mock
  onServiceError: jest.Mock
  buildSpawnSpec: jest.Mock
  getInfo: jest.Mock
} {
  const onStatus = jest.fn()
  const onServiceError = jest.fn()
  const buildSpawnSpec = jest.fn().mockResolvedValue({
    ok: true,
    spec: { command: 'node', args: ['-e', '0'], env: {}, useShell: false, writableDirs: [] },
  })
  const getInfo = jest.fn((id: string) => (id === 'svc' ? info('svc') : undefined))
  const host: RowExecutorHost = {
    getRowById: jest.fn(() => row()),
    getInfo,
    rowPort: jest.fn(() => 3100),
    getRuntimeRootPath: jest.fn(() => '/tmp/runtime'),
    buildSpawnSpec,
    onStatus,
    onServiceError,
    healDependencyChain: jest.fn(),
    ...overrides,
  }
  return { host, onStatus, onServiceError, buildSpawnSpec, getInfo }
}

const statuses = (calls: unknown[][]) => calls.map((c) => c[1] as ServiceStatus)

describe('RowExecutor', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    conn = 0
    connectFrom = 2
    spawnMock.mockReset()
    spawnMock.mockImplementation(() => makeChild())
  })

  test('端口已监听：直接置 running，不再构建规格/不 spawn', async () => {
    conn = 0
    connectFrom = 1
    const { host, buildSpawnSpec } = makeHost()
    const ex = new RowExecutor(host)
    const i = info()
    await expect(ex.startRow(row(), i)).resolves.toBe(true)
    expect(i.status).toBe('running')
    expect(i.startTime).toBeDefined()
    expect(buildSpawnSpec).not.toHaveBeenCalled()
    expect(spawnMock).not.toHaveBeenCalled()
  })

  test('构建规格前置条件失败：标记 error 并推送状态', async () => {
    const { host, onStatus } = makeHost({
      buildSpawnSpec: jest.fn().mockResolvedValue({ ok: false, error: '运行时未安装' }),
    })
    const ex = new RowExecutor(host)
    const i = info()
    await expect(ex.startRow(row(), i)).resolves.toBe(false)
    expect(i.status).toBe('error')
    expect(i.error).toBe('运行时未安装')
    expect(statuses(onStatus.mock.calls)).toContain('error')
    expect(spawnMock).not.toHaveBeenCalled()
  })

  test('spawn 成功且端口就绪：置 running，进程登记，cpu 采样可读取', async () => {
    const { host, onStatus, buildSpawnSpec } = makeHost()
    const ex = new RowExecutor(host)
    const i = info()
    await expect(ex.startRow(row({ readyTimeoutMs: 1000 }), i)).resolves.toBe(true)
    expect(i.status).toBe('running')
    expect(i.startTime).toBeDefined()
    expect(i.pid).toBe(1234)
    expect(ex.hasProcess('svc')).toBe(true)
    expect(buildSpawnSpec).toHaveBeenCalledTimes(1)
    expect(statuses(onStatus.mock.calls)).toEqual(['starting', 'running'])
  })

  test('spawn 成功但端口未就绪：标记 starting，不标 running', async () => {
    conn = 0
    connectFrom = 999 // 永不监听
    const { host, onStatus } = makeHost()
    const ex = new RowExecutor(host)
    const i = info()
    await expect(ex.startRow(row({ readyTimeoutMs: 50 }), i)).resolves.toBe(false)
    expect(i.status).toBe('starting')
    expect(statuses(onStatus.mock.calls)).toContain('starting')
    expect(statuses(onStatus.mock.calls)).not.toContain('running')
  })

  test('stop：标记主动停止，结束进程树，输出清空，状态 stopped', async () => {
    const { host, onStatus } = makeHost()
    const ex = new RowExecutor(host)
    const i = info()
    await ex.startRow(row({ readyTimeoutMs: 1000 }), i)
    expect(ex.hasProcess('svc')).toBe(true)
    await ex.stop('svc', i)
    expect(ex.hasProcess('svc')).toBe(false)
    expect(ex.isIntentionalStop('svc')).toBe(true)
    expect(i.status).toBe('stopped')
    expect(i.pid).toBeUndefined()
    expect(statuses(onStatus.mock.calls)).toContain('stopped')
  })

  test('killProcessTree(undefined) 直接结束，不抛错', async () => {
    const { host } = makeHost()
    const ex = new RowExecutor(host)
    await expect(ex.killProcessTree(undefined)).resolves.toBeUndefined()
  })

  test('resetRetryState 清空重启计数与主动停止标记', async () => {
    const { host } = makeHost()
    const ex = new RowExecutor(host)
    ex.resetRetryState('svc')
    expect(ex.isIntentionalStop('svc')).toBe(false)
    expect(ex.getRestartCount('svc')).toBe(0)
  })
})
