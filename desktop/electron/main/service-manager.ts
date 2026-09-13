// 本地服务管理器 - 管理 N8N / Hermes / VideoClaw 本地服务进程
//
// 实现说明（Task 16）：
// - 三个服务均通过 child_process.spawn 启动子进程
// - 启动命令可配置（SERVICE_COMMANDS），按候选命令依次尝试
// - 每秒采样 CPU/内存（Windows: PowerShell Get-Process / Linux: /proc/<pid>/stat）
// - 异常退出自动重启（最多 3 次，间隔 5 秒），超过后 emit 'service-error'
// - 状态变更 emit 'status-changed'，由主进程入口转发到渲染进程

import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { app } from 'electron'
import type {
  ModuleDataDisposition,
  ModuleUninstallResult,
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
import { syncHermesConfig } from './hermes-config'
import { relocateHermesRuntime } from './hermes-runtime-relocate'
import { resolveModelDefaults } from './model-defaults'
import { getRuntimeRoot } from './runtime-config'
import { getCredential, setCredential } from './services/credential-store'
import { getEdictDataRoot } from './edict-bridge'
import { loadAllRows } from './service-registry/patch-loader'
import type { ServiceRow } from './service-registry/types'
import { listModules } from './service-registry/patch-loader'
import { setModuleDisabled } from './service-registry/module-state'
import { runtimeDirOf } from './service-registry/fingerprint'

import { disabledModuleSet } from './service-registry/module-state'
import { RowExecutor, isPortListening, removeDirWithRetry } from './service-registry/row-executor'
import {
  runtimeBackupRoot,
  moveRuntimeToBackup,
  restoreRuntimeFromBackup,
  pruneRuntimeBackups,
  recordReinstallAudit,
} from './service-registry/fingerprint'
import type { SpawnSpec, SpawnSpecResult } from './service-registry/row-executor'
import {
  buildDouyinSpawnSpec,
  buildFlowsSpawnSpec,
  buildUnifiedToolboxSpawnSpec,
  buildWxGatewaySpawnSpec,
  CONFIG_SYNC_HANDLERS,
  ENV_BUILDERS,
  POST_INSTALL_HANDLERS,
  PRE_START_HANDLERS,
  resolveDouyinModuleDir,
  resolveFlowsModuleDir,
  douyinStateRoot,
  flowsStateRoot,
  resolveUnifiedToolboxModuleDir,
  resolveWxGatewayModuleDir,
  wxGatewayStateRoot,
  type ServiceHookCtx,
} from './service-registry/whitelist'

/**
 * 服务行装配缓存：所有“行 id → 端口/名称/生命周期键”信息以 base.patch.yaml 与
 * modules 目录下的 patch.yaml 为准（service-manager.ts 不再维护 SERVICE_DEFS 硬编码表）。
 */
let cachedRows: ServiceRow[] | null = null

function getRows(): ServiceRow[] {
  if (!cachedRows) {
    cachedRows = loadAllRows(disabledModuleSet(app.getPath('userData')))
    for (const row of cachedRows) {
      if (row.envKey && !ENV_BUILDERS[row.envKey]) {
        console.warn(`[service-registry] 服务行 ${row.id} 的 envKey=${row.envKey} 未在底座白名单注册`)
      }
      if (row.preStartKey && !PRE_START_HANDLERS[row.preStartKey]) {
        console.warn(`[service-registry] 服务行 ${row.id} 的 preStartKey=${row.preStartKey} 未在底座白名单注册`)
      }
    }
  }
  return cachedRows!
}

/** 清空服务行缓存（模块启用/停用后由 reloadRows 调用）。 */
export function invalidateRowCache(): void {
  cachedRows = null
}

function rowOf(id: string): ServiceRow | undefined {
  return getRows().find((r) => r.id === id)
}

function rowPort(id: string): number {
  return rowOf(id)?.port ?? 0
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
    // 本地 HTTP 部署必须关闭 Secure Cookie，否则登录后的会话 Cookie 带 Secure 标志，在 http://127.0.0.1 下无法保存，导致登录后立即被踢回登录页
    N8N_SECURE_COOKIE: 'false',
    GENERIC_TIMEZONE: 'Asia/Shanghai',
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
    // 优先从安全凭据存储读取（safeStorage 加密，凭据仅主进程使用）
    const stored = getCredential('hermes.serverKey')
    if (stored) return stored
    // 兼容旧版本：明文 key 曾直接写在 userData/hermes-server-key，读到后迁移到安全存储
    const keyFile = path.join(app.getPath('userData'), 'hermes-server-key')
    if (fs.existsSync(keyFile)) {
      const existing = fs.readFileSync(keyFile, 'utf-8').trim()
      if (existing) {
        setCredential('hermes.serverKey', existing)
        try { fs.rmSync(keyFile, { force: true }) } catch { /* 忽略删除失败 */ }
        return existing
      }
    }
    const key = 'shentong-' + crypto.randomBytes(24).toString('hex')
    setCredential('hermes.serverKey', key)
    return key
  } catch (err) {
    console.error('[service-manager] generate hermes server key failed:', err)
    return 'shentong-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
  }
}

/**
 * Hermes Dashboard 会话 token（P0 原生能力接入）
 * - 桌面端 mint 并注入 HERMES_DASHBOARD_SESSION_TOKEN，Hermes web_server _resolve_session_token 同源读取；
 *   原生 API 请求头 X-Hermes-Session-Token 与本 token 一致，防止未授权访问
 * - 首次生成随机 token 写入安全凭据存储（hermes.sessionToken），后续复用保证服务端与客户端一致
 */
function getOrCreateHermesSessionToken(): string {
  try {
    const stored = getCredential('hermes.sessionToken')
    if (stored) return stored
  } catch (err) {
    console.warn('[service-manager] 读取 hermes session token 失败:', err)
  }
  const token = 'shentong-session-' + crypto.randomBytes(24).toString('hex')
  try {
    setCredential('hermes.sessionToken', token)
  } catch (err) {
    console.warn('[service-manager] 保存 hermes session token 失败（仅本次会话有效）:', err)
  }
  return token
}

/**
 * 一次性迁移旧版 OpenClaw 数据目录（OpenClaw 已移除，兼容老用户本地数据）。
 * - userData/openclaw-chat → userData/hermes-chat（Hermes 对话鉴权/记账上下文）
 * - userData/openclaw-home → userData/hermes-market（本地技能/插件市场内容）
 * 仅当旧目录存在且新目录不存在时迁移；幂等，失败不阻断启动。
 */
export function migrateLegacyOpenClawData(): void {
  const base = app.getPath('userData')
  const pairs: Array<[string, string]> = [
    ['openclaw-chat', 'hermes-chat'],
    ['openclaw-home', 'hermes-market'],
  ]
  for (const [oldName, newName] of pairs) {
    const src = path.join(base, oldName)
    const dst = path.join(base, newName)
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      try {
        fs.renameSync(src, dst)
        console.log('[migrate] ' + oldName + ' -> ' + newName)
      } catch (err) {
        console.warn('[migrate] ' + oldName + ' -> ' + newName + ' 失败:', err)
      }
    }
  }
}


/**
 * Hermes 数据目录
 * - 固定指向 userData/hermes-home，避免使用 %LOCALAPPDATA%\\hermes（该目录可能残留损坏的
 *   hermes-agent 链接/ACL，导致 Hermes 启动时 banner 的 git 探测抛 PermissionError 直接崩溃）
 */

/** 子进程凭证注入：把飞书/MySQL 凭证从 credential-store + env 汇总，供 unified-toolbox / flows 使用 */
function buildChildCredentialEnv(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  const feishuId = getCredential('feishu.appId') || process.env.FEISHU_APP_ID || '';
  const feishuSecret = getCredential('feishu.appSecret') || process.env.FEISHU_APP_SECRET || '';
  if (feishuId) out.FEISHU_APP_ID = feishuId;
  if (feishuSecret) out.FEISHU_APP_SECRET = feishuSecret;
  for (const k of [
    'ST_MYSQL_HOST', 'ST_MYSQL_PORT', 'ST_MYSQL_USER', 'ST_MYSQL_PASSWORD', 'ST_MYSQL_PWD',
    'ST_MYSQL_DATABASE', 'ST_MYSQL_DB', 'ST_MYSQL_ALLOW_WRITE', 'FEISHU_BASE_URL',
  ]) {
    if (process.env[k]) out[k] = process.env[k];
  }
  return out;
}

function getHermesHome(): string {
  return path.join(app.getPath('userData'), 'hermes-home')
}

/** Hermes 子进程环境变量（每次启动实时构建，确保 HERMES_HOME 目录已创建） */
function buildHermesEnv(): NodeJS.ProcessEnv {
  const key = getOrCreateHermesServerKey()
  const home = getHermesHome()
  // Hermes 运行时根（技能脚本 hermes-agent / edict-create 需要 HERMES_NODE / HERMES_ENTRY / HERMES_PYTHON）
  const hermes = resolve('hermes')
  const hermesRoot = hermes?.cmd ? path.dirname(hermes.cmd) : ''
  try {
    fs.mkdirSync(home, { recursive: true })
  } catch (err) {
    console.warn('[service-manager] mkdir hermes-home failed:', err)
  }
  // 记账上下文目录（n8n-run-workflow 等工具卡读取 ST_AUTH_FILE / ST_ACCOUNTING_FILE）
  const accountingDir = path.join(app.getPath('userData'), 'hermes-chat')
  try {
    fs.mkdirSync(accountingDir, { recursive: true })
  } catch (err) {
    console.warn('[service-manager] mkdir hermes-chat failed:', err)
  }
  return {
    ...process.env,
    PORT: String(rowPort('hermes')),
    HERMES_HOME: home,
    HERMES_API_SERVER_KEY: key,
    // P0 原生能力接入：桌面端 mint 会话 token 注入 Hermes 进程（web_server 鉴权同源，X-Hermes-Session-Token）
    HERMES_DASHBOARD_SESSION_TOKEN: getOrCreateHermesSessionToken(),
    // K1 修复：Hermes 进程实际读取的环境变量名是 CUSTOM_API_KEY，
    // 需将 HERMES_API_SERVER_KEY 映射到 CUSTOM_API_KEY，否则 spawnService 中的检查永远失败
    CUSTOM_API_KEY: key,
    // Hermes 运行时路径（注入迁移后的 hermes-agent / edict-create 技能脚本）
    HERMES_NODE: hermesRoot ? path.join(hermesRoot, 'node', 'node.exe') : '',
    HERMES_ENTRY: hermesRoot ? path.join(hermesRoot, 'node_modules', 'hermes-agent', 'bin', 'hermes.js') : '',
    HERMES_PYTHON: hermesRoot ? path.join(hermesRoot, 'python', 'python.exe') : '',
    EDICT_PYTHON: hermesRoot ? path.join(hermesRoot, 'python', 'python.exe') : '',
    // 官署技能所需环境变量（与 Hermes 进程对齐）：n8n-run-workflow 读取 N8N/ST 系列变量，
    // 看板工具卡读取 EDICT_HOME；Hermes 长驻服务同样注入，保证技能脚本可运行
    N8N_BASE_URL: 'http://127.0.0.1:' + rowPort('n8n'),
    ST_API_BASE,
    ST_AUTH_FILE: path.join(accountingDir, 'auth.json'),
    ST_ACCOUNTING_FILE: path.join(accountingDir, 'current-accounting.json'),
    EDICT_HOME: getEdictDataRoot(),
  }
}


/** 内置 Hermes 技能目录（打包后位于 resources/hermes/skills，开发环境位于 desktop/resources/hermes/skills） */
function getHermesBundledSkillsDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'hermes', 'skills')
    : path.join(process.cwd(), 'resources', 'hermes', 'skills')
}

/** 递归收集目录下所有文件（相对路径） */
function collectFiles(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? prefix + '/' + entry.name : entry.name
    if (entry.isDirectory()) out.push(...collectFiles(path.join(dir, entry.name), rel))
    else if (entry.isFile()) out.push(rel)
  }
  return out
}

/**
 * 将内置 Hermes 技能同步到 $HERMES_HOME/skills/（Hermes 固定扫描本地 skills 目录）。
 * - 目标缺失或内容不同才复制：新版本内置技能自动覆盖，用户对其它技能的本地修改不受影响；
 * - 源目录不存在（打包遗漏）时静默跳过，不抛错。
 */
function syncHermesSkills(): void {
  try {
    const srcRoot = getHermesBundledSkillsDir()
    if (!fs.existsSync(srcRoot)) return
    const home = getHermesHome()
    fs.mkdirSync(home, { recursive: true })
    const dstRoot = path.join(home, 'skills')
    let copied = 0
    for (const skill of fs.readdirSync(srcRoot, { withFileTypes: true })) {
      if (!skill.isDirectory()) continue
      for (const rel of collectFiles(path.join(srcRoot, skill.name))) {
        const src = path.join(srcRoot, skill.name, rel)
        const dst = path.join(dstRoot, skill.name, rel)
        const changed = !fs.existsSync(dst) || !fs.readFileSync(dst).equals(fs.readFileSync(src))
        if (!changed) continue
        fs.mkdirSync(path.dirname(dst), { recursive: true })
        fs.copyFileSync(src, dst)
        copied++
      }
    }
    if (copied > 0) {
      console.log(`[service-manager] Hermes 内置技能已同步（${copied} 个文件）: ${srcRoot} -> ${dstRoot}`)
    }
  } catch (err) {
    console.warn('[service-manager] hermes skills 同步失败（忽略）: ' + (err instanceof Error ? err.message : String(err)))
  }
}

export const ST_API_BASE = 'https://zt.shentongapi.cn/api'

/** 云端 llm-proxy OpenAI 兼容网关（Hermes / ST-Claw 的模型通道指向这里；供应商 Key 在服务器，用户零配置） */
const LLM_PROXY_BASE = 'https://zt.shentongapi.cn/api/llm-proxy/v1'

/** 用户 llm-proxy 静态 Key（登录后由主进程注入；空则 Hermes / ST-Claw 不写 apiKey，对话被 401 拦截） */
let llmProxyKey = ''

/** 供 flow-executor 读取平台 llm-proxy 通道（业务流需要 LLM 时使用） */
export function getFlowsLlmIntegration(): { baseUrl: string; apiKey: string } {
  return { baseUrl: LLM_PROXY_BASE, apiKey: llmProxyKey }
}

/** 读取飞书建表状态（feishu-bitable.json），供 flows 落表映射使用 */
function readFeishuBitableState(userDataDir: string): { appToken?: string; tables?: Array<{ envKey?: string; tableId?: string }> } | null {
  try {
    const f = path.join(userDataDir, 'edict-data', 'feishu-bitable.json')
    if (!fs.existsSync(f)) return null
    const parsed = JSON.parse(fs.readFileSync(f, 'utf-8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** flows 业务流引擎配置落盘（config.json）：写入平台 llm-proxy 通道，业务流需要 LLM 时立即可用。 */
function syncFlowsConfigFile(): void {
  try {
    const stateRoot = flowsStateRoot(app.getPath('userData'))
    const cfgPath = path.join(stateRoot, 'config.json')
    let current: Record<string, unknown> = {}
    if (fs.existsSync(cfgPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
        if (parsed && typeof parsed === 'object') current = parsed
      } catch {
        current = {}
      }
    }
    const next: Record<string, unknown> = {
      ...current,
      llm_base_url: llmProxyKey ? LLM_PROXY_BASE : (current.llm_base_url ?? ''),
      llm_api_key: llmProxyKey || (current.llm_api_key ?? ''),
    }
    // 飞书多维表格映射：有 app_token 时写入 storage_feishu（collection → table_id），
    // 供业务流引擎在 storage_backend=feishu 时真正落表；不强制切换后端。
    try {
      const feishuState = readFeishuBitableState(app.getPath('userData'))
      if (feishuState?.appToken) {
        const tables: Record<string, string> = {}
        for (const t of feishuState.tables ?? []) {
          if (t.tableId && t.envKey) tables[t.envKey] = t.tableId
        }
        next.storage_feishu = { ...(current.storage_feishu as object ?? {}), app_token: feishuState.appToken, tables }
      }
    } catch {
      // 忽略：未建表时无飞书映射
    }
    if (JSON.stringify(current) !== JSON.stringify(next)) {
      fs.mkdirSync(stateRoot, { recursive: true })
      fs.writeFileSync(cfgPath, JSON.stringify(next, null, 2), 'utf-8')
    }
  } catch (err) {
    console.warn('[service-manager] flows config 写入失败（忽略）: ' + (err instanceof Error ? err.message : String(err)))
  }
}
/** VideoClaw 子进程环境变量：注入 llm-proxy 网关地址/静态 Key 与云端记账上下文 */
function buildVideoClawEnv(): NodeJS.ProcessEnv {
  const accountingDir = path.join(app.getPath('userData'), 'hermes-chat')
  return {
    ...process.env,
    VIDEO_CLAW_LLM_PROXY_BASE: LLM_PROXY_BASE,
    VIDEO_CLAW_PROXY_KEY: llmProxyKey || '',
    ST_API_BASE,
    ST_ACCOUNTING_FILE: path.join(accountingDir, 'current-accounting.json'),
    ST_AUTH_FILE: path.join(accountingDir, 'auth.json'),
  }
}

/** ST-Claw 启动前自动生成 config.yaml（未安装运行时/未登录时跳过，不抛错；llmproxy.models=管理后台启用模型） */
async function ensureVideoClawConfigSafe(): Promise<void> {
  if (!llmProxyKey) return
  try {
    const resolved = resolve('video-claw')
    if (!resolved) return
    const backendDir = resolveVideoClawBackendDir(path.dirname(resolved.cmd))
    const platformModels = await fetchPlatformModels(LLM_PROXY_BASE, llmProxyKey)
    const opts = pickPlatformModels(platformModels, DEFAULT_VIDEO_CLAW_MODELS)
    syncVideoClawConfig(backendDir, {
      llmProxyBaseUrl: LLM_PROXY_BASE,
      apiKey: llmProxyKey,
      ...opts,
      platformModels: platformModels ?? undefined,
    })
    console.log('[service-manager] video-claw config.yaml 已就绪: ' + backendDir)
  } catch (err) {
    console.warn('[service-manager] video-claw config 生成失败（忽略）: ' + (err instanceof Error ? err.message : String(err)))
  }
}

/**
 * Hermes 启动/登录前同步 $HERMES_HOME/config.yaml：
 * model.provider=custom:shentong + custom_providers 指向平台 llm-proxy 网关（用户零配置，
 * 解决 Hermes 空壳 No inference provider configured）；未登录（无 Key）时跳过，不抛错。
 */
/** 同步 $HERMES_HOME/config.yaml（Hermes CLI 推理必需）；返回是否成功。供任务执行前强制同步调用。 */
async function ensureHermesConfigSafe(): Promise<{ ok: boolean; reason?: string }> {
  if (!llmProxyKey) {
    return { ok: false, reason: 'llm-proxy Key 未注入（未登录或登录态未同步）' }
  }
  try {
    const platformModels = await fetchPlatformModels(LLM_PROXY_BASE, llmProxyKey)
    const opts = pickPlatformModels(platformModels, DEFAULT_VIDEO_CLAW_MODELS)
    syncHermesConfig(getHermesHome(), {
      llmProxyBaseUrl: LLM_PROXY_BASE,
      apiKey: llmProxyKey,
      llmModel: opts.llmModel,
    })
    console.log('[service-manager] hermes config.yaml 已就绪: ' + getHermesHome() + ' model=' + opts.llmModel)
    return { ok: true }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.warn('[service-manager] hermes config 生成失败: ' + reason)
    return { ok: false, reason }
  }
}

/** 自动重启配置 */
// —— 行实现白名单注册：env/preStart 的“实现”绑定到 patch 声明的 key ——
// 只允许底座侧注册；模块 patch 永远只能引用这些 key（安全边界，不允许 patch 携带代码）。
ENV_BUILDERS.n8n = () => buildN8nEnv()
ENV_BUILDERS.hermes = () => buildHermesEnv()
ENV_BUILDERS['video-claw'] = () => buildVideoClawEnv()

PRE_START_HANDLERS['video-claw'] = async () => {
  // 等待 config.yaml 写完再启动 ST-Claw（避免 fetchPlatformModels 异步竞态导致进程读到旧/缺失配置）
  await ensureVideoClawConfigSafe()
}
PRE_START_HANDLERS.hermes = async (ctx) => {
  const resolved = ctx.resolved
  if (!resolved || resolved.source === 'host') return
  try {
    // 修复便携运行时内嵌构建机绝对路径（uv trampoline / pyvenv.cfg / editable finder），
    // 幂等执行，失败不阻断启动（错误信息会在启动失败时暴露）
    const relocateResult = relocateHermesRuntime(path.dirname(resolved.cmd))
    if (relocateResult.relocated) {
      console.log(`[service-manager] hermes 运行时已重定位（venv python: ${relocateResult.venvPython}）`)
    } else if (relocateResult.reason) {
      console.warn(`[service-manager] hermes 运行时重定位跳过: ${relocateResult.reason}`)
    }
  } catch (err) {
    console.warn('[service-manager] hermes 运行时重定位失败（继续尝试启动）: ' + (err instanceof Error ? err.message : String(err)))
  }
  // 同步内置技能（st-claw-controller 等）到 HERMES_HOME/skills，再等待 config.yaml 写完再启动 Hermes
  syncHermesSkills()
  await ensureHermesConfigSafe()
}

// —— configSync 白名单：proxyKey / modelDefaults 变化时写各服务 config ——
// 返回值 = “config 内容是否变化”（modelDefaults 决定是否重启；proxyKey 由调用方按 restartOn 重启）。
// Hermes / ST-Claw 的 proxyKey 同步走 CONFIG_SYNC_HANDLERS，不进本表。
CONFIG_SYNC_HANDLERS.hermes = async (ctx) => {
  if (!llmProxyKey) return false
  const cfgPath = path.join(getHermesHome(), 'config.yaml')
  if (ctx.modelSync) {
    const m = ctx.modelSync
    const before = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath, 'utf-8') : null
    syncHermesConfig(getHermesHome(), {
      llmProxyBaseUrl: LLM_PROXY_BASE,
      apiKey: llmProxyKey,
      llmModel: m.hermes.llmModel,
    })
    const after = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath, 'utf-8') : null
    return before !== after
  }
  // proxyKey：拉平台模型清单重写完整 config（幂等；Hermes 运行时启动前也会再执行一次）
  const r = await ensureHermesConfigSafe()
  return !!r.ok
}

CONFIG_SYNC_HANDLERS['video-claw'] = async (ctx) => {
  if (!llmProxyKey) return false
  const rt = ctx.resolved ?? resolve('video-claw')
  if (!rt) return false
  const backendDir = resolveVideoClawBackendDir(path.dirname(rt.cmd))
  if (ctx.modelSync) {
    const m = ctx.modelSync
    const cfgPath = path.join(backendDir, 'config.yaml')
    const before = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath, 'utf-8') : null
    syncVideoClawConfig(backendDir, {
      llmProxyBaseUrl: LLM_PROXY_BASE,
      apiKey: llmProxyKey,
      ...m.videoClaw,
      platformModels: ctx.platformModels ?? undefined,
    })
    const after = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath, 'utf-8') : null
    return before !== after
  }
  // proxyKey：生成完整 config.yaml（spawnService 的 preStart 也会再执行一次，避免竞态）
  await ensureVideoClawConfigSafe()
  return false
}

export class ServiceManager extends EventEmitter {
  /** 服务行（来自 base.patch.yaml 与 modules 目录下的 patch.yaml，装配后保序） */
  private rows: ServiceRow[] = []
  private rowById: Map<string, ServiceRow> = new Map()
  private services: Map<ServiceName, ServiceInfo> = new Map()
  /** 标记已触发过自动安装（避免 start→install→start 递归） */
  private autoInstallAttempted: Set<ServiceName> = new Set()
  /** n8n 原生依赖修复标记（一次运行内最多自动修复一次，重新下载后重置） */
  private n8nRepairAttempted = false
  /** MCP 依赖链自愈冷却时间戳 */
  private lastMcpRetryTs = 0
  /** 单条服务行进程生命周期执行器（spawn/探活/重启/采样/状态推送/结束进程树） */
  private readonly executor: RowExecutor

  constructor() {
    super()
    this.rows = getRows()
    this.rowById = new Map(this.rows.map((r) => [r.id, r]))
    for (const row of this.rows) {
      this.services.set(row.id as ServiceName, {
        name: row.id as ServiceName,
        displayName: row.displayName,
        status: 'unknown',
        port: row.port,
      })
    }
    // postInstall 白名单（底座实现注册；n8n = sqlite3 NAPI 预编译库补齐）
    POST_INSTALL_HANDLERS.n8n = async () => this.repairN8nNativeDeps()

    this.executor = new RowExecutor({
      getRowById: (id) => this.rowById.get(id),
      getInfo: (id) => this.services.get(id),
      rowPort: (id) => rowPort(id),
      getRuntimeRootPath: () => getRuntimeRoot(),
      buildSpawnSpec: (row, info) => this.buildSpawnSpec(row, info),
      onStatus: (name) => this.emitStatus(name),
      onServiceError: (payload) => this.emit('service-error', payload),
      healDependencyChain: () => this.healDependencyChain(),
    })
    this.executor.startMetricsSampler(() => this.services)
  }

  /**
   * 任务执行前强制同步 Hermes config.yaml（Hermes CLI 每次读取；登录后异步同步可能失败/未触发）。
   * 返回是否成功；未登录（无 Key）或同步失败时返回原因，由调用方决定是否中止任务。
   */
  async ensureHermesConfig(): Promise<{ ok: boolean; reason?: string }> {
    return ensureHermesConfigSafe()
  }

  /**
   * 设置用户 llm-proxy 静态 Key（登录后由主进程调用）：
   * 1) 更新内存 Key，并按 onConfigKey 触发 Hermes / ST-Claw 的 config 同步
   * 2) 运行中的关联服务按 restartOn=[proxyKey] 重启，让新 Key 生效
   */
  setLlmProxyKey(key: string): void {
    llmProxyKey = key || ''
    syncFlowsConfigFile()
    // proxyKey 关联行的 config 同步：hermes/video-claw 按 onConfigKey 走白名单；
    // Hermes / ST-Claw config 由 CONFIG_SYNC_HANDLERS 按 onConfigKey 写入
    for (const row of this.rows) {
      if (!row.onConfigKey) continue
      const sync = CONFIG_SYNC_HANDLERS[row.onConfigKey]
      if (!sync) continue
      void sync({
        rowId: row.id,
        runtimeKey: row.runtimeKey,
        resolved: resolve(row.runtimeKey) ?? null,
        event: 'proxyKey',
        proxyKey: llmProxyKey,
      }).catch((err) =>
        console.warn(
          `[service-manager] ${row.id} proxyKey 配置同步失败（忽略）: ` +
            (err instanceof Error ? err.message : String(err)),
        ),
      )
    }
    // restartOn=[proxyKey] 的行（video-claw / hermes）运行中重启，让新 Key/模型白名单生效
    for (const row of this.rows) {
      if (!row.restartOn.includes('proxyKey')) continue
      const info = this.services.get(row.id)
      if (!info || info.status !== 'running') continue
      console.log(`[service-manager] llm-proxy Key 已更新，重启 ${row.displayName} 使其生效...`)
      void this.restart(row.id)
    }
  }

  /**
   * 设置页模型默认同步：default-models → Hermes config + ST-Claw config。
   */
  async syncModelDefaults(dto: import('./model-defaults').UserModelDefaultsInput | null): Promise<void> {
    if (!llmProxyKey) return
    try {
      const platformModels = await fetchPlatformModels(LLM_PROXY_BASE, llmProxyKey)
      const picked = pickPlatformModels(platformModels, DEFAULT_VIDEO_CLAW_MODELS)
      const resolved = resolveModelDefaults(dto, picked)
      if (!resolved) return
      // 遍历声明 restartOn=[modelDefaults] 的行（hermes / video-claw）：config 内容变化才重启
      for (const row of this.rows) {
        if (!row.restartOn.includes('modelDefaults')) continue
        const sync = row.onConfigKey ? CONFIG_SYNC_HANDLERS[row.onConfigKey] : undefined
        if (!sync) continue
        const changed = await sync({
          rowId: row.id,
          runtimeKey: row.runtimeKey,
          resolved: resolve(row.runtimeKey) ?? null,
          event: 'modelDefaults',
          proxyKey: llmProxyKey,
          modelSync: resolved,
          platformModels,
        })
        if (!changed) continue
        console.log(`[service-manager] ${row.displayName} 模型配置已更新，重启 ${row.id} 生效...`)
        void this.restart(row.id).catch((err) =>
          console.warn(
            `[service-manager] ${row.id} 重启失败（忽略）: ` + (err instanceof Error ? err.message : String(err)),
          ),
        )
      }
    } catch (err) {
      console.warn('[service-manager] syncModelDefaults 失败（忽略）: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  /**
   * 构建启动规格（运行时解析 / env / preStart / launch 预设 / MCP 桥参数 / 引号处理）。
   * 前置条件（Hermes CUSTOM_API_KEY 缺失、运行时未安装）返回 { ok:false, error }。
   * 由 RowExecutor 在 spawn 前调用；spawn 后的探活/重启/采样/降级由执行器统一处理。
   */
  private async buildSpawnSpec(row: ServiceRow, info: ServiceInfo): Promise<SpawnSpecResult> {
    // Hermes 必须配置 CUSTOM_API_KEY（由 getOrCreateHermesServerKey 自动生成）
    if (row.launch === 'hermes') {
      const customApiKey = buildHermesEnv().CUSTOM_API_KEY
      if (!customApiKey) {
        return { ok: false, error: 'Hermes Agent 启动失败：CUSTOM_API_KEY 未设置' }
      }
    }

    // unified-toolbox：由底座二进制以 ELECTRON_RUN_AS_NODE 运行打包的 MCP server，无 runtime manifest。
    if (row.launch === 'unified-toolbox') {
      try {
        const moduleRoot = resolveUnifiedToolboxModuleDir()
        const preStartHandler = row.preStartKey ? PRE_START_HANDLERS[row.preStartKey] : undefined
        if (preStartHandler) {
          await preStartHandler({ rowId: row.id, runtimeKey: row.runtimeKey, resolved: null })
        }
        const envBuilder = row.envKey ? ENV_BUILDERS[row.envKey] : undefined
        const extraEnv = envBuilder ? envBuilder({ rowId: row.id, runtimeKey: row.runtimeKey, resolved: null }) : undefined
        const credEnv = buildChildCredentialEnv()
        const made = buildUnifiedToolboxSpawnSpec({ port: info.port, moduleRoot, extraEnv: { ...(extraEnv ?? {}), ...credEnv } })
        return {
          ok: true,
          spec: {
            command: made.command,
            args: made.args,
            env: made.env,
            useShell: made.useShell,
            permissions: row.permissions,
            writableDirs: row.writableDirs,
            workspaceDir: row.writableDirs[0],
          },
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }

    // wx-gateway：启动外部 Python 微信域桥服务（授权 SDK 绑定层），无 runtime manifest。
    if (row.launch === 'wx-gateway') {
      try {
        const moduleRoot = resolveWxGatewayModuleDir()
        const preStartHandler = row.preStartKey ? PRE_START_HANDLERS[row.preStartKey] : undefined
        if (preStartHandler) {
          await preStartHandler({ rowId: row.id, runtimeKey: row.runtimeKey, resolved: null })
        }
        const envBuilder = row.envKey ? ENV_BUILDERS[row.envKey] : undefined
        const extraEnv = envBuilder ? envBuilder({ rowId: row.id, runtimeKey: row.runtimeKey, resolved: null }) : undefined
        const made = buildWxGatewaySpawnSpec({
          port: info.port,
          moduleRoot,
          stateRoot: wxGatewayStateRoot(app.getPath('userData')),
          extraEnv,
        })
        return {
          ok: true,
          spec: {
            command: made.command,
            args: made.args,
            env: made.env,
            useShell: made.useShell,
            permissions: row.permissions,
            writableDirs: row.writableDirs,
            workspaceDir: row.writableDirs[0],
          },
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }

    // douyin：启动外部 Python 抖音采集/转写服务（只读流水线），无 runtime manifest。
    if (row.launch === 'douyin') {
      try {
        const moduleRoot = resolveDouyinModuleDir()
        const preStartHandler = row.preStartKey ? PRE_START_HANDLERS[row.preStartKey] : undefined
        if (preStartHandler) {
          await preStartHandler({ rowId: row.id, runtimeKey: row.runtimeKey, resolved: null })
        }
        const envBuilder = row.envKey ? ENV_BUILDERS[row.envKey] : undefined
        const extraEnv = envBuilder ? envBuilder({ rowId: row.id, runtimeKey: row.runtimeKey, resolved: null }) : undefined
        const made = buildDouyinSpawnSpec({
          port: info.port,
          moduleRoot,
          stateRoot: douyinStateRoot(app.getPath('userData')),
          extraEnv,
        })
        return {
          ok: true,
          spec: {
            command: made.command,
            args: made.args,
            env: made.env,
            useShell: made.useShell,
            permissions: row.permissions,
            writableDirs: row.writableDirs,
            workspaceDir: row.writableDirs[0],
          },
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
    // flows：启动外部 Python 业务流引擎（12 个业务流的编排承载），无 runtime manifest。
    if (row.launch === 'flows') {
      try {
        const moduleRoot = resolveFlowsModuleDir()
        const preStartHandler = row.preStartKey ? PRE_START_HANDLERS[row.preStartKey] : undefined
        if (preStartHandler) {
          await preStartHandler({ rowId: row.id, runtimeKey: row.runtimeKey, resolved: null })
        }
        const envBuilder = row.envKey ? ENV_BUILDERS[row.envKey] : undefined
        const extraEnv = envBuilder ? envBuilder({ rowId: row.id, runtimeKey: row.runtimeKey, resolved: null }) : undefined
        const credEnv = buildChildCredentialEnv()
        const made = buildFlowsSpawnSpec({
          port: info.port,
          moduleRoot,
          stateRoot: flowsStateRoot(app.getPath('userData')),
          extraEnv: { ...(extraEnv ?? {}), ...credEnv },
        })
        return {
          ok: true,
          spec: {
            command: made.command,
            args: made.args,
            env: made.env,
            useShell: made.useShell,
            permissions: row.permissions,
            writableDirs: row.writableDirs,
            workspaceDir: row.writableDirs[0],
          },
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
    // 运行时入口按 runtimeKey 解析（模块 id 可与运行时 key 解耦，如未来 stclaw → video-claw）
    const resolved = resolve(row.runtimeKey)
    if (!resolved) {
      return { ok: false, error: '运行时未安装' }
    }

    // 合并环境变量：envKey → 底座白名单 ENV_BUILDERS（未注册时保持 resolved.env）
    const envBuilder = row.envKey ? ENV_BUILDERS[row.envKey] : undefined
    const spawnEnv = envBuilder
      ? { ...resolved.env, ...envBuilder({ rowId: row.id, runtimeKey: row.runtimeKey, resolved }) }
      : resolved.env

    // spawn 前执行本行声明的 preStart（白名单实现）
    const preStartHandler = row.preStartKey ? PRE_START_HANDLERS[row.preStartKey] : undefined
    if (preStartHandler) {
      await preStartHandler({ rowId: row.id, runtimeKey: row.runtimeKey, resolved })
    }

    // 各服务启动参数（launch preset）
    const spawnArgs =
      row.launch === 'hermes'
          ? ['serve', '--port', String(info.port), '--host', '127.0.0.1', '--skip-build']
          : row.launch === 'video-claw'
            ? ['serve']
            : resolved.args

    // Windows 下 .cmd/.bat 必须经 cmd.exe 执行；路径可能含空格/中文
    const isCmdScript = process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolved.cmd)
    const needsQuote = isCmdScript || (process.platform === 'win32' && /\s/.test(resolved.cmd))
    const spawnTarget = needsQuote ? '"' + resolved.cmd + '"' : resolved.cmd

    return {
      ok: true,
      spec: {
        command: spawnTarget,
        args: spawnArgs,
        env: spawnEnv,
        useShell: process.platform === 'win32',
        permissions: row.permissions,
        writableDirs: row.writableDirs,
        workspaceDir: row.writableDirs[0],
      },
    }
  }

  /**
   * 依赖链自愈：OpenClaw / MCP 网关已下线，无需处理。
   */
  private healDependencyChain(): void {
    // 依赖链自愈已随 OpenClaw / MCP 网关下线，无需处理。
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
      info.status = this.executor.hasProcess(name) ? 'unknown' : 'stopped'
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

  /** 读取当前启用模块行中声明的 MCP 服务器（供 Hermes mcp_servers 合并写；不触碰磁盘）。 */
  getModuleMcpServers(): Array<{ name: string; command?: string; args?: string[]; env?: Record<string, string>; url?: string }> {
    return this.rows
      .filter((r) => r.tier === 'module' && r.capabilities.mcpServer)
      .map((r) => {
        const m = r.capabilities.mcpServer!
        return {
          name: m.name || r.id,
          command: m.command,
          args: m.args,
          env: m.env,
          url: m.url,
        }
      })
  }

  /**
   * 运行时重载服务行（模块启用/停用后调用）：
   * 重读 base + modules 装配表，停掉被移除的行、登记新增行（不自动启动，交由 UI/startAll 控制）。
   */
  async reloadRows(): Promise<{ added: string[]; removed: string[] }> {
    const before = new Set(this.rows.map((r) => r.id))
    invalidateRowCache()
    const next = getRows()
    const after = new Set(next.map((r) => r.id))

    const removed = [...before].filter((id) => !after.has(id))
    const added = [...after].filter((id) => !before.has(id))

    // 1) 停掉并移除被删除的行（模块停用/卸载 → 进程停 + 服务列表消失）
    for (const id of removed) {
      await this.stop(id as ServiceName).catch((err) =>
        console.warn(
          `[service-manager] reloadRows stop ${id} 失败: ` +
            (err instanceof Error ? err.message : String(err)),
        ),
      )
      this.services.delete(id as ServiceName)
    }

    // 2) 换新行表
    this.rows = next
    this.rowById = new Map(next.map((r) => [r.id, r]))

    // 3) 登记新增行（不自动启动）
    for (const row of next) {
      if (!this.services.has(row.id as ServiceName)) {
        this.services.set(row.id as ServiceName, {
          name: row.id as ServiceName,
          displayName: row.displayName,
          status: 'unknown',
          port: row.port,
        })
      }
    }

    return { added, removed }
  }
  /**
   * 卸载模块（A4 三档处置）。
   * - keep：仅停用（保留本地 runtime / 配置）。
   * - export：把本地 runtime/配置复制到用户选择目录（exportTargetDir），再停用。
   * - delete：删除本地 runtime/配置，再停用。
   * 云端数据走后端 module-admin 契约；未配置端点时置 endpointUnavailable=true，本地仍按档处置。
   */
  async uninstallModule(
    id: string,
    disposition: ModuleDataDisposition,
    exportTargetDir?: string,
  ): Promise<ModuleUninstallResult> {
    const userDataDir = app.getPath('userData')
    const base: ModuleUninstallResult = { ok: true, id, disposition, endpointUnavailable: true }
    const moduleInfo = listModules(disabledModuleSet(userDataDir)).find((m) => m.id === id)
    if (!moduleInfo) {
      return { ...base, ok: false, error: '模块不存在: ' + id }
    }
    const rows = this.rows.filter((r) => moduleInfo.serviceIds.includes(r.id))

    // 1) 停掉该模块全部服务行
    for (const row of rows) {
      await this.stop(row.id as ServiceName).catch((err) =>
        console.warn(`[service-manager] uninstall 停止 ${row.id} 失败: ` + (err instanceof Error ? err.message : String(err))),
      )
      this.services.delete(row.id as ServiceName)
    }

    if (disposition === 'keep') {
      setModuleDisabled(userDataDir, id, true)
      await this.reloadRows()
      return base
    }

    const runtimeRoot = getRuntimeRoot()
    const localDirs = rows
      .map((r) => runtimeDirOf(runtimeRoot, r.id))
      .filter((d) => fs.existsSync(d))

    if (disposition === 'delete') {
      for (const dir of localDirs) {
        await removeDirWithRetry(dir).catch((err) =>
          console.warn(`[service-manager] delete runtime ${dir} 失败: ` + (err instanceof Error ? err.message : String(err))),
        )
      }
      setModuleDisabled(userDataDir, id, true)
      await this.reloadRows()
      return base
    }

    // export
    let exportedPath: string | undefined
    try {
      exportedPath = await this.exportModuleLocalData(id, moduleInfo.displayName, localDirs, exportTargetDir)
    } catch (err) {
      return { ...base, ok: false, error: err instanceof Error ? err.message : String(err) }
    }
    setModuleDisabled(userDataDir, id, true)
    await this.reloadRows()
    return { ...base, exportedPath }
  }

  /** 把模块本地数据复制到导出目录（exportTargetDir 缺省时抛错告知 UI 先选目录）。 */
  private async exportModuleLocalData(
    id: string,
    displayName: string,
    localDirs: string[],
    exportTargetDir?: string,
  ): Promise<string> {
    if (!exportTargetDir || !exportTargetDir.trim()) {
      throw new Error('导出失败：请先选择导出目录')
    }
    const target = path.join(exportTargetDir, `${id}-export`)
    fs.mkdirSync(target, { recursive: true })
    for (const dir of localDirs) {
      const base = path.basename(dir)
      const dest = path.join(target, base)
      fs.cpSync(dir, dest, { recursive: true, force: true })
    }
    fs.writeFileSync(
      path.join(target, 'module-export.json'),
      JSON.stringify({ id, displayName, exportedAt: new Date().toISOString(), localDirs }, null, 2),
      'utf-8',
    )
    return target
  }
  async start(name: ServiceName): Promise<boolean> {
    const info = this.services.get(name)
    if (!info) return false

    // 已在运行：直接返回成功
    if (info.status === 'running' && (await isPortListening(info.port))) {
      return true
    }

    // 重置重试计数（执行器内部状态）
    this.executor.resetRetryState(name)

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
          // 不再回退到宿主机命令（会掩盖问题，例如用系统旧 node 启动服务）
          return false
        } finally {
          this.autoInstallAttempted.delete(name)
        }
      }
    }

    try {
      const row = this.rowById.get(name)
      const result = row ? await this.executor.startRow(row, info) : false

      // postInstall 原生依赖缺失修复：sqlite3 NAPI 预编译库缺失时 n8n 启动即退出（code=1）。
      // 按行声明走白名单（目前仅 n8n 行声明 postInstallKey），失败特征仍按底座实现判断。
      const repairRow = this.rowById.get(name)
      if (!result && repairRow?.postInstallKey && !this.n8nRepairAttempted) {
        const postInstall = POST_INSTALL_HANDLERS[repairRow.postInstallKey]
        const binding = path.join(
          getRuntimeRoot(),
          repairRow.id,
          'node_modules',
          'sqlite3',
          'build',
          'Release',
          'node_sqlite3.node',
        )
        const output = this.executor.getServiceOutput(name)
        if (
          postInstall &&
          (!fs.existsSync(binding) ||
          /SQLite package has not been found|DriverPackageNotInstalledError|initializing DB/i.test(output)
          )
        ) {
          this.n8nRepairAttempted = true
          console.log(`[service-manager] ${name} 启动失败且 sqlite3 原生依赖缺失，开始自动修复...`)
          const repaired = await postInstall({
            rowId: repairRow.id,
            runtimeKey: repairRow.runtimeKey,
            userDataDir: app.getPath('userData'),
            resolved: null,
          })
          if (repaired) {
            console.log(`[service-manager] ${name} 原生依赖修复完成，自动重试启动`)
            const retry = row ? await this.executor.startRow(row, info) : false
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

  async stop(name: ServiceName): Promise<boolean> {
    const info = this.services.get(name)
    if (!info) return false
    await this.executor.stop(name, info)
    return true
  }

  async restart(name: ServiceName): Promise<boolean> {
    await this.stop(name)
    // 短暂等待端口释放
    await new Promise((resolve) => setTimeout(resolve, 500))
    this.executor.resetRetryState(name)
    return this.start(name)
  }

    async checkEnvironment(): Promise<ServiceEnvCheck> {
    const result = await verifyAll()
    return { n8n: result.n8n, mcp: result.mcp, hermes: result.hermes }
  }
async install(name: ServiceName, onProgress?: (percent: number) => void): Promise<boolean> {
    const info = this.services.get(name)
    if (!info) return false
    const row = this.rowById.get(name)

    // install 前先停止服务，避免进程占用文件
    await this.stop(name)
    // 等待进程树完全退出、文件句柄释放（Windows 上被占用文件删除/写入会报 EBUSY）
    await this.executor.waitForRuntimeDirReleased(name)

    // 把旧运行时空闲化并移到受控备份区（回滚点），重装失败可恢复
    const runtimeDir = path.join(getRuntimeRoot(), name)
    const userDataDir = app.getPath('userData')
    const backupRoot = runtimeBackupRoot(userDataDir)
    let backupDir: string | null = null
    try {
      backupDir = await moveRuntimeToBackup(runtimeDir, backupRoot, name)
      if (backupDir) {
        console.log(`[service-manager] ${name} 旧运行时已备份（回滚点）: ${backupDir}`)
      } else {
        console.log(`[service-manager] ${name} 无旧运行时可备份（首次安装）`)
      }
    } catch (moveErr) {
      // 备份失败（如文件被占用）：退化为原来的直接删除清理
      console.warn(`[service-manager] 备份旧运行时 ${name} 失败，退化为直接清理:`, moveErr)
      const removed = await removeDirWithRetry(runtimeDir)
      if (!removed) {
        console.warn(`[service-manager] rm old runtime dir for ${name} failed after retry`)
      }
    }
    const hadOldRuntime = backupDir !== null

    const restoreOnFailure = (hookErr?: unknown): void => {
      if (!backupDir || !fs.existsSync(backupDir)) return
      try {
        restoreRuntimeFromBackup(backupDir, runtimeDir)
        recordReinstallAudit(
          userDataDir,
          name,
          'rollback',
          hookErr instanceof Error ? hookErr.message : String(hookErr),
        )
        console.log(`[service-manager] ${name} 安装失败，已从备份恢复旧运行时`)
      } catch (restoreErr) {
        console.error(`[service-manager] 恢复旧运行时 ${name} 失败:`, restoreErr)
      } finally {
        backupDir = null
      }
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
        restoreOnFailure(new Error(info.error))
        return false
      }
      // 下载成功：重置原生依赖修复标记
      if (row?.postInstallKey) {
        this.n8nRepairAttempted = false
      }
      // 下载后执行 postInstall 白名单（n8n sqlite3 NAPI 预编译库补齐），缺失时 n8n 启动即退出
      if (row?.postInstallKey) {
        const postInstall = POST_INSTALL_HANDLERS[row.postInstallKey]
        if (postInstall) {
        await postInstall({
          rowId: row.id,
          runtimeKey: row.runtimeKey,
          resolved: null,
          userDataDir,
        })
        }
      }
      // 下载+校验成功：清理旧备份（只留最新）并记录审计
      pruneRuntimeBackups(backupRoot, name, 1)
      recordReinstallAudit(userDataDir, name, hadOldRuntime ? 'reinstall' : 'install', '版本/内容指纹触发重装')
      backupDir = null
      // 下载成功后自动启动
      return await this.start(name)
    } catch (err) {
      info.status = 'error'
      info.error = err instanceof Error ? err.message : String(err)
      this.emitStatus(name)
      restoreOnFailure(err)
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
          void this.executor.killProcessTree(child.pid)
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

  // K2 修复：多个服务存在启动依赖链（按服务行 dependsOn 顺序启动），
  // 并行启动会导致依赖方在所需端口未就绪时启动失败，改为按依赖顺序串行启动
  async startAll(): Promise<void> {
    // 依赖顺序由服务行排列决定（base.patch 已按 n8n→hermes 书写，模块行追加在末尾）
    for (const row of this.rows) {
      if (row.tier === 'module') {
        // 模块（ST-Claw）纳入统一生命周期；启动失败不阻断底座服务
        try {
          await this.start(row.id)
        } catch (err) {
          console.warn(`[service-manager] ${row.displayName} 启动失败（不阻断其他服务）:`, err)
        }
      } else {
        await this.start(row.id)
      }
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all(this.rows.map((row) => this.stop(row.id)))
  }

  /** 统一发送 status-changed 事件 */
  private emitStatus(name: ServiceName): void {
    const info = this.services.get(name)
    if (!info) return
    this.emit('status-changed', name, info.status, info)
  }
}
