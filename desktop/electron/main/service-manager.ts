// 本地服务管理器 - 管理 OpenClaw / N8N / MCP Gateway 三个本地服务进程
//
// 实现说明（Task 16）：
// - 三个服务均通过 child_process.spawn 启动子进程
// - 启动命令可配置（SERVICE_COMMANDS），按候选命令依次尝试
// - 每秒采样 CPU/内存（Windows: PowerShell Get-Process / Linux: /proc/<pid>/stat）
// - 异常退出自动重启（最多 3 次，间隔 5 秒），超过后 emit 'service-error'
// - 状态变更 emit 'status-changed'，由主进程入口转发到渲染进程

import { EventEmitter } from 'node:events'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createConnection } from 'node:net'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { app } from 'electron'
import type {
  ServiceName,
  ServiceStatus,
  ServiceInfo,
  ServiceEnvCheck,
  ServiceErrorPayload
} from '../shared/types'
import { resolve, verifyAll, getServiceVersionGap } from './runtime-resolver'
import treeKill from 'tree-kill'
import { getRuntimeRoot } from './runtime-config'

interface ServiceDef {
  displayName: string
  port: number
}

const SERVICE_DEFS: Record<ServiceName, ServiceDef> = {
  // 与 manifest 中 openclaw.port 保持一致；如实际运行时动态分配端口，可改为读取 manifest
  openclaw: { displayName: 'OpenClaw', port: 8080 },
  n8n: { displayName: 'N8N', port: 5678 },
  mcp: { displayName: 'MCP Gateway', port: 3100 },
  hermes: { displayName: 'Hermes Agent', port: 8642 }
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
  MCP_HOST: '127.0.0.1',
  // MCP Gateway 是协议转换器，必须知道后端 SSE 服务器地址
  // 默认指向本地 OpenClaw 的 MCP SSE 端点；与 SERVICE_DEFS.openclaw.port 保持一致
  MCP_SERVER_URL: `http://127.0.0.1:${SERVICE_DEFS.openclaw.port}/api/mcp/sse`
}

/**
 * Hermes API Server Key（生成并持久化到 userData）
 * - 生产环境不再依赖外部 process.env.HERMES_API_SERVER_KEY（此前从未注入导致 Hermes 永远无法启动）
 * - 首次启动生成随机 key 并写入 userData/hermes-server-key，后续启动复用，保证前后端一致
 */
function getOrCreateHermesServerKey(): string {
  try {
    const keyFile = path.join(app.getPath('userData'), 'hermes-server-key')
    if (fs.existsSync(keyFile)) {
      const existing = fs.readFileSync(keyFile, 'utf-8').trim()
      if (existing) return existing
    }
    const key = 'shentong-' + crypto.randomBytes(24).toString('hex')
    fs.mkdirSync(path.dirname(keyFile), { recursive: true })
    fs.writeFileSync(keyFile, key, 'utf-8')
    return key
  } catch (err) {
    console.error('[service-manager] generate hermes server key failed:', err)
    return 'shentong-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
  }
}

/**
 * Hermes 数据目录
 * - 固定指向 userData/hermes-home，避免使用 %LOCALAPPDATA%\\hermes（该目录可能残留损坏的
 *   hermes-agent 链接/ACL，导致 Hermes 启动时 banner 的 git 探测抛 PermissionError 直接崩溃）
 */
function getHermesHome(): string {
  return path.join(app.getPath('userData'), 'hermes-home')
}

/** Hermes 子进程环境变量（每次启动实时构建，确保 HERMES_HOME 目录已创建） */
function buildHermesEnv(): NodeJS.ProcessEnv {
  const key = getOrCreateHermesServerKey()
  const home = getHermesHome()
  try {
    fs.mkdirSync(home, { recursive: true })
  } catch (err) {
    console.warn('[service-manager] mkdir hermes-home failed:', err)
  }
  return {
    ...process.env,
    PORT: String(SERVICE_DEFS.hermes.port),
    HERMES_HOME: home,
    HERMES_API_SERVER_KEY: key,
    // K1 修复：Hermes 进程实际读取的环境变量名是 CUSTOM_API_KEY，
    // 需将 HERMES_API_SERVER_KEY 映射到 CUSTOM_API_KEY，否则 spawnService 中的检查永远失败
    CUSTOM_API_KEY: key,
    MCP_BACKEND_URL: 'http://127.0.0.1:' + SERVICE_DEFS.mcp.port
  }
}


/** OpenClaw 数据目录（状态/配置隔离，避免写入默认 ~/.openclaw 导致权限或路径冲突） */
function getOpenClawHome(): string {
  return path.join(app.getPath('userData'), 'openclaw-home')
}

/** OpenClaw 子进程环境变量（每次启动实时构建，确保 OPENCLAW_HOME 目录已创建） */
function buildOpenClawEnv(): NodeJS.ProcessEnv {
  const home = getOpenClawHome()
  try {
    fs.mkdirSync(home, { recursive: true })
  } catch (err) {
    console.warn('[service-manager] mkdir openclaw-home failed:', err)
  }
  return {
    ...process.env,
    OPENCLAW_HOME: home
  }
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
      // M3 修复：wmic 在 Windows 11 24H2+ 已被移除，改用 PowerShell Get-Process
      // 获取 UserProcessorTime + TotalProcessorTime + WorkingSet64
      execFile(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command", `Get-Process -Id ${pid} | Select-Object UserProcessorTime,TotalProcessorTime,WorkingSet64 | ConvertTo-Json`],
        { windowsHide: true, timeout: 3000 },
        (err, stdout) => {
          if (err || !stdout) return resolve(null)
          try {
            const data = JSON.parse(stdout.trim())
            // PowerShell 返回的时间格式为 "00:00:00.1234567"（TimeSpan）
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
        }
      )
    } else {
      // Linux: /proc/<pid>/stat
      execFile('cat', [`/proc/${pid}/stat`], { timeout: 2000 }, (err, stdout) => {
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
  /** 标记已触发过自动安装（避免 start→install→start 递归） */
  private autoInstallAttempted: Set<ServiceName> = new Set()
  /** 上一次 CPU 采样（用于差值计算 CPU%） */
  private lastCpuSample: Map<ServiceName, { time: number; cpuMs: number }> = new Map()
  /** metrics 采样定时器 */
  private metricsTimer: NodeJS.Timeout | null = null
  /** 各服务最近一次启动的子进程输出（stdout+stderr 尾部），用于失败时展示真实原因 */
  private serviceOutputs: Map<ServiceName, string> = new Map()
  /** n8n 原生依赖修复标记（一次运行内最多自动修复一次，重新下载后重置） */
  private n8nRepairAttempted = false
  /** MCP 依赖链自愈冷却时间戳 */
  private lastMcpRetryTs = 0

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

  /** 追加子进程输出（滚动保留尾部，供失败时展示真实原因） */
  private appendServiceOutput(name: ServiceName, text: string): void {
    const prev = this.serviceOutputs.get(name) ?? ''
    this.serviceOutputs.set(name, (prev + text).slice(-6000))
  }

  private getServiceOutput(name: ServiceName): string {
    return this.serviceOutputs.get(name) ?? ''
  }

  private clearServiceOutput(name: ServiceName): void {
    this.serviceOutputs.delete(name)
  }

  /** 结束整个子进程树（Windows shell:true 下 kill 只杀 cmd.exe，node 子进程会成孤儿继续占用端口） */
  private killProcessTree(pid: number | undefined): Promise<void> {
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

  /** 启动每秒 metrics 采样 */
  private startMetricsSampler(): void {
    if (this.metricsTimer) return
    this.metricsTimer = setInterval(() => {
      void this.sampleAllMetrics()
      void this.healDependencyChain()
    }, 1000)
    // 不阻止进程退出
    if (typeof this.metricsTimer.unref === 'function') {
      this.metricsTimer.unref()
    }
  }

  /**
   * 依赖链自愈：MCP Gateway 依赖 OpenClaw 的 SSE 后端。
   * mcp-gateway 在后端不可达时会直接退出（code=1）且自身不重试，
   * 因此当 OpenClaw 已就绪而 MCP 处于错误态时自动重新拉起（带冷却避免空转）。
   */
  private healDependencyChain(): void {
    const openclaw = this.services.get('openclaw')
    const mcp = this.services.get('mcp')
    if (!openclaw || !mcp) return
    if (openclaw.status !== 'running') return
    if (mcp.status === 'running' || mcp.status === 'starting') return
    if (this.intentionalStop.has('mcp')) return
    const now = Date.now()
    if (now - this.lastMcpRetryTs < 15000) return
    this.lastMcpRetryTs = now
    console.log('[service-manager] OpenClaw 已就绪但 MCP 未运行，自动重试启动 MCP Gateway')
    void this.start('mcp')
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

    // 旧版本 App 残留的 userData 运行时（服务版本 < 内置清单版本）：直接重装，
    // 避免用旧版/损坏的运行时光启动（这正是“卸载重装后仍报运行时失败”的根因之一）
    if (!this.autoInstallAttempted.has(name)) {
      const gap = getServiceVersionGap(name)
      if (gap !== null && gap < 0) {
        console.log(`[service-manager] ${name} userData 运行时版本过旧（版本差 ${gap}），自动重装后再启动`)
        this.autoInstallAttempted.add(name)
        try {
          const reinstalled = await this.install(name)
          if (reinstalled) return await isPortListening(info.port)
        } finally {
          this.autoInstallAttempted.delete(name)
        }
      }
    }

    try {
      const result = await this.spawnService(name, info)

      // n8n 原生依赖缺失修复：sqlite3 NAPI 预编译库缺失时 n8n 启动即退出（code=1）
      if (!result && name === 'n8n' && !this.n8nRepairAttempted) {
        const binding = path.join(getRuntimeRoot(), 'n8n', 'node_modules', 'sqlite3', 'build', 'Release', 'node_sqlite3.node')
        const output = this.getServiceOutput(name)
        if (
          !fs.existsSync(binding) ||
          /SQLite package has not been found|DriverPackageNotInstalledError|initializing DB/i.test(output)
        ) {
          this.n8nRepairAttempted = true
          console.log('[service-manager] n8n 启动失败且 sqlite3 原生依赖缺失，开始自动修复...')
          const repaired = await this.repairN8nNativeDeps()
          if (repaired) {
            console.log('[service-manager] n8n 原生依赖修复完成，自动重试启动')
            const retry = await this.spawnService(name, info)
            if (retry) return true
          }
        }
      }

      // start 失败且未触发过自动安装：尝试 install（install 内部会 download + start）
      if (!result && !this.autoInstallAttempted.has(name)) {
        this.autoInstallAttempted.add(name)
        console.log(`[service-manager] ${name} start failed, attempting auto-install...`)
        try {
          const installed = await this.install(name)
          this.autoInstallAttempted.delete(name)
          // install 成功后自动重试 start（install 内部已调用 start，此处再检查端口确认）
          if (installed) {
            return await isPortListening(info.port)
          }
        } catch (installErr) {
          console.error(`[service-manager] ${name} auto-install failed:`, installErr)
          this.autoInstallAttempted.delete(name)
          info.status = 'error'
          info.error = installErr instanceof Error ? installErr.message : String(installErr)
          this.emitStatus(name)
        }
      }
      return result
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

    // Hermes 必须配置 CUSTOM_API_KEY（由 getOrCreateHermesServerKey 自动生成）
    if (name === 'hermes') {
      const customApiKey = buildHermesEnv().CUSTOM_API_KEY
      if (!customApiKey) {
        info.status = 'error'
        info.error = 'Hermes Agent 启动失败：CUSTOM_API_KEY 未设置'
        this.emitStatus(name)
        return false
      }
    }

    const resolved = resolve(name)
    if (!resolved) {
      info.status = 'error'
      info.error = '运行时未安装'
      this.emitStatus(name)
      return false
    }

    // 合并环境变量：各服务专用 ENV 优先于 resolved.env
    const env =
      name === 'n8n' ? { ...resolved.env, ...N8N_ENV } :
      name === 'mcp' ? { ...resolved.env, ...MCP_ENV } :
      name === 'hermes' ? { ...resolved.env, ...buildHermesEnv() } :
      name === 'openclaw' ? { ...resolved.env, ...buildOpenClawEnv() } :
      resolved.env

    // 各服务启动参数：
    // - openclaw：WebSocket Gateway 前台运行（openclaw 顶层没有 --port，必须用 gateway run --port）
    // - hermes：headless backend server（serve），监听 127.0.0.1:<port>
    const spawnArgs =
      name === 'openclaw'
        ? ['gateway', 'run', '--port', String(info.port), '--bind', 'loopback', '--auth', 'none', '--force', '--allow-unconfigured']
        : name === 'hermes'
          ? ['serve', '--port', String(info.port), '--host', '127.0.0.1', '--skip-build']
          : resolved.args

    // 每次启动前清空上一次的输出缓存
    this.clearServiceOutput(name)

    let child: ChildProcess
    try {
      // Windows 下 .cmd/.bat 必须经 cmd.exe 执行；路径可能含空格/中文，
      // 用双引号包裹命令路径，避免 cmd.exe 将路径截断为不存在的命令
      const isCmdScript = process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolved.cmd)
      // 路径含空格/中文时同样加引号（cmd.exe 会按空格截断命令路径）
      const needsQuote = isCmdScript || (process.platform === 'win32' && /\s/.test(resolved.cmd))
      const spawnTarget = needsQuote ? '"' + resolved.cmd + '"' : resolved.cmd
      child = spawn(spawnTarget, spawnArgs, {
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
    let mcpOutputReady = false
    let mcpReadyResolve: (() => void) | null = null
    const mcpReadyPromise = name === 'mcp' ? new Promise<void>((resolve) => { mcpReadyResolve = resolve }) : null
    const mcpReadyMarkers = ['MCP Gateway is running', 'SSE backend connected']

    const checkMcpOutputReady = (text: string) => {
      if (name !== 'mcp' || mcpOutputReady || !mcpReadyResolve) return
      if (mcpReadyMarkers.some((marker) => text.includes(marker))) {
        mcpOutputReady = true
        mcpReadyResolve()
      }
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      if (text.trim()) console.log(`[${name}] ${text.trim()}`)
      this.appendServiceOutput(name, text)
      checkMcpOutputReady(text)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      if (text.trim()) console.warn(`[${name}] ${text.trim()}`)
      this.appendServiceOutput(name, text)
      checkMcpOutputReady(text)
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
      // 只有真正进入 running 后的异常退出才自动重启；启动阶段（starting）失败直接报错，
      // 避免“反复重启 + 持久通知”骚扰用户（见 review_service_manager_2026-07-25.md）
      const wasRunning = info.status === 'running'
      info.pid = undefined
      info.cpuUsage = undefined
      info.memoryUsage = undefined

      // 主动停止：不重启
      if (this.intentionalStop.has(name)) {
        info.status = 'stopped'
        this.emitStatus(name)
        return
      }

      // 真实失败原因：子进程 stdout/stderr 尾部（如 n8n sqlite3 缺失、openclaw 端口冲突等）
      const output = this.getServiceOutput(name).trim()
      const detail = output ? `\n${output.slice(-1500)}` : ''

      // 非主动退出：运行中异常退出才自动重启；启动阶段失败给出可操作的错误提示
      if (wasRunning) {
        info.status = 'error'
        info.error =
          name === 'mcp'
            ? `MCP Gateway 异常退出 (code=${code})：需要可用的 SSE 后端（OpenClaw 或云端 MCP 服务），请确认服务链已就绪${detail}`
            : `进程异常退出 (code=${code} signal=${signal})${detail}`
        this.emitStatus(name)
        void this.tryAutoRestart(name)
      } else {
        info.status = 'error'
        info.error =
          name === 'mcp'
            ? `MCP Gateway 启动失败：无法连接 SSE 后端（code=${code}），请先启动 OpenClaw 或配置云端 MCP 服务${detail}`
            : `${info.displayName} 启动失败（code=${code} signal=${signal}），可点击“修复”重新安装运行时${detail}`
        this.emitStatus(name)
      }
    })

    this.processes.set(name, child)
    info.pid = child.pid

    // 等待服务就绪：N8N 需要更长时间，MCP 同时监听 stdout/stderr 就绪标记
    const portTimeoutMs = name === 'n8n' ? 90000 : 30000

    let ready = false
    if (name === 'mcp') {
      const mcpTimeoutMs = 15000
      const result = await Promise.race([
        waitForPort(info.port, mcpTimeoutMs, 1000),
        mcpReadyPromise!.then(() => 'mcp-output-ready' as const)
      ])
      ready =
        result === true ||
        result === 'mcp-output-ready' ||
        (this.processes.has(name) && !child.killed)
    } else {
      ready = await waitForPort(info.port, portTimeoutMs, 1000)
    }

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
        // 结束整个进程树：Windows 下 spawn(shell:true) 的 child 只是 cmd.exe，
        // kill 它只会留下 node 孤儿进程继续占用端口，导致下次启动失败
        await this.killProcessTree(child.pid)
      } catch (err) {
        console.warn(`[service-manager] stop ${name} kill failed:`, err)
      } finally {
        this.processes.delete(name)
        this.lastCpuSample.delete(name)
      }
    }
    this.clearServiceOutput(name)

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
    return { openclaw: result.openclaw, n8n: result.n8n, mcp: result.mcp, hermes: result.hermes }
  }

  async install(name: ServiceName, onProgress?: (percent: number) => void): Promise<boolean> {
    const info = this.services.get(name)
    if (!info) return false

    // install 前先停止服务，避免进程占用文件
    await this.stop(name)

    // 删除旧运行时目录，避免旧文件冲突
    const runtimeDir = path.join(getRuntimeRoot(), name)
    try {
      fs.rmSync(runtimeDir, { recursive: true, force: true })
    } catch (err) {
      console.warn(`[service-manager] rm old runtime dir for ${name} failed:`, err)
    }

    try {
      const { download, getLastDownloadError } = await import('./runtime-downloader')
      const ok = await download(name, (progress) => {
        onProgress?.(progress.percent)
        // 推送安装进度事件
        this.emit('install-progress', {
          name,
          percent: progress.percent,
          speedKBs: progress.speedKBs,
          etaSec: progress.etaSec
        })
      })
      if (!ok) {
        info.status = 'error'
        info.error = getLastDownloadError(name) ?? '运行时下载失败'
        this.emitStatus(name)
        return false
      }
      // 下载成功：重置原生依赖修复标记
      if (name === 'n8n') {
        this.n8nRepairAttempted = false
      }
      // 下载后补齐原生依赖（n8n sqlite3 NAPI 预编译库），缺失时 n8n 启动即退出
      if (name === 'n8n') {
        await this.repairN8nNativeDeps()
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

  /**
   * 修复 N8N 原生依赖：sqlite3 的 NAPI 预编译库（node_sqlite3.node）缺失时，
   * n8n 启动即退出（code=1, "SQLite package has not been found installed"）。
   * 通过 prebuild-install 从 GitHub 下载 NAPI 预编译库（与 node 版本无关）。
   */
  private async repairN8nNativeDeps(): Promise<boolean> {
    const n8nDir = path.join(getRuntimeRoot(), 'n8n')
    const binding = path.join(n8nDir, 'node_modules', 'sqlite3', 'build', 'Release', 'node_sqlite3.node')
    if (fs.existsSync(binding)) return true

    const nodeExe = path.join(n8nDir, 'node', process.platform === 'win32' ? 'node.exe' : 'node')
    const prebuildBin = path.join(n8nDir, 'node_modules', 'prebuild-install', 'bin.js')
    const sqliteDir = path.join(n8nDir, 'node_modules', 'sqlite3')
    if (!fs.existsSync(nodeExe) || !fs.existsSync(prebuildBin) || !fs.existsSync(sqliteDir)) {
      console.warn('[service-manager] n8n 原生依赖修复前置条件不满足（运行时不完整）')
      return false
    }

    console.log('[service-manager] n8n sqlite3 原生依赖缺失，正在下载 NAPI 预编译库（需要网络）...')
    try {
      await new Promise<void>((resolve) => {
        const child = spawn(nodeExe, [prebuildBin, '-r', 'napi'], {
          cwd: sqliteDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true
        })
        let out = ''
        const done = () => resolve()
        child.stdout?.on('data', (d: Buffer) => { out += d.toString() })
        child.stderr?.on('data', (d: Buffer) => { out += d.toString() })
        child.on('close', (code) => {
          if (code !== 0) console.warn(`[service-manager] prebuild-install exit=${code} output=${out.slice(-800)}`)
          done()
        })
        child.on('error', (err) => {
          console.warn('[service-manager] prebuild-install 启动失败:', err)
          done()
        })
        const timer = setTimeout(() => {
          console.warn('[service-manager] n8n 原生依赖下载超时，放弃自动修复')
          void this.killProcessTree(child.pid)
          done()
        }, 150000)
        if (typeof timer.unref === 'function') timer.unref()
      })
    } catch (err) {
      console.warn('[service-manager] n8n 原生依赖下载失败:', err)
      return false
    }

    const ok = fs.existsSync(binding)
    console.log(`[service-manager] n8n sqlite3 原生依赖修复${ok ? '成功' : '失败'}`)
    return ok
  }

  // K2 修复：四个服务存在启动依赖链（MCP 依赖 OpenClaw 端口就绪，Hermes 依赖 MCP 端口就绪），
  // 并行启动会导致依赖方在所需端口未就绪时启动失败，改为按依赖顺序串行启动
  async startAll(): Promise<void> {
    await this.start('openclaw')
    await this.start('n8n')
    await this.start('mcp')
    await this.start('hermes')
  }

  async stopAll(): Promise<void> {
    await Promise.all([this.stop('openclaw'), this.stop('n8n'), this.stop('mcp'), this.stop('hermes')])
  }

  /** 统一发送 status-changed 事件 */
  private emitStatus(name: ServiceName): void {
    const info = this.services.get(name)
    if (!info) return
    this.emit('status-changed', name, info.status, info)
  }
}
