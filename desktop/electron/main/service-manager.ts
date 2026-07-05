// 本地服务管理器 - 管理 OpenClaw / N8N / MCP Gateway 三个本地服务进程
//
// 实现说明（Task 16）：
// - 三个服务均通过 child_process.spawn 启动子进程
// - 启动命令可配置（SERVICE_COMMANDS），按候选命令依次尝试
// - 每秒采样 CPU/内存（Windows: wmic / Linux: /proc/<pid>/stat）
// - 异常退出自动重启（最多 3 次，间隔 5 秒），超过后 emit 'service-error'
// - 状态变更 emit 'status-changed'，由主进程入口转发到渲染进程

import { EventEmitter } from 'node:events'
import { exec, spawn, type ChildProcess } from 'node:child_process'
import { createConnection } from 'node:net'
import type {
  ServiceName,
  ServiceStatus,
  ServiceInfo,
  ServiceEnvCheck,
  ServiceErrorPayload
} from '../shared/types'
import { resolve, verifyAll } from './runtime-resolver'

interface ServiceDef {
  displayName: string
  port: number
}

const SERVICE_DEFS: Record<ServiceName, ServiceDef> = {
  openclaw: { displayName: 'OpenClaw', port: 8080 },
  n8n: { displayName: 'N8N', port: 5678 },
  mcp: { displayName: 'MCP Gateway', port: 3100 }
}

/** N8N 子进程环境变量 */
const N8N_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  N8N_HOST: '127.0.0.1',
  N8N_PORT: '5678',
  N8N_PROTOCOL: 'http',
  N8N_EDITOR_BASE_URL: 'http://127.0.0.1:5678',
  N8N_DIAGNOSTICS_ENABLED: 'false',
  GENERIC_TIMEZONE: 'Asia/Shanghai'
}

/** MCP 子进程环境变量 */
const MCP_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  MCP_PORT: '3100',
  MCP_HOST: '127.0.0.1'
}

/** 自动重启配置 */
const MAX_RESTART_RETRIES = 3
const RESTART_INTERVAL_MS = 5000

/** 端口连通性检测 */
function isPortListening(port: number, host = '127.0.0.1'): Promise<boolean> {
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
async function waitForPort(
  port: number,
  timeoutMs = 30000,
  intervalMs = 1000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isPortListening(port)) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
}

/** 进程指标采样结果 */
interface ProcessMetrics {
  /** CPU 累计时间（毫秒，user+kernel） */
  cpuTimeMs: number
  /** 内存占用（字节） */
  memBytes: number
}

/** 读取单个进程的累计 CPU 时间与内存（跨平台，best-effort） */
function sampleProcess(pid: number): Promise<ProcessMetrics | null> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      // wmic /format:list 输出 Key=Value 形式，更易解析
      exec(
        `wmic process where ProcessId=${pid} get UserModeTime,KernelModeTime,WorkingSetSize /format:list`,
        { windowsHide: true, timeout: 2000 },
        (err, stdout) => {
          if (err || !stdout) return resolve(null)
          const map: Record<string, string> = {}
          for (const line of stdout.split(/\r?\n/)) {
            const idx = line.indexOf('=')
            if (idx > 0) {
              const key = line.slice(0, idx).trim()
              const val = line.slice(idx + 1).trim()
              if (key) map[key] = val
            }
          }
          const user = Number(map.UserModeTime) || 0
          const kernel = Number(map.KernelModeTime) || 0
          const ws = Number(map.WorkingSetSize) || 0
          // wmic 时间单位为 100ns，转换为毫秒
          const cpuTimeMs = (user + kernel) / 10000
          if (!cpuTimeMs && !ws) return resolve(null)
          resolve({ cpuTimeMs, memBytes: ws })
        }
      )
    } else {
      // Linux: /proc/<pid>/stat
      exec(`cat /proc/${pid}/stat`, { timeout: 2000 }, (err, stdout) => {
        if (err || !stdout) return resolve(null)
        const fields = stdout.trim().split(' ')
        // utime=14, stime=15, rss=24（从 0 开始计数）
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

export class ServiceManager extends EventEmitter {
  private services: Map<ServiceName, ServiceInfo> = new Map()
  /** 运行中的子进程 */
  private processes: Map<ServiceName, ChildProcess> = new Map()
  /** 主动停止标记（避免触发自动重启） */
  private intentionalStop: Set<ServiceName> = new Set()
  /** 自动重启已重试次数 */
  private restartCounts: Map<ServiceName, number> = new Map()
  /** 上一次 CPU 采样（用于差值计算 CPU%） */
  private lastCpuSample: Map<ServiceName, { time: number; cpuMs: number }> = new Map()
  /** metrics 采样定时器 */
  private metricsTimer: NodeJS.Timeout | null = null

  constructor() {
    super()
    for (const [name, def] of Object.entries(SERVICE_DEFS)) {
      this.services.set(name as ServiceName, {
        name: name as ServiceName,
        displayName: def.displayName,
        status: 'unknown',
        port: def.port
      })
    }
    this.startMetricsSampler()
  }

  /** 启动每秒 metrics 采样 */
  private startMetricsSampler(): void {
    if (this.metricsTimer) return
    this.metricsTimer = setInterval(() => {
      void this.sampleAllMetrics()
    }, 1000)
    // 不阻止进程退出
    if (typeof this.metricsTimer.unref === 'function') {
      this.metricsTimer.unref()
    }
  }

  /** 采样所有运行中服务的 CPU/内存 */
  private async sampleAllMetrics(): Promise<void> {
    for (const [name, child] of this.processes) {
      const pid = child.pid
      if (!pid) continue
      const info = this.services.get(name)
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

  getAllStatus(): Record<ServiceName, ServiceStatus> {
    const result = {} as Record<ServiceName, ServiceStatus>
    for (const [name, info] of this.services) {
      result[name] = info.status
    }
    return result
  }

  getStatus(name: ServiceName): ServiceStatus {
    return this.services.get(name)?.status ?? 'unknown'
  }

  /** 检测服务真实运行状态（端口是否监听） */
  async getServiceStatus(name: ServiceName): Promise<ServiceStatus> {
    const info = this.services.get(name)
    if (!info) return 'unknown'
    const listening = await isPortListening(info.port)
    if (listening && info.status !== 'running') {
      info.status = 'running'
      this.emitStatus(name)
    } else if (!listening && info.status === 'running') {
      info.status = this.processes.has(name) ? 'unknown' : 'stopped'
      this.emitStatus(name)
    }
    return info.status
  }

  getInfo(name: ServiceName): ServiceInfo | undefined {
    return this.services.get(name)
  }

  getAllInfo(): ServiceInfo[] {
    return Array.from(this.services.values())
  }

  async start(name: ServiceName): Promise<boolean> {
    const info = this.services.get(name)
    if (!info) return false

    // 已在运行：直接返回成功
    if (info.status === 'running' && (await isPortListening(info.port))) {
      return true
    }

    // 重置重试计数
    this.restartCounts.delete(name)
    this.intentionalStop.delete(name)

    try {
      return await this.spawnService(name, info)
    } catch (err) {
      console.error(`[service-manager] start ${name} failed:`, err)
      info.status = 'error'
      info.error = err instanceof Error ? err.message : String(err)
      this.emitStatus(name)
      return false
    }
  }

  /** spawn 子进程并等待端口就绪 */
  private async spawnService(name: ServiceName, info: ServiceInfo): Promise<boolean> {
    // 如果端口已经在监听（外部已启动），直接置为 running
    if (await isPortListening(info.port)) {
      info.status = 'running'
      info.startTime = new Date().toISOString()
      this.emitStatus(name)
      return true
    }

    const resolved = resolve(name)
    if (!resolved) {
      info.status = 'error'
      info.error = '运行时未安装'
      this.emitStatus(name)
      return false
    }

    // 合并环境变量：N8N_ENV / MCP_ENV 优先于 resolved.env
    const env =
      name === 'n8n' ? { ...resolved.env, ...N8N_ENV } :
      name === 'mcp' ? { ...resolved.env, ...MCP_ENV } :
      resolved.env

    let child: ChildProcess
    try {
      child = spawn(resolved.cmd, resolved.args, {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: process.platform === 'win32'
      })
    } catch (err) {
      info.status = 'error'
      info.error = `启动 ${info.displayName} 失败: ${err instanceof Error ? err.message : String(err)}`
      this.emitStatus(name)
      return false
    }

    // 标记 starting
    info.status = 'starting'
    info.error = undefined
    this.emitStatus(name)

    // 监听子进程输出
    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim()
      if (text) console.log(`[${name}] ${text}`)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim()
      if (text) console.warn(`[${name}] ${text}`)
    })

    // spawn 错误（如命令不存在）
    child.once('error', (err) => {
      console.error(`[service-manager] ${name} spawn error:`, err)
      this.processes.delete(name)
      info.status = 'error'
      info.error = err.message
      info.pid = undefined
      this.emitStatus(name)
    })

    // 子进程退出
    child.once('exit', (code, signal) => {
      console.warn(`[service-manager] ${name} exited: code=${code} signal=${signal}`)
      this.processes.delete(name)
      this.lastCpuSample.delete(name)
      const wasRunning = info.status === 'running' || info.status === 'starting'
      info.pid = undefined
      info.cpuUsage = undefined
      info.memoryUsage = undefined

      // 主动停止：不重启
      if (this.intentionalStop.has(name)) {
        info.status = 'stopped'
        this.emitStatus(name)
        return
      }

      // 非主动退出：标记 error 并尝试自动重启
      if (wasRunning) {
        info.status = 'error'
        info.error = `进程异常退出 (code=${code} signal=${signal})`
        this.emitStatus(name)
        void this.tryAutoRestart(name)
      }
    })

    this.processes.set(name, child)
    info.pid = child.pid

    // 等待端口就绪（最多 30 秒）
    const ready = await waitForPort(info.port, 30000, 1000)
    if (ready && this.processes.has(name)) {
      info.status = 'running'
      info.startTime = new Date().toISOString()
      this.restartCounts.delete(name)
      this.emitStatus(name)
      return true
    }

    // 未就绪：保留进程继续启动，标记为 starting（前端可继续轮询）
    if (this.processes.has(name)) {
      info.status = 'starting'
      this.emitStatus(name)
    }
    return false
  }

  /** 自动重启（最多 MAX_RESTART_RETRIES 次，间隔 RESTART_INTERVAL_MS） */
  private async tryAutoRestart(name: ServiceName): Promise<void> {
    if (this.intentionalStop.has(name)) return
    const count = (this.restartCounts.get(name) ?? 0) + 1
    this.restartCounts.set(name, count)

    if (count > MAX_RESTART_RETRIES) {
      // 超过重试上限：停止重试，推送 error 事件
      const info = this.services.get(name)
      const payload: ServiceErrorPayload = {
        name,
        message:
          info?.error ||
          `${info?.displayName ?? name} 自动重启失败，已超过最大重试次数 (${MAX_RESTART_RETRIES})`,
        retryCount: count - 1
      }
      console.error(`[service-manager] ${name} auto-restart exhausted:`, payload.message)
      this.emit('service-error', payload)
      return
    }

    console.log(`[service-manager] ${name} auto-restart attempt ${count}/${MAX_RESTART_RETRIES} in ${RESTART_INTERVAL_MS}ms`)
    await new Promise((resolve) => setTimeout(resolve, RESTART_INTERVAL_MS))
    if (this.intentionalStop.has(name)) return

    const info = this.services.get(name)
    if (!info) return
    info.status = 'starting'
    info.error = undefined
    this.emitStatus(name)
    try {
      await this.spawnService(name, info)
    } catch (err) {
      info.status = 'error'
      info.error = err instanceof Error ? err.message : String(err)
      this.emitStatus(name)
      void this.tryAutoRestart(name)
    }
  }

  async stop(name: ServiceName): Promise<boolean> {
    const info = this.services.get(name)
    if (!info) return false

    // 标记主动停止，避免触发自动重启
    this.intentionalStop.add(name)
    this.restartCounts.delete(name)

    const child = this.processes.get(name)
    if (child) {
      try {
        child.removeAllListeners('exit')
        child.removeAllListeners('error')
        const exited = new Promise<boolean>((resolve) => {
          child.once('exit', () => resolve(true))
          setTimeout(() => {
            try {
              child.kill('SIGKILL')
            } catch {
              // ignore
            }
            resolve(true)
          }, 5000)
        })
        try {
          child.kill('SIGTERM')
        } catch {
          // ignore
        }
        await exited
      } catch (err) {
        console.warn(`[service-manager] stop ${name} kill failed:`, err)
      } finally {
        this.processes.delete(name)
        this.lastCpuSample.delete(name)
      }
    }

    info.status = 'stopped'
    info.pid = undefined
    info.error = undefined
    info.cpuUsage = undefined
    info.memoryUsage = undefined
    info.startTime = undefined
    this.emitStatus(name)
    return true
  }

  async restart(name: ServiceName): Promise<boolean> {
    await this.stop(name)
    // 短暂等待端口释放
    await new Promise((resolve) => setTimeout(resolve, 500))
    this.intentionalStop.delete(name)
    return this.start(name)
  }

  async checkEnvironment(): Promise<ServiceEnvCheck> {
    const result = await verifyAll()
    return { openclaw: result.openclaw, n8n: result.n8n, mcp: result.mcp }
  }

  async install(name: ServiceName, onProgress?: (percent: number) => void): Promise<boolean> {
    const info = this.services.get(name)
    if (!info) return false
    try {
      const { download } = await import('./runtime-downloader')
      const ok = await download(name, (progress) => {
        onProgress?.(progress.percent)
      })
      if (!ok) {
        info.status = 'error'
        info.error = '运行时下载失败'
        this.emitStatus(name)
        return false
      }
      // 下载成功后自动启动
      return await this.start(name)
    } catch (err) {
      info.status = 'error'
      info.error = err instanceof Error ? err.message : String(err)
      this.emitStatus(name)
      return false
    }
  }

  async startAll(): Promise<void> {
    await Promise.all([this.start('openclaw'), this.start('n8n'), this.start('mcp')])
  }

  async stopAll(): Promise<void> {
    await Promise.all([this.stop('openclaw'), this.stop('n8n'), this.stop('mcp')])
  }

  /** 统一发送 status-changed 事件 */
  private emitStatus(name: ServiceName): void {
    const info = this.services.get(name)
    if (!info) return
    this.emit('status-changed', name, info.status, info)
  }
}
