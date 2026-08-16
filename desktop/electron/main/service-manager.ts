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
  ServiceErrorPayload,
  ResolvedRuntime
} from '../shared/types'
import { resolve, verifyAll, getServiceVersionGap, isServiceContentStale } from './runtime-resolver'
import {
  ensureVideoClawConfig,
  syncVideoClawConfig,
  resolveVideoClawBackendDir,
  DEFAULT_VIDEO_CLAW_MODELS,
  fetchPlatformModels,
  pickPlatformModels,
} from './video-claw-config'
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
  hermes: { displayName: 'Hermes Agent', port: 8642 },
  'video-claw': { displayName: 'ST-Claw', port: 8000 }
}

/** AI 视频前端端口（iframe 加载地址；就绪判定需同时等后端与前端） */
const VIDEO_CLAW_FRONTEND_PORT = 3000

/** N8N API Key（生成并持久化到 userData/n8n-api-key，供本地 REST API 导入工作流） */
function getOrCreateN8nApiKey(): string {
  try {
    const keyFile = path.join(app.getPath('userData'), 'n8n-api-key')
    if (fs.existsSync(keyFile)) {
      const existing = fs.readFileSync(keyFile, 'utf-8').trim()
      if (existing) return existing
    }
    const key = 'st-' + require('node:crypto').randomBytes(24).toString('hex')
    fs.mkdirSync(path.dirname(keyFile), { recursive: true })
    fs.writeFileSync(keyFile, key, 'utf-8')
    return key
  } catch (err) {
    console.error('[service-manager] generate n8n api key failed:', err)
    return 'st-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
  }
}

/** N8N 子进程环境变量（每次启动实时构建，注入 API Key 与数据目录） */
function buildN8nEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    N8N_HOST: '127.0.0.1',
    N8N_PORT: '5678',
    N8N_PROTOCOL: 'http',
    N8N_EDITOR_BASE_URL: 'http://127.0.0.1:5678',
    N8N_DIAGNOSTICS_ENABLED: 'false',
    GENERIC_TIMEZONE: 'Asia/Shanghai',
    // 本地 REST API 鉴权（工作流导入）
    N8N_API_KEY: getOrCreateN8nApiKey(),
    // 工作流数据目录固定到 userData，避免默认 %USERPROFILE%\.n8n 残留
    N8N_USER_FOLDER: path.join(app.getPath('userData'), 'n8n-data')
  }
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

/** MCP Gateway SSE 桥脚本路径（打包后位于 resources/mcp/，开发环境位于 desktop/resources/mcp/） */
function getMcpBridgeScriptPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'mcp', 'mcp-gateway-server.js')
  }
  return path.join(process.cwd(), 'resources', 'mcp', 'mcp-gateway-server.js')
}

export const ST_API_BASE = 'https://zt.shentongapi.cn/api'

/** OpenClaw 子进程环境变量（每次启动实时构建，确保 OPENCLAW_HOME 目录已创建） */
function buildOpenClawEnv(): NodeJS.ProcessEnv {
  const home = getOpenClawHome()
  try {
    fs.mkdirSync(home, { recursive: true })
  } catch (err) {
    console.warn('[service-manager] mkdir openclaw-home failed:', err)
  }
  // 本地工具卡注入：Hermes 运行时路径 + N8N Key + 记账上下文文件路径
  // （OpenClaw 的 hermes-agent / n8n-run-workflow skill 脚本读取这些环境变量）
  const hermes = resolve('hermes')
  const hermesRoot = hermes?.cmd ? path.dirname(hermes.cmd) : ''
  const accountingDir = path.join(app.getPath('userData'), 'openclaw-chat')
  try {
    fs.mkdirSync(accountingDir, { recursive: true })
  } catch (err) {
    console.warn('[service-manager] mkdir openclaw-chat failed:', err)
  }
  return {
    ...process.env,
    OPENCLAW_HOME: home,
    HERMES_NODE: hermesRoot ? path.join(hermesRoot, 'node', 'node.exe') : '',
    HERMES_ENTRY: hermesRoot ? path.join(hermesRoot, 'node_modules', 'hermes-agent', 'bin', 'hermes.js') : '',
    HERMES_PYTHON: hermesRoot ? path.join(hermesRoot, 'python', 'python.exe') : '',
    HERMES_HOME: getHermesHome(),
    N8N_API_KEY: getOrCreateN8nApiKey(),
    ST_API_BASE,
    ST_ACCOUNTING_FILE: path.join(accountingDir, 'current-accounting.json'),
    ST_AUTH_FILE: path.join(accountingDir, 'auth.json'),
  }
}

/** 云端 llm-proxy OpenAI 兼容网关（OpenClaw 的 openai provider 指向这里；供应商 Key 在服务器，用户零配置） */
const OPENCLAW_LLM_PROXY_BASE = 'https://zt.shentongapi.cn/api/llm-proxy/v1'

/** 用户 llm-proxy 静态 Key（登录后由主进程注入；空则 OpenClaw 不写 apiKey，聊天被 401 拦截） */
let openclawProxyKey = ''

/** 用户当前首选对话模型（桌面端对话页同步；写入 OpenClaw agents.defaults.model，新会话默认模型） */
let openclawPreferredModel = ''

/** VideoClaw 子进程环境变量：注入 llm-proxy 网关地址/静态 Key 与云端记账上下文 */
function buildVideoClawEnv(): NodeJS.ProcessEnv {
  const accountingDir = path.join(app.getPath('userData'), 'openclaw-chat')
  return {
    ...process.env,
    VIDEO_CLAW_LLM_PROXY_BASE: OPENCLAW_LLM_PROXY_BASE,
    VIDEO_CLAW_PROXY_KEY: openclawProxyKey || '',
    ST_API_BASE,
    ST_ACCOUNTING_FILE: path.join(accountingDir, 'current-accounting.json'),
    ST_AUTH_FILE: path.join(accountingDir, 'auth.json'),
  }
}

/** ST-Claw 启动前自动生成 config.yaml（未安装运行时/未登录时跳过，不抛错；llmproxy.models=管理后台启用模型） */
async function ensureVideoClawConfigSafe(): Promise<void> {
  if (!openclawProxyKey) return
  try {
    const resolved = resolve('video-claw')
    if (!resolved) return
    const backendDir = resolveVideoClawBackendDir(path.dirname(resolved.cmd))
    const platformModels = await fetchPlatformModels(OPENCLAW_LLM_PROXY_BASE, openclawProxyKey)
    const opts = pickPlatformModels(platformModels, DEFAULT_VIDEO_CLAW_MODELS)
    syncVideoClawConfig(backendDir, {
      llmProxyBaseUrl: OPENCLAW_LLM_PROXY_BASE,
      apiKey: openclawProxyKey,
      ...opts,
      platformModels: platformModels ?? undefined,
    })
    console.log('[service-manager] video-claw config.yaml 已就绪: ' + backendDir)
  } catch (err) {
    console.warn('[service-manager] video-claw config 生成失败（忽略）: ' + (err instanceof Error ? err.message : String(err)))
  }
}

/**
 * OpenClaw 启动前配置注入（写入 <OPENCLAW_HOME>/.openclaw/openclaw.json）：
 * - gateway.http.endpoints.chatCompletions.enabled: 开启 OpenAI 兼容对话端点（L0 探针验证 404→401）
 * - skills.load.extraDirs: 注入内置本地工具卡（hermes-agent / n8n-run-workflow）
 * 合并写入，保留用户已有配置。
 */
function deepMergeConfig(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    const b = out[k]
    if (b && typeof b === 'object' && !Array.isArray(b) && v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMergeConfig(b as Record<string, unknown>, v as Record<string, unknown>)
    } else {
      out[k] = v
    }
  }
  return out
}


/** 五层协作方法论系统提示（AGENTS.md + SOUL.md）写入 OpenClaw workspace */
function ensureOpenClawWorkspace(): void {
  try {
    const workspaceDir = path.join(getOpenClawHome(), '.openclaw', 'workspace')
    const agentsPath = path.join(workspaceDir, 'AGENTS.md')
    const soulPath = path.join(workspaceDir, 'SOUL.md')
    // 文件已存在则不覆盖（用户可自行定制 Agent 行为）
    if (fs.existsSync(agentsPath) && fs.existsSync(soulPath)) {
      console.log('[service-manager] OpenClaw workspace 已存在，跳过写入（保留用户自定义）')
      return
    }
    fs.mkdirSync(workspaceDir, { recursive: true })

    const agentsMd = `# AGENTS.md — 深瞳AI 协作方法论

## 五层架构

你是深瞳AI 桌面端的交互层 Agent（OpenClaw）。系统由五层组成：

| 层级 | 组件 | 职责 |
|------|------|------|
| 交互层（你） | OpenClaw | 接收用户输入、意图路由、终审、展示 |
| 编排层 | HermesAgent | 任务分解、子代理并行调度、汇总初审 |
| 执行层 | N8N | 确定性操作（发邮件、查数据库、调API） |
| 工具层 | MCP | 工具标准化接入、统一协议 |
| 知识层 | 知识库 | 业务文档、规则、模板、历史案例 |

## 路由规则（必须遵守）

收到用户消息后，按以下顺序判断：

1. **闲聊/简单问答** → 你直接回答，不调用任何工具
2. **确定性操作**（发邮件、查数据、同步文件、生成报表等明确操作指令）
   → 调用 n8n-run-workflow 工具
3. **复杂任务**（多步骤、需要分析/推理/创作、需求模糊）
   → 调用 hermes-agent 工具
4. **涉及业务知识/规则/模板/历史案例/行业术语** → 先调用 knowledge-query 查知识库，再回答

## 知识库检索（必须遵守）

- 检索范围由桌面端按当前会话写入（knowledge-scope.json，随工具环境注入），调用 knowledge-query 时：
  - 默认不传 --mode，脚本自动按会话范围检索
  - 也可显式指定：--mode global（全局搜索）或 --mode kb --kb-id N（指定知识库）
- 查知识库时调用 knowledge-query，用检索结果回答并注明出处

## 审核流程（必须遵守）

### 你负责终审（三级审核）
- 收到 Hermes 或 N8N 返回的结果后，必须检查：
  - 安全合规：无敏感信息泄露（银行卡/身份证号）
  - 完整性：结果是否覆盖了用户需求
  - 表达清晰：格式是否友好
- 不通过 → 要求重做或自行补充修正
- 通过 → 格式化后展示给用户

### 产物展示规范
- 先给一句话总结
- 再给关键数据/摘要（内联文本）
- 大文件/报告用附件卡片（可预览可下载）
- 标注数据来源和模板来源

### 异常降级
- Hermes 不可用 → 你自行处理简单部分，告知用户完整功能受限
- N8N 不可用 → 告知用户该操作暂时不可用
- 知识库不可用 → 标注"未参考知识库"，继续执行
- 任何失败都要透明告知用户，不静默吞错
`

    const soulMd = `# SOUL.md — 深瞳AI Agent 行为准则

## 核心原则

1. **系统性胜过临时性** — 遵循五层架构和六步流程，不靠猜测
2. **透明性** — 任何路由决策、失败降级都要让用户知道
3. **证据胜过声明** — 用工具结果验证，而非"我觉得可以了"
4. **安全优先** — 敏感信息不外泄，操作前确认

## 六步工作流（复杂任务必须遵循）

1. 你接收用户输入 → 判断意图 → 路由
2. Hermes 分解任务 → 分配子代理
3. 子代理并行执行 → 通过 MCP 调工具/知识库/N8N
4. N8N 执行工作流 → 自检 → 返回结果
5. Hermes 汇总 → 交叉验证 → 初审
6. 你终审 → 格式化 → 展示给用户

## 什么时候调 Hermes

- 多步骤、跨领域的复杂任务
- 需要分析、推理、创作的内容
- 需求模糊，需要拆解澄清

## 什么时候调 N8N

- 明确的确定性操作（发邮件/查数据/发消息/同步）
- 需要按流程执行的固定动作
- 用户明确要求"执行/发送/提交"

## 什么时候查知识库

- 涉及业务规则、政策、模板、历史案例
- 用户提到行业术语、公司内部流程
- 回答前不确定，先查证再回答
`

    if (!fs.existsSync(agentsPath)) fs.writeFileSync(agentsPath, agentsMd, 'utf-8')
    if (!fs.existsSync(soulPath)) fs.writeFileSync(soulPath, soulMd, 'utf-8')
    console.log('[service-manager] OpenClaw workspace 系统提示已注入: ' + workspaceDir)
  } catch (err) {
    console.warn('[service-manager] ensureOpenClawWorkspace failed:', err)
  }
}

function ensureOpenClawConfig(): void {
  try {
    const cfgPath = path.join(getOpenClawHome(), '.openclaw', 'openclaw.json')
    const skillsDir = app.isPackaged
      ? path.join(process.resourcesPath, 'openclaw', 'skills')
      : path.join(process.cwd(), 'resources', 'openclaw', 'skills')
    // 内置技能目录可能未随包携带（打包遗漏或用户移动目录）：目录不存在时清空 extraDirs，
    // 避免 openclaw.json 残留失效路径导致 OpenClaw 启动校验失败（Invalid config）
    const skillsLoad: Record<string, unknown> = fs.existsSync(skillsDir) ? { extraDirs: [skillsDir] } : { extraDirs: [] }
    const patch: Record<string, unknown> = {
      gateway: { http: { endpoints: { chatCompletions: { enabled: true } } } },
      skills: { load: skillsLoad },
      mcp: { servers: {} },
      // OpenClaw agent 的模型通道指向云端 llm-proxy（强制 openai-completions 协议；apiKey 为用户静态 Key）
      models: {
        providers: {
          openai: {
            baseUrl: OPENCLAW_LLM_PROXY_BASE,
            api: 'openai-completions',
            apiKey: openclawProxyKey,
          },
        },
      },
    }
    // 用户首选对话模型 → OpenClaw 新会话默认模型（旧会话由 WS sessions.patch 写入 modelOverride，
    // 两者配合确保桌面端选择真实生效；不重启不打断进行中的对话，下次启动/重启时落盘）
    if (openclawPreferredModel) {
      patch.agents = {
        defaults: { model: openclawPreferredModel },
      }
    }
    let existing: Record<string, unknown> = {}
    try {
      existing = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
    } catch {
      existing = {}
    }
    const merged = deepMergeConfig(existing, patch)
    // OpenClaw 2026.7+ 的 MCP 配置路径为 mcp.servers；旧版根级 mcpServers 键会导致整份配置校验失败（Invalid config），
    // 合并后将其迁移进 mcp.servers 并删除，保证历史配置可自动修复
    if (merged.mcpServers && typeof merged.mcpServers === 'object') {
      const legacyMcp = merged.mcpServers as Record<string, unknown>
      const existingMcp = (merged.mcp as Record<string, unknown> | undefined) ?? {}
      const existingServers = (existingMcp.servers as Record<string, unknown> | undefined) ?? {}
      merged.mcp = { ...existingMcp, servers: { ...existingServers, ...legacyMcp } }
      delete merged.mcpServers
    }
    if (!openclawProxyKey) {
      const openai = (merged as any)?.models?.providers?.openai
      if (openai && typeof openai === 'object') delete openai.apiKey
    }
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true })
    fs.writeFileSync(cfgPath, JSON.stringify(merged, null, 2), 'utf-8')
    console.log('[service-manager] OpenClaw 配置已注入: ' + cfgPath)
  } catch (err) {
    console.warn('[service-manager] ensureOpenClawConfig failed:', err)
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

/** 等待毫秒 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 是否为 Windows 文件占用类错误（删除/写入/重命名时常见） */
function isLockError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as NodeJS.ErrnoException).code
  return code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY' || code === 'EACCES'
}

/** 删除目录，遇到进程占用（EBUSY/EPERM）时按间隔重试，返回是否成功 */
async function removeDirWithRetry(dir: string, maxAttempts = 20, delayMs = 500): Promise<boolean> {
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

  /**
   * 设置用户 llm-proxy 静态 Key（登录后由主进程调用）：
   * 1) 更新内存 + 立即重写 OpenClaw 配置（models.providers.openai.apiKey）
   * 2) OpenClaw 运行中则重启，让新 Key 生效（避免下次对话 401）
   */
  setOpenClawProxyKey(key: string): void {
    openclawProxyKey = key || ''
    ensureOpenClawConfig()
    ensureVideoClawConfigSafe()
    const info = this.services.get('openclaw')
    if (info && info.status === 'running') {
      console.log('[service-manager] llm-proxy Key 已更新，重启 OpenClaw 使其生效...')
      void this.restart('openclaw')
    }
  }

  /**
   * 同步用户首选对话模型到 OpenClaw 配置（agents.defaults.model，新会话默认模型）。
   * 不重启 OpenClaw（避免打断进行中的对话）；当前会话由 WS sessions.patch 在发送前写入。
   */
  setOpenClawPreferredModel(model: string): void {
    const normalized = (model || '').trim()
    if (!normalized || normalized.startsWith('custom/')) return
    if (openclawPreferredModel === normalized) return
    openclawPreferredModel = normalized
    ensureOpenClawConfig()
    console.log('[service-manager] OpenClaw 首选模型已同步: ' + normalized)
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

  /**
   * 列出可执行文件位于指定目录下的进程 PID（Windows）。
   * 用于找出未被本实例 spawn 跟踪的孤儿进程（旧版 App 残留、手动启动的 n8n 等），
   * 它们持有 node.exe 等文件句柄，导致后续删除/解压写入报 EBUSY。
   */
  private listPidsUnderDir(dir: string): Promise<number[]> {
    return new Promise((resolve) => {
      if (process.platform !== 'win32') {
        resolve([])
        return
      }
      const pattern = path.join(dir, "*")
      const psCmd =
        'Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like "' +
        pattern.replace(/"/g, "") +
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
        }
      )
    })
  }

  /** 强制结束指定 PID 及其进程树（taskkill /F /T，Windows） */
  private killPids(pids: number[]): Promise<void> {
    if (pids.length === 0) return Promise.resolve()
    const args = ['/F', '/T']
    for (const pid of pids) args.push('/PID', String(pid))
    return new Promise((resolve) => {
      execFile('taskkill', args, { windowsHide: true, timeout: 10000 }, () => resolve())
    })
  }

  /**
   * 等待运行时目录完全释放：
   * 1) 结束所有可执行文件位于该服务目录下的进程（含未被跟踪的孤儿进程）
   * 2) 轮询等待服务端口关闭且目录下无进程残留（Windows 句柄释放有延迟）
   */
  private async waitForRuntimeDirReleased(name: ServiceName, timeoutMs = 20000): Promise<void> {
    const dir = path.join(getRuntimeRoot(), name)
    const port = SERVICE_DEFS[name].port
    try {
      const pids = await this.listPidsUnderDir(dir)
      if (pids.length > 0) {
        console.log(
          `[service-manager] ${name} 发现 ${pids.length} 个残留进程占用运行时目录（PID: ${pids.join(", ")}），强制结束`
        )
        await this.killPids(pids)
      }
    } catch (err) {
      console.warn(`[service-manager] ${name} 清理残留进程失败:`, err)
    }
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const listening = await isPortListening(port)
      const leftovers = await this.listPidsUnderDir(dir)
      if (!listening && leftovers.length === 0) return
      await sleep(1000)
    }
    console.warn(`[service-manager] ${name} 运行时目录等待释放超时（${timeoutMs}ms），继续尝试安装`)
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
   * 依赖链自愈：MCP Gateway 依赖 OpenClaw 的 Gateway（WebSocket）后端。
   * 桥进程在 OpenClaw 未就绪时启动会失败退出（code=1）且自身不重试，
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
      const contentStale = isServiceContentStale(name)
      if ((gap !== null && gap < 0) || contentStale) {
        console.log(`[service-manager] ${name} 运行时需重新安装（版本差 ${gap} / 内容指纹过期 ${contentStale}），自动重装后再启动`)
        this.autoInstallAttempted.add(name)
        try {
          const reinstalled = await this.install(name)
          if (reinstalled) return await isPortListening(info.port)
          // 重装失败：直接返回并暴露真实下载错误，
          // 不再回退到宿主机命令（会掩盖问题，例如用系统旧 node 启动 OpenClaw）
          return false
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
          // 安装后仍未就绪：若错误仍是“运行时未安装”，说明运行时已下载但入口解析失败
          //（如解压布局异常/自定义运行时目录不可读），替换为可操作的提示，避免误导用户
          if (info.error === '运行时未安装') {
            info.status = 'error'
            info.error = '运行时已下载但入口文件未找到，请点击“安装/修复运行时”重装，或到「服务」页检查运行时位置'
            this.emitStatus(name)
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

    // MCP Gateway：本地 SSE 桥（不再依赖旧 mcp-gateway 包的远程 SSE 后端）。
    // OpenClaw 2026.7.1 的 MCP 服务为 stdio 模式（openclaw mcp serve），
    // 本应用以 ELECTRON_RUN_AS_NODE 启动内置桥脚本（resources/mcp/mcp-gateway-server.js），
    // 将 OpenClaw 的 stdio MCP 桥接为本地 SSE 端点（默认 127.0.0.1:3100）。
    let resolved: ResolvedRuntime | null = null
    let spawnTarget: string
    let spawnArgs: string[]
    let spawnEnv: NodeJS.ProcessEnv
    let useShell = process.platform === 'win32'

    if (name === 'mcp') {
      const openclaw = resolve('openclaw')
      if (!openclaw) {
        info.status = 'error'
        info.error = 'MCP Gateway 启动失败：OpenClaw 运行时未安装，请先下载/修复 OpenClaw'
        this.emitStatus(name)
        return false
      }
      const bridgeScript = getMcpBridgeScriptPath()
      spawnTarget = process.execPath
      spawnArgs = [
        bridgeScript,
        '--port', String(info.port),
        '--gateway-ws', `ws://127.0.0.1:${SERVICE_DEFS.openclaw.port}`,
        '--openclaw-dir', path.dirname(openclaw.cmd),
        '--openclaw-home', getOpenClawHome(),
      ]
      spawnEnv = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
      useShell = false
    } else {
      resolved = resolve(name)
      if (!resolved) {
        info.status = 'error'
        info.error = '运行时未安装'
        this.emitStatus(name)
        return false
      }

      // 合并环境变量：各服务专用 ENV 优先于 resolved.env
      spawnEnv =
        name === 'n8n' ? { ...resolved.env, ...buildN8nEnv() } :
        name === 'hermes' ? { ...resolved.env, ...buildHermesEnv() } :
        name === 'openclaw' ? { ...resolved.env, ...buildOpenClawEnv() } :
        name === 'video-claw' ? { ...resolved.env, ...buildVideoClawEnv() } :
        resolved.env

      // 各服务启动参数：
      // - openclaw：WebSocket Gateway 前台运行（openclaw 顶层没有 --port，必须用 gateway run --port）
      // - hermes：headless backend server（serve），监听 127.0.0.1:<port>
      // OpenClaw 启动前写入 openclaw.json（开启 OpenAI 兼容端点 + 注入本地工具卡）
      if (name === 'openclaw') {
        ensureOpenClawConfig()
      }
      if (name === 'video-claw') {
        // 等待 config.yaml 写完再启动 ST-Claw（避免 fetchPlatformModels 异步竞态导致进程读到旧/缺失配置）
        await ensureVideoClawConfigSafe()
      }

      spawnArgs =
        name === 'openclaw'
          ? ['gateway', 'run', '--port', String(info.port), '--bind', 'loopback', '--auth', 'none', '--force', '--allow-unconfigured']
          : name === 'hermes'
            ? ['serve', '--port', String(info.port), '--host', '127.0.0.1', '--skip-build']
            : name === 'video-claw'
              ? ['serve']
              : resolved.args

      // Windows 下 .cmd/.bat 必须经 cmd.exe 执行；路径可能含空格/中文，
      // 用双引号包裹命令路径，避免 cmd.exe 将路径截断为不存在的命令
      const isCmdScript = process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolved.cmd)
      // 路径含空格/中文时同样加引号（cmd.exe 会按空格截断命令路径）
      const needsQuote = isCmdScript || (process.platform === 'win32' && /\s/.test(resolved.cmd))
      spawnTarget = needsQuote ? '"' + resolved.cmd + '"' : resolved.cmd
    }

    // 每次启动前清空上一次的输出缓存
    this.clearServiceOutput(name)

    let child: ChildProcess
    try {
      child = spawn(spawnTarget, spawnArgs, {
        env: spawnEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: useShell
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
            ? `MCP Gateway 异常退出 (code=${code})：需要 OpenClaw Gateway 正在运行（MCP 桥依赖其 WebSocket），请确认服务链已就绪${detail}`
            : `进程异常退出 (code=${code} signal=${signal})${detail}`
        this.emitStatus(name)
        void this.tryAutoRestart(name)
      } else {
        info.status = 'error'
        info.error =
          name === 'mcp'
            ? `MCP Gateway 启动失败（code=${code}）：需要 OpenClaw 正在运行（MCP 桥依赖其 Gateway WebSocket）${detail}`
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
    } else if (name === 'video-claw') {
      // AI 视频：后端(8000) + 前端(3000) 都监听后再标记运行中，
      // 避免 iframe 过早加载导致页面/模板拉取失败
      const backendReady = await waitForPort(info.port, portTimeoutMs, 1000)
      ready = backendReady && (await waitForPort(VIDEO_CLAW_FRONTEND_PORT, portTimeoutMs, 1000))
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
    // 等待进程树完全退出、文件句柄释放（Windows 上被占用文件删除/写入会报 EBUSY）
    await this.waitForRuntimeDirReleased(name)

    // 删除旧运行时目录，避免旧文件冲突（占用未释放时按间隔重试）
    const runtimeDir = path.join(getRuntimeRoot(), name)
    const removed = await removeDirWithRetry(runtimeDir)
    if (!removed) {
      console.warn(`[service-manager] rm old runtime dir for ${name} failed after retry`)
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
