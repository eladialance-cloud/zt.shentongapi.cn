/**
 * 服务行执行器（Phase 8 / A1 抽取）。
 *
 * 定位：把 `service-manager.ts` 里与“单条服务行进程生命周期”相关的骨架抽到独立类
 * （spawn / 探活 / 重启 / CPU 采样 / 状态推送 / 结束进程树），让 `ServiceManager`
 * 专注“构建规格 + 安装 + 配置同步 + 编排”，行为零变化。
 *
 * 边界：
 * - 本类只负责“拿到启动规格后如何把进程跑起来/看住它”，不关心“规格怎么来”。
 * - 启动规格（command/args/env/permissions/...）由宿主（ServiceManager）通过
 *   `buildSpawnSpec()` 提供；前置条件（Hermes CUSTOM_API_KEY、
 *   运行时未安装等）也在规格构建阶段返回 `{ ok: false, error }`。
 * - 本类不 import 任何 service-manager 模块，避免循环依赖；`ServiceName/ServiceInfo`
 *   等形状从 shared/types 引入。
 */

import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createConnection } from 'node:net'
import * as fs from 'node:fs'
import * as path from 'node:path'
import treeKill from 'tree-kill'
import type {
  ServiceName,
  ServiceStatus,
  ServiceInfo,
  ServiceErrorPayload,
} from '../../shared/types'
import type { ServiceRow, SandboxPermission } from './types'
import { spawnSandboxed } from './sandbox'

// —— 常量 ——
const MAX_RESTART_RETRIES = 3
const RESTART_INTERVAL_MS = 5000

// —— 纯工具（原 service-manager 模块级函数，抽到此共享） ——

/** 端口连通性检测 */
export function isPortListening(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host })
    let settled = false
    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    setTimeout(() => done(false), 1000)
  })
}

/** 等待端口就绪（轮询） */
export async function waitForPort(
  port: number,
  timeoutMs = 30000,
  intervalMs = 1000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isPortListening(port)) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
}

/** 等待毫秒 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 是否为 Windows 文件占用类错误（删除/写入/重命名时常见） */
export function isLockError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as NodeJS.ErrnoException).code
  return code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY' || code === 'EACCES'
}

/** 删除目录，遇到进程占用（EBUSY/EPERM）时按间隔重试，返回是否成功 */
export async function removeDirWithRetry(
  dir: string,
  maxAttempts = 20,
  delayMs = 500,
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      return true
    } catch (err) {
      if (!isLockError(err)) return false
      if (attempt < maxAttempts) await sleep(delayMs)
    }
  }
  return false
}

/** 进程指标采样结果 */
export interface ProcessMetrics {
  /** CPU 累计时间（毫秒，user+kernel） */
  cpuTimeMs: number
  /** 内存占用（字节） */
  memBytes: number
}

/** 读取单个进程的累计 CPU 时间与内存（跨平台，best-effort） */
export function sampleProcess(pid: number): Promise<ProcessMetrics | null> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      // M3 修复：wmic 在 Windows 11 24H2+ 已被移除，改用 PowerShell Get-Process
      // 获取 UserProcessorTime + TotalProcessorTime + WorkingSet64
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', `Get-Process -Id ${pid} | Select-Object UserProcessorTime,TotalProcessorTime,WorkingSet64 | ConvertTo-Json`],
        { windowsHide: true, timeout: 3000 },
        (err, stdout) => {
          if (err || !stdout) return resolve(null)
          try {
            const data = JSON.parse(stdout.trim())
            const parseTimeSpan = (ts: string): number => {
              if (!ts || typeof ts !== 'string') return 0
              const parts = ts.split(':')
              if (parts.length !== 3) return 0
              const seconds = parseFloat(parts[2]) || 0
              const minutes = parseInt(parts[1], 10) || 0
              const hours = parseInt(parts[0], 10) || 0
              return (hours * 3600 + minutes * 60 + seconds) * 1000
            }
            const userMs = parseTimeSpan(data.UserProcessorTime)
            const totalMs = parseTimeSpan(data.TotalProcessorTime)
            const kernelMs = totalMs - userMs
            const ws = Number(data.WorkingSet64) || 0
            const cpuTimeMs = userMs + kernelMs
            if (!cpuTimeMs && !ws) return resolve(null)
            resolve({ cpuTimeMs, memBytes: ws })
          } catch {
            return resolve(null)
          }
        },
      )
    } else {
      // Linux: /proc/<pid>/stat
      execFile('cat', [`/proc/${pid}/stat`], { timeout: 2000 }, (err, stdout) => {
        if (err || !stdout) return resolve(null)
        const fields = stdout.trim().split(' ')
        const utime = parseInt(fields[13], 10) || 0
        const stime = parseInt(fields[14], 10) || 0
        const rss = parseInt(fields[23], 10) || 0
        const clkTck = 100
        const cpuTimeMs = ((utime + stime) / clkTck) * 1000
        const memBytes = rss * 4096
        resolve({ cpuTimeMs, memBytes })
      })
    }
  })
}

// —— 执行器宿主契约 ——

export interface SpawnSpec {
  command: string
  args: string[]
  env: NodeJS.ProcessEnv
  useShell: boolean
  permissions?: SandboxPermission
  writableDirs: string[]
  workspaceDir?: string
}

/** 规格构建结果：前置条件不满足时返回 ok=false + error（由宿主负责文案）。 */
export interface SpawnSpecResult {
  ok: boolean
  error?: string
  spec?: SpawnSpec
}

export interface RowExecutorHost {
  /** 按 id 取服务行（用于探活/依赖判断） */
  getRowById(id: string): ServiceRow | undefined
  /** 按 id 取服务信息 */
  getInfo(id: string): ServiceInfo | undefined
  /** 取另一行端口 */
  rowPort(id: string): number
  /** 运行时根目录 */
  getRuntimeRootPath(): string
  /** 构建启动规格（运行时解析 / preStart / env / launch 预设 / MCP 桥参数） */
  buildSpawnSpec(row: ServiceRow, info: ServiceInfo): Promise<SpawnSpecResult>
  /** 状态推送（由宿主转发 status-changed） */
  onStatus(name: string, status: ServiceStatus, info: ServiceInfo): void
  /** 错误推送（自动重启耗尽等） */
  onServiceError(payload: ServiceErrorPayload): void
  /** 依赖链自愈回调（每次采样 tick 触发；由宿主决定是否处理） */
  healDependencyChain?(): void
}

/** 启动成功后需要额外处理（如 n8n 原生依赖修复）时，由宿主在 start() 编排。 */
export class RowExecutor {
  private processes: Map<ServiceName, ChildProcess> = new Map()
  private intentionalStop: Set<ServiceName> = new Set()
  private restartCounts: Map<ServiceName, number> = new Map()
  private lastCpuSample: Map<ServiceName, { time: number; cpuMs: number }> = new Map()
  private metricsTimer: NodeJS.Timeout | null = null
  private serviceOutputs: Map<ServiceName, string> = new Map()

  constructor(private readonly host: RowExecutorHost) {}

  // —— 只读访问（ServiceManager start/getStatus 用到） ——

  hasProcess(name: ServiceName): boolean {
    return this.processes.has(name)
  }

  getServiceOutput(name: ServiceName): string {
    return this.serviceOutputs.get(name) ?? ''
  }

  getRestartCount(name: ServiceName): number {
    return this.restartCounts.get(name) ?? 0
  }

  resetRetryState(name: ServiceName): void {
    this.restartCounts.delete(name)
    this.intentionalStop.delete(name)
  }

  clearOutput(name: ServiceName): void {
    this.serviceOutputs.delete(name)
  }

  isIntentionalStop(name: ServiceName): boolean {
    return this.intentionalStop.has(name)
  }

  // —— 生命周期 ——

  /**
   * spawn 子进程并等待端口就绪。
   * 前置条件（Hermes Key / MCP 依赖 / 运行时未安装）由 buildSpawnSpec 返回 ok=false。
   */
  async startRow(row: ServiceRow, info: ServiceInfo): Promise<boolean> {
    // 如果端口已经在监听（外部已启动），直接置为 running
    if (await isPortListening(info.port)) {
      info.status = 'running'
      info.startTime = new Date().toISOString()
      this.host.onStatus(info.name, info.status, info)
      return true
    }

    const built = await this.host.buildSpawnSpec(row, info)
    if (!built.ok || !built.spec) {
      info.status = 'error'
      info.error = built.error ?? '启动前置条件不满足'
      this.host.onStatus(info.name, info.status, info)
      return false
    }
    const spec = built.spec

    // 每次启动前清空上一次的输出缓存
    this.clearOutput(info.name)

    let child: ChildProcess
    try {
      child =
        row.tier === 'module'
          ? spawnSandboxed({
              command: spec.command,
              args: spec.args,
              env: spec.env,
              stdio: ['ignore', 'pipe', 'pipe'],
              windowsHide: true,
              shell: spec.useShell,
              permissions: spec.permissions,
              writableDirs: spec.writableDirs.length ? spec.writableDirs : undefined,
              workspaceDir: spec.workspaceDir,
            })
          : spawn(spec.command, spec.args, {
              env: spec.env,
              stdio: ['ignore', 'pipe', 'pipe'],
              windowsHide: true,
              shell: spec.useShell,
            })
    } catch (err) {
      info.status = 'error'
      info.error = `启动 ${info.displayName} 失败: ${err instanceof Error ? err.message : String(err)}`
      this.host.onStatus(info.name, info.status, info)
      return false
    }

    // 标记 starting
    info.status = 'starting'
    info.error = undefined
    this.host.onStatus(info.name, info.status, info)

    // 监听子进程输出
    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      if (text.trim()) console.log(`[${info.name}] ${text.trim()}`)
      this.appendServiceOutput(info.name, text)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      if (text.trim()) console.warn(`[${info.name}] ${text.trim()}`)
      this.appendServiceOutput(info.name, text)
    })

    // spawn 错误（如命令不存在）
    child.once('error', (err) => {
      console.error(`[service-registry] ${info.name} spawn error:`, err)
      this.processes.delete(info.name)
      info.status = 'error'
      info.error = err.message
      info.pid = undefined
      this.host.onStatus(info.name, info.status, info)
    })

    // 子进程退出
    child.once('exit', (code, signal) => {
      console.warn(`[service-registry] ${info.name} exited: code=${code} signal=${signal}`)
      this.processes.delete(info.name)
      this.lastCpuSample.delete(info.name)
      // 只有真正进入 running 后的异常退出才自动重启；启动阶段（starting）失败直接报错，
      // 避免“反复重启 + 持久通知”骚扰用户
      const wasRunning = info.status === 'running'
      info.pid = undefined
      info.cpuUsage = undefined
      info.memoryUsage = undefined

      // 主动停止：不重启
      if (this.intentionalStop.has(info.name)) {
        info.status = 'stopped'
        this.host.onStatus(info.name, info.status, info)
        return
      }

      // 真实失败原因：子进程 stdout/stderr 尾部
      const output = this.getServiceOutput(info.name).trim()
      const detail = output ? `\n${output.slice(-1500)}` : ''

      if (wasRunning) {
        info.status = 'error'
        info.error = `进程异常退出 (code=${code} signal=${signal})${detail}`
        this.host.onStatus(info.name, info.status, info)
        void this.tryAutoRestart(row, info)
      } else {
        info.status = 'error'
        info.error = `${info.displayName} 启动失败（code=${code} signal=${signal}），可点击“修复”重新安装运行时${detail}`
        this.host.onStatus(info.name, info.status, info)
      }
    })

    this.processes.set(info.name, child)
    info.pid = child.pid

    // 等待服务就绪：超时时间来自行声明；带 readyPorts 的行需全部就绪
    const portTimeoutMs = row.readyTimeoutMs

    let ready = false
const waitPorts = [info.port, ...row.readyPorts.filter((p) => p !== info.port)]
      ready = true
      for (const p of waitPorts) {
        const ok = await waitForPort(p, portTimeoutMs, 1000)
        if (!ok) {
          ready = false
          break
        }
      }

    if (ready && this.processes.has(info.name)) {
      info.status = 'running'
      info.startTime = new Date().toISOString()
      this.restartCounts.delete(info.name)
      this.host.onStatus(info.name, info.status, info)
      return true
    }

    // 未就绪：保留进程继续启动，标记为 starting（前端可继续轮询）
    if (this.processes.has(info.name)) {
      info.status = 'starting'
      this.host.onStatus(info.name, info.status, info)
    }
    return false
  }

  /** 自动重启（最多 MAX_RESTART_RETRIES 次，间隔 RESTART_INTERVAL_MS） */
  private async tryAutoRestart(row: ServiceRow, info: ServiceInfo): Promise<void> {
    if (this.intentionalStop.has(info.name)) return
    const count = (this.restartCounts.get(info.name) ?? 0) + 1
    this.restartCounts.set(info.name, count)

    if (count > MAX_RESTART_RETRIES) {
      const payload: ServiceErrorPayload = {
        name: info.name,
        message:
          info.error ||
          `${info.displayName} 自动重启失败，已超过最大重试次数 (${MAX_RESTART_RETRIES})`,
        retryCount: count - 1,
      }
      console.error(`[service-registry] ${info.name} auto-restart exhausted:`, payload.message)
      this.host.onServiceError(payload)
      return
    }

    console.log(`[service-registry] ${info.name} auto-restart attempt ${count}/${MAX_RESTART_RETRIES} in ${RESTART_INTERVAL_MS}ms`)
    await new Promise((resolve) => setTimeout(resolve, RESTART_INTERVAL_MS))
    if (this.intentionalStop.has(info.name)) return

    const cur = this.host.getInfo(info.name)
    if (!cur) return
    cur.status = 'starting'
    cur.error = undefined
    this.host.onStatus(cur.name, cur.status, cur)
    try {
      await this.startRow(row, cur)
    } catch (err) {
      cur.status = 'error'
      cur.error = err instanceof Error ? err.message : String(err)
      this.host.onStatus(cur.name, cur.status, cur)
      void this.tryAutoRestart(row, cur)
    }
  }

  /** 主动停止：标记 intentionalStop，结束进程树并清空状态。 */
  async stop(name: ServiceName, info: ServiceInfo): Promise<void> {
    this.intentionalStop.add(name)
    this.restartCounts.delete(name)

    const child = this.processes.get(name)
    if (child) {
      try {
        child.removeAllListeners('exit')
        child.removeAllListeners('error')
        // 结束整个进程树：Windows 下 spawn(shell:true) 的 child 只是 cmd.exe，
        // kill 它只会留下 node 孤儿进程继续占用端口，导致下次启动失败
        await this.killProcessTree(child.pid)
      } catch (err) {
        console.warn(`[service-registry] stop ${name} kill failed:`, err)
      } finally {
        this.processes.delete(name)
        this.lastCpuSample.delete(name)
      }
    }
    this.clearOutput(name)

    info.status = 'stopped'
    info.pid = undefined
    info.error = undefined
    info.cpuUsage = undefined
    info.memoryUsage = undefined
    info.startTime = undefined
    this.host.onStatus(name, info.status, info)
  }

  // —— 进程树/目录清理 ——

  /** 结束整个子进程树（Windows shell:true 下 kill 只杀 cmd.exe，node 子进程会成孤儿继续占用端口） */
  killProcessTree(pid: number | undefined): Promise<void> {
    return new Promise((resolve) => {
      if (!pid) {
        resolve()
        return
      }
      let settled = false
      let done: () => void = () => {}
      const timer = setTimeout(() => done(), 3000)
      done = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve()
      }
      try {
        treeKill(pid, 'SIGKILL', done)
      } catch {
        done()
      }
    })
  }

  /**
   * 列出可执行文件位于指定目录下的进程 PID（Windows）。
   * 用于找出未被本实例 spawn 跟踪的孤儿进程。
   */
  listPidsUnderDir(dir: string): Promise<number[]> {
    return new Promise((resolve) => {
      if (process.platform !== 'win32') {
        resolve([])
        return
      }
      const pattern = path.join(dir, '*')
      const psCmd =
        'Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like "' +
        pattern.replace(/"/g, '') +
        '" } | Select-Object -ExpandProperty ProcessId'
      execFile(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', psCmd],
        { windowsHide: true, timeout: 5000 },
        (err, stdout) => {
          if (err || !stdout) {
            resolve([])
            return
          }
          const pids = stdout
            .trim()
            .split(/\r?\n/)
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => Number.isInteger(n) && n > 0)
          resolve(pids)
        },
      )
    })
  }

  /** 强制结束指定 PID 及其进程树（taskkill /F /T，Windows） */
  killPids(pids: number[]): Promise<void> {
    if (pids.length === 0) return Promise.resolve()
    const args = ['/F', '/T']
    for (const pid of pids) args.push('/PID', String(pid))
    return new Promise((resolve) => {
      execFile('taskkill', args, { windowsHide: true, timeout: 10000 }, () => resolve())
    })
  }

  /**
   * 等待运行时目录完全释放：结束残留进程 + 轮询等待端口关闭且目录下无进程残留。
   */
  async waitForRuntimeDirReleased(name: ServiceName, timeoutMs = 20000): Promise<void> {
    const dir = path.join(this.host.getRuntimeRootPath(), name)
    const port = this.getRowPort(name)
    try {
      const pids = await this.listPidsUnderDir(dir)
      if (pids.length > 0) {
        console.log(
          `[service-registry] ${name} 发现 ${pids.length} 个残留进程占用运行时目录（PID: ${pids.join(', ')}），强制结束`,
        )
        await this.killPids(pids)
      }
    } catch (err) {
      console.warn(`[service-registry] ${name} 清理残留进程失败:`, err)
    }
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const listening = await isPortListening(port)
      const leftovers = await this.listPidsUnderDir(dir)
      if (!listening && leftovers.length === 0) return
      await sleep(1000)
    }
    console.warn(`[service-registry] ${name} 运行时目录等待释放超时（${timeoutMs}ms），继续尝试安装`)
  }

  private getRowPort(name: ServiceName): number {
    return this.host.rowPort(name)
  }

  // —— metrics 采样 ——

  /** 启动每秒 metrics 采样（不阻止进程退出） */
  startMetricsSampler(getServices: () => Map<ServiceName, ServiceInfo>): void {
    if (this.metricsTimer) return
    this.metricsTimer = setInterval(() => {
      void this.sampleAllMetrics(getServices())
      this.host.healDependencyChain?.()
    }, 1000)
    if (typeof this.metricsTimer.unref === 'function') {
      this.metricsTimer.unref()
    }
  }

  /** 采样所有运行中服务的 CPU/内存 */
  private async sampleAllMetrics(services: Map<ServiceName, ServiceInfo>): Promise<void> {
    for (const [name, child] of this.processes) {
      const pid = child.pid
      if (!pid) continue
      const info = services.get(name)
      if (!info || info.status !== 'running') continue
      try {
        const sample = await sampleProcess(pid)
        if (!sample) continue
        const now = Date.now()
        const last = this.lastCpuSample.get(name)
        let cpuPercent: number | undefined
        if (last) {
          const dt = now - last.time
          const dCpu = sample.cpuTimeMs - last.cpuMs
          if (dt > 0) cpuPercent = Math.max(0, Math.min(100, (dCpu / dt) * 100))
        }
        this.lastCpuSample.set(name, { time: now, cpuMs: sample.cpuTimeMs })
        info.cpuUsage = cpuPercent
        info.memoryUsage = Math.round((sample.memBytes / 1024 / 1024) * 10) / 10
      } catch {
        // 采样失败忽略
      }
    }
  }

  // —— 输出缓存 ——

  /** 追加子进程输出（滚动保留尾部，供失败时展示真实原因） */
  private appendServiceOutput(name: ServiceName, text: string): void {
    const prev = this.serviceOutputs.get(name) ?? ''
    this.serviceOutputs.set(name, (prev + text).slice(-6000))
  }
}