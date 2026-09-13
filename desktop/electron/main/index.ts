// Electron 主进程入口

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { buildChildEnv } from './policy/child-env'
import { hardenIpc, initIpcGuard } from './ipc-guard'
import { installIpcRegistry } from './ipc-registry'
import log from 'electron-log'
import { getRuntimeDirInfo, setRuntimeRoot, defaultRuntimeRoot, getRuntimeRoot } from './runtime-config'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import { LlmIntegrationsStore } from './llm-integrations'
import { HermesChatService, waitForLocalPort } from './hermes-chat'
import { registerHermesFsIpc } from './hermes-fs-ipc'
import type { HermesChatMessage } from './hermes-chat'
import { HERMES_SESSION_TOKEN_CREDENTIAL } from './hermes-client'
import { getCredential } from './services/credential-store'
import { authContextDir, readAuthToken, writeSecureJson } from './services/secure-json-store'
import { describeOutboundDeny, evaluateOutboundUrl, mediaAllowedHosts } from './policy/url-policy'
import { redactValue } from './policy/redact'
import type { LlmIntegration } from '../shared/types'

// GPU 白名单开关：解决部分显卡/驱动/远程桌面环境下 WebGL 被 Chromium 黑名单拦截的问题
// 必须在 app.whenReady 之前设置
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('disable-gpu-sandbox')
// 允许在缺少 GPU 时使用 SwiftShader 软件渲染，保证 PixiJS 至少能创建 WebGL 上下文
app.commandLine.appendSwitch('enable-unsafe-swiftshader')
// 对标轻语：本地视频解析需要页面自动播放（video.play 无手势触发）
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
// 修复内嵌 n8n iframe 登录：Electron 新内核默认阻止第三方 Cookie，导致 file:// 应用内的 http://127.0.0.1:5678 iframe 无法保存登录会话 Cookie（浏览器直连正常、App 内登录转圈回登录页）
app.commandLine.appendSwitch('disable-features', 'ThirdPartyCookies,ThirdPartyStoragePartitioning')
// 仅开发环境（未打包）启用远程调试端口，生产环境关闭
if (!app.isPackaged) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}
// IPC 通道清单审计：必须在任何 ipcMain.handle/on 注册之前安装
installIpcRegistry()

import { createMainWindow, getMainWindow, setQuitting } from './windows/main-window'
import { createTray, destroyTray } from './tray'
import { ServiceManager, ST_API_BASE, migrateLegacyOpenClawData } from './service-manager'
import { listModules, listModuleMcpNames } from './service-registry/patch-loader'
import { disabledModuleSet, setModuleDisabled } from './service-registry/module-state'
import type { ModuleInfo } from '../shared/types'
import { ensureN8nAuth } from './n8n-auth'
import { runLocalN8nWorkflow } from './n8n-executor'
import { runFlow, listFlows } from './flow-executor'
import { checkEnvComponents, installEnvComponent } from './env-components'
import { ensureN8nI18n } from './n8n-i18n'
import { writeHermesMcpServers, syncHermesMcpFromBackend } from './hermes-mcp-sync'
import { AppUpdater } from './updater'
import { getDeviceFingerprint } from './device'
import { getRemoteControlManager } from './remote-control'
import { runComputerControlMcpServer, registerComputerControlMcp } from './computer-control-mcp'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { localDb } from './local-db'
import { getOrCreateSalt, deriveDbKey } from './local-db/crypto'
import { verifyAll, verifyIntegrity } from './runtime-resolver'
import { download as downloadRuntime, cancelDownload, cleanupStaleTempFiles } from './runtime-downloader'
import {
  installMarketItem,
  uninstallMarketItem,
  listInstalled,
  exportMarketBundle,
  importMarketBundle,
  getInstalledDetail,
  importCustomDir,
  registerChatInstalled,
  updateMarketItem,
  syncChatInstalled,
  installGithubSkill,
  installModuleFromSource,
} from './local-market/local-content-manager'
import type { MarketItemType } from '../shared/types'
import type { ServiceName, SyncQueueItem, SyncQueueRow } from '../shared/types'
import type { LocalBrief, LocalScheduledRun } from '../shared/types'
import type { EnvComponentStatus } from '../shared/types'
import { createStepRunner, type OrchestrateDeps, type OrchestrateInput, type StepRunnerDeps, type StepRunnerHandle, type TeamMemberProfile, type TeamTaskStatus } from './hermes-orchestrator'
import { buildMemberProfiles, type MemberRow } from './hermes-member-profile'
import { listSkills, searchSkills, installSkill, updateSkills, uninstallSkill, checkSkills, installSkillLocal } from './hermes-skills'
import { handleMemoryOp } from './hermes-memory'
import { handleMemoryProviderOp } from './hermes-memory-provider'
import { getHermesToolsets, setHermesToolsetEnabled, getHermesMcpServers } from './hermes-tools'
import { HermesClient } from './hermes-client'
import {
  getSupportedPlatforms,
  openAccount,
  openPublish,
  removeSession,
  saveSession,
  setupLogin,
  testLogin,
  startScan,
  getScanStatus,
  cancelScan,
  verifySession,
  setScanEventSink,
} from './platform-login'
import { registerVideoParserIpc } from './video-parser'
import { createEdictDeps, createEdictExtraDeps, ensureEdictHermesProfiles, registerEdictIpc, getEdictProfilesDir, getEdictDataRoot } from './edict-bridge'
import { resolveRoster } from './edict-roster'
import { registerEdictExtraIpc } from './edict-extra'
import { registerOfficialDetailIpc, getOfficialTables, writeRenderedSoul } from './official-detail'
import { registerFeishuIpc, buildFeishuClient, type FeishuSettingsDeps } from './feishu-settings'
import { initBitable, readBitableState } from './feishu-bitable'
import { createOrReuseStrategicDoc, readStrategicDoc } from './strategic-doc'
import { appendArchiveToBoard, appendStrategyVersionToBoard, appendTaskToBoard, seedStarterData } from './feishu-board-writer'
import type { EdictTask } from './edict-orchestrator'
import { registerTeamIpc } from './team-ipc'
import { setCredential, deleteCredential } from './services/credential-store'
import { CronEngine, createCronEngine, defaultCronEngineStatePath, type CronScheduledTask } from './cron-engine'
import { createCronService, CRON_DAEMON_FLAG } from './cron-service'

// ===== Hermes 编排依赖（团队驱动执行） =====

/** 拉取团队成员（team_members + agents 详情），组装 TeamMemberProfile[]；失败/空 → []（触发降级子代理） */
async function loadTeamMembers(token: string, teamId: number): Promise<TeamMemberProfile[]> {
  const auth = { Authorization: 'Bearer ' + token }
  try {
    const res = await fetch(ST_API_BASE + '/teams/' + teamId + '/members', {
      headers: auth,
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const rows = (await res.json()) as MemberRow[]
    const enriched: MemberRow[] = []
    for (const r of rows) {
      if (!r?.agentId) continue
      let agent: MemberRow['agent'] = null
      try {
        const a = await fetch(ST_API_BASE + '/agents/' + r.agentId, {
          headers: auth,
          signal: AbortSignal.timeout(10000),
        })
        if (a.ok) {
          const d = (await a.json()) as Record<string, unknown>
          agent = {
            systemPrompt: typeof d.systemPrompt === 'string' ? d.systemPrompt : null,
            modelId: typeof d.modelId === 'string' ? d.modelId : null,
            allowedKnowledgeBaseIds: Array.isArray(d.allowedKnowledgeBaseIds)
              ? (d.allowedKnowledgeBaseIds as number[])
              : null,
          }
        }
      } catch {
        /* 单个 Agent 详情失败：跳过该成员的详情补充 */
      }
      enriched.push({
        id: Number(r.id),
        agentId: Number(r.agentId),
        roleTitle: r.roleTitle || '',
        roleDescription: r.roleDescription ?? null,
        agent,
      })
    }
    return buildMemberProfiles(enriched) ?? []
  } catch (err) {
    console.warn('[hermes-orchestrate] loadTeamMembers failed:', err)
    return []
  }
}

/** 拉取单个 Agent 详情（agent 模式执行：人设 + 模型 + 知识库）→ 单元素 TeamMemberProfile */
async function loadAgentProfile(token: string, agentId: number): Promise<TeamMemberProfile | null> {
  try {
    const res = await fetch(ST_API_BASE + '/agents/' + agentId, {
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const d = (await res.json()) as Record<string, unknown>
    const name = typeof d.name === 'string' && d.name ? d.name : typeof d.displayName === 'string' && d.displayName ? d.displayName : 'Agent #' + agentId
    return {
      memberId: 0,
      agentId,
      roleTitle: name,
      systemPrompt: typeof d.systemPrompt === 'string' ? d.systemPrompt : undefined,
      modelId: typeof d.modelId === 'string' ? d.modelId : undefined,
      knowledgeBaseIds: Array.isArray(d.allowedKnowledgeBaseIds)
        ? (d.allowedKnowledgeBaseIds as number[])
        : [],
    }
  } catch (err) {
    console.warn('[hermes-orchestrate] loadAgentProfile failed:', err)
    return null
  }
}
/** 主进程编排依赖（真实实现）：PATCH 回写 + 上报 call_log + 产物登记 + Hermes CLI spawn */
function buildHermesOrchestrateDeps(token: string): OrchestrateDeps {
  const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  const hermesRoot = join(getRuntimeRoot(), 'hermes')
  const hermesEnv = {
    ...buildChildEnv(process.env),
    HERMES_NODE: join(hermesRoot, 'node', 'node.exe'),
    HERMES_ENTRY: join(hermesRoot, 'node_modules', 'hermes-agent', 'bin', 'hermes.js'),
    HERMES_HOME: join(app.getPath('userData'), 'hermes-home'),
  }
  return {
    patchTask: async (teamId, taskId, payload) => {
      const res = await fetch(`${ST_API_BASE}/teams/${teamId}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: auth,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error('PATCH team_task 失败: HTTP ' + res.status)
    },
    reportExecution: async (input, result) => {
      const res = await fetch(`${ST_API_BASE}/hermes/executions/report`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          executionRef: input.executionRef,
          teamTaskId: input.teamTaskId,
          teamId: input.teamId,
          status: result.status,
          summary: result.summary,
          steps: result.steps,
          outputs: result.outputs,
          error: result.error,
          durationMs: result.durationMs,
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error('上报 call_log 失败: HTTP ' + res.status)
    },
    persistOutputs: async (taskId, result) => {
      for (const o of result.outputs ?? []) {
        const res = await fetch(`${ST_API_BASE}/tasks/${taskId}/outputs`, {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({
            outputType: ['image', 'video', 'audio'].includes(o.type) ? o.type : 'text',
            content: o.content ?? null,
            fileUrl: o.url ?? null,
          }),
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) console.error('[hermes-orchestrate] persistOutputs 失败: HTTP ' + res.status)
      }
    },
    spawnCli: (prompt, opts) => {
      const nodeBin = hermesEnv.HERMES_NODE as string
      const entry = hermesEnv.HERMES_ENTRY as string
      if (!nodeBin || !entry) throw new Error('Hermes 运行时未安装或未配置')
      const args = [entry, 'chat', '-q', prompt, '-Q', '--source', 'tool']
      // 方案 B：设置页 chat 默认模型 → CLI -m（探针已确认 hermes 支持 -m/--model）
      if (opts?.model) args.push('-m', opts.model)
      const child = spawn(nodeBin, args, {
        env: hermesEnv,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      return {
        child,
        stdout: () => collectStream(child, 'out'),
        stderr: () => collectStream(child, 'err'),
      }
    },
    now: () => Date.now(),
  }
}

/** 收集子进程流到字符串（end/close/exit 任一触发即返回） */
function collectStream(child: ReturnType<typeof spawn>, kind: 'out' | 'err'): Promise<string> {
  return new Promise((resolve) => {
    let buf = ''
    const src = kind === 'out' ? child.stdout : child.stderr
    const done = () => resolve(buf)
    src?.on('data', (d: Buffer) => {
      buf += d.toString()
    })
    src?.on('end', done)
    src?.on('close', done)
    src?.on('error', () => resolve(buf))
    child.on('exit', done)
  })
}

// ===== Hermes 逐步编排（P2：子代理逐节点执行 + 人工/自评确认 + 打回原因重做） =====

/** 运行中 runner 注册表：key = `team:${teamTaskId}`（submit 幂等、confirm/reject 定位用） */
const stepRunners = new Map<string, StepRunnerHandle>()

/** 每个任务当前正在跑的 Hermes CLI 终止函数（stop 立即中断用） */
const stepAborts = new Map<string, () => void>()

/** 每任务自动确认开关（可中途切换；缺省 = 人工确认） */
const stepAutoConfirm = new Map<string, boolean>()

/** 逐步编排依赖：复用 CLI spawn；PATCH 回写 steps（含 pending_review/rawStatus）；上报 call_log + 产物登记 */
function buildStepRunnerDeps(token: string, taskKey: string, input: OrchestrateInput): StepRunnerDeps {
  const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  const base = buildHermesOrchestrateDeps(token)
  /** 回写路由：team 模式走团队任务接口；auto/agent 模式走「我的任务」接口（无团队归属） */
  const isTeamRoute = input.executeMode === 'team' || (!input.executeMode && input.teamId != null)
  return {
    runPrompt: async (prompt, opts) => {
      try {
        // 每次 Hermes CLI 调用前强制同步 config.yaml（Hermes CLI 每次读取；登录时异步同步可能未触发/失败）
        const cfg = await serviceManager.ensureHermesConfig()
        if (!cfg.ok) {
          console.error('[hermes-orchestrate] Hermes 推理配置同步失败（任务将失败）: ' + (cfg.reason || '未知原因'))
        }
        const { child, stdout, stderr } = base.spawnCli(prompt, opts)
        stepAborts.set(taskKey, () => {
          try {
            child.kill()
          } catch {
            /* ignore */
          }
        })
        const timeout = setTimeout(() => {
          try {
            child.kill()
          } catch {
            /* ignore */
          }
        }, 10 * 60 * 1000)
        const [out, err] = await Promise.all([stdout(), stderr()])
        clearTimeout(timeout)
        stepAborts.delete(taskKey)
        // Hermes CLI 每次调用都会在 stderr 打印 session_id 横幅（答案在 stdout）；
        // 仅当 stdout 为空时才把 stderr 视为失败，避免横幅误判（阶段2回归修复）
        const stdoutText = (out || '').trim()
        return stdoutText ? { stdout: out } : { stdout: out, ...(err ? { error: err } : {}) }
      } catch (err) {
        return { stdout: '', error: err instanceof Error ? err.message : String(err) }
      }
    },
    patchTask: async (teamId, taskId, payload) => {
      if (isTeamRoute && teamId != null) {
        await base.patchTask(teamId, taskId, { status: payload.status as TeamTaskStatus, result: payload.result })
      } else {
        const res = await fetch(`${ST_API_BASE}/team-tasks/${taskId}`, {
          method: 'PATCH',
          headers: auth,
          body: JSON.stringify({ status: payload.status, result: payload.result }),
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) throw new Error('PATCH team_task 失败: HTTP ' + res.status)
      }
    },
    reportExecution: async (payload) => {
      const res = await fetch(`${ST_API_BASE}/hermes/executions/report`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error('上报 call_log 失败: HTTP ' + res.status)
    },
    persistOutputs: async (taskId, outputs) => {
      await base.persistOutputs(taskId, {
        status: 'completed',
        summary: '',
        steps: [],
        outputs,
        error: null,
        durationMs: 0,
      })
    },
    // 沉淀闭环（P0.5）：Hermes 任务成功收尾 → 云端知识库（sedimentation/apply；taskId/executionRef 溯源）
    sedimentToCloud: async (payload) => {
      try {
        const res = await fetch(`${ST_API_BASE}/sedimentation/apply`, {
          method: 'POST',
          headers: auth,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(20000),
        })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          return { ok: false, error: 'HTTP ' + res.status + ': ' + text.slice(0, 200) }
        }
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
    isAutoConfirm: () => stepAutoConfirm.get(taskKey) ?? false,
    now: () => Date.now(),
    maxRetries: 2,
    retrieveKnowledge: async (query: string) => {
      try {
        const res = await fetch(ST_API_BASE + '/knowledge/search-all', {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({ query, topK: 4 }),
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) return ''
        const data = (await res.json()) as Array<{ content?: string; documentName?: string; kbName?: string }>
        if (!Array.isArray(data) || data.length === 0) return ''
        return data
          .filter((d): d is { content: string; documentName?: string; kbName?: string } => typeof d.content === 'string' && d.content.trim().length > 0)
          .slice(0, 4)
          .map((d) => (d.documentName ? d.content.trim() + '（来源：' + d.documentName + '）' : d.content.trim()))
          .join('\n\n')
      } catch (err) {
        console.warn('[step-runner] retrieveKnowledge failed:', err)
        return ''
      }
    },
  }
}

// ===== 无人值守定时任务引擎（主进程常驻；对标 RRClaw 计划任务） =====
// 把定时触发从「渲染进程（关窗口即停）」搬到主进程：窗口最小化到托盘后仍继续执行。
let cronEngine: CronEngine | null = null

/** 兼容后端统一响应包装 { code, data } 与裸值 */
function unwrapData<T>(json: unknown): T {
  if (json && typeof json === 'object' && 'data' in (json as Record<string, unknown>)) {
    return (json as Record<string, unknown>).data as T
  }
  return json as T
}

/** llm 路径执行器：创建团队任务 + 提交 Hermes 逐步编排（复用现有 stepRunners 与成员装载） */
async function runScheduledViaHermes(token: string, item: CronScheduledTask): Promise<{ teamTaskId: number }> {
  const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  let teamId = item.teamId ?? null
  if (!teamId) {
    const res = await fetch(ST_API_BASE + '/teams', { headers: auth, signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error('拉取团队失败: HTTP ' + res.status)
    const teams = unwrapData<Array<{ id?: number }>>(await res.json())
    teamId = Array.isArray(teams) ? teams[0]?.id ?? null : null
  }
  if (!teamId) throw new Error('没有可用团队，请先在团队页创建团队')
  const execRef = `sched:${item.id}:${Date.now()}`
  const createRes = await fetch(`${ST_API_BASE}/teams/${teamId}/tasks`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ title: item.title, description: item.description ?? item.title, executionRef: execRef }),
    signal: AbortSignal.timeout(15000),
  })
  if (!createRes.ok) throw new Error('创建团队任务失败: HTTP ' + createRes.status)
  const created = unwrapData<{ id: number }>(await createRes.json())
  const teamTaskId = created?.id
  if (typeof teamTaskId !== 'number') throw new Error('创建团队任务返回缺少 id')

  const input: OrchestrateInput = {
    executionRef: execRef,
    teamTaskId,
    teamId,
    executeMode: 'team',
    task: item.title,
    teamMembers: await loadTeamMembers(token, teamId),
  }
  input.reviewEnabled = true // 无人值守默认开启 Hermes 评审
  const taskKey = 'team:' + teamTaskId
  if (!stepRunners.has(taskKey)) {
    stepAutoConfirm.set(taskKey, true)
    const handle = createStepRunner(input, buildStepRunnerDeps(token, taskKey, input))
    stepRunners.set(taskKey, handle)
    void handle
      .wait()
      .then(() => undefined)
      .catch((e) => console.error('[cron-engine] step-runner 任务执行失败:', e))
      .finally(() => {
        stepRunners.delete(taskKey)
        stepAutoConfirm.delete(taskKey)
      })
  }
  return { teamTaskId }
}

/** 启动主进程定时任务引擎 + 注册开关 IPC */
function bootstrapCronEngine(): void {
  cronEngine = createCronEngine({
    stApiBase: ST_API_BASE,
    getToken: () => readRemoteToken() || null,
    runLlm: runScheduledViaHermes,
    createRun: async (input) => {
      if (localDb.isDegraded()) return null
      try {
        const runId = `sr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
        const r = await localDb.run(
          `INSERT INTO local_scheduled_runs (run_id, scheduled_id, user_id, title, execute_kind, flow_id, status, team_task_id)
           VALUES (?, ?, ?, ?, ?, ?, 'running', ?)`,
          [runId, input.scheduledId, input.userId, input.title ?? null, input.executeKind, input.flowId ?? null, input.teamTaskId ?? null],
        )
        return r.lastID ?? null
      } catch (err) {
        console.warn('[cron-engine] 写执行日志失败:', err)
        return null
      }
    },
    finishRun: async (id, patch) => {
      if (localDb.isDegraded()) return
      try {
        await localDb.run(
          `UPDATE local_scheduled_runs
             SET status = ?, error_message = ?, result_summary = ?, duration_ms = ?, finished_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [patch.status, patch.errorMessage ?? null, patch.resultSummary ?? null, patch.durationMs ?? null, id],
        )
      } catch (err) {
        console.warn('[cron-engine] 回填执行日志失败:', err)
      }
    },
    notify: (payload) => {
      const win = getMainWindow()
      if (win && !win.isDestroyed()) win.webContents.send('cron-engine:event', payload)
    },
    statePath: defaultCronEngineStatePath(app.getPath('userData')),
    logger: {
      info: (m) => console.log('[cron-engine] ' + m),
      warn: (m) => console.warn('[cron-engine] ' + m),
      error: (m) => console.error('[cron-engine] ' + m),
    },
  })
  ipcMain.handle('cron-engine:get-state', () => cronEngine?.getState() ?? null)
  ipcMain.handle('cron-engine:set-enabled', (_e, enabled: unknown) => cronEngine?.setEnabled(enabled === true) ?? null)
  ipcMain.handle('cron-engine:run-now', async (_e, taskId: number) => {
    if (!cronEngine) return { executed: false, error: '引擎未启动' }
    return cronEngine.runNow(taskId)
  })
  // 守护服务（Windows 计划任务）：让定时任务在客户端完全退出后仍能执行
  const cronService = createCronService({ execPath: process.execPath, isPackaged: app.isPackaged })
  ipcMain.handle('cron-service:status', () => cronService.status())
  ipcMain.handle('cron-service:install', () => cronService.install())
  ipcMain.handle('cron-service:uninstall', () => cronService.uninstall())
  cronEngine.start()
}

/** 定时守护模式启动序列（--shentong-cron-daemon；无窗口/托盘，仅主进程定时引擎） */
async function startCronDaemon(): Promise<void> {
  try {
    app.setAppUserModelId('com.shentong.ai')
  } catch {
    /* ignore */
  }
  await app.whenReady()
  cleanupStaleTempFiles()
  console.log('[cron-daemon] 定时守护启动（无窗口模式）')
  bootstrapCronEngine()
}

// 日志落盘：主进程 console 输出同步写入 userData/logs/main.log，便于远程排查
// 注意：必须先禁用 electron-log 的 console 传输，否则 log.* → console 传输 → console.*(已包装) → log.* 会递归；
// 且在 stdout/stderr 管道断开（EPIPE）时会无限触发 uncaughtException（7-26 日志已出现）
log.initialize()
log.transports.file.level = 'info'
// 安全审计 S-75：日志文件在 userData 下，会被导出/备份/同步 —— 限制单文件体积，避免写满磁盘
log.transports.file.maxSize = 5 * 1024 * 1024
log.transports.console.level = false
const __consoleLog = console.log.bind(console)
const __consoleWarn = console.warn.bind(console)
const __consoleError = console.error.bind(console)
// 打包版仅写文件（无终端），dev 下保留终端输出
const mirrorToConsole = !app.isPackaged
// 落盘前脱敏（安全审计 S-75/S-30）：凭据不得进入日志文件。
// dev 终端输出保持原样，避免本地调试时看不清真实内容。
const redactArgs = (args: unknown[]): unknown[] => args.map((a) => redactValue(a))
console.log = (...args: unknown[]) => { log.info(...redactArgs(args)); if (mirrorToConsole) __consoleLog(...args) }
console.warn = (...args: unknown[]) => { log.warn(...redactArgs(args)); if (mirrorToConsole) __consoleWarn(...args) }
console.error = (...args: unknown[]) => { log.error(...redactArgs(args)); if (mirrorToConsole) __consoleError(...args) }

// ===== 全局异常兜底（安全审计 S-30 / S-79） =====
// 目的：主进程异常不再「静默失联」——先写盘留证据，再尽量保住运行；
// 渲染进程崩溃则尝试自动重载一次（只一次，避免崩溃循环把 CPU 打满）。
process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason)
})

let rendererReloadAttempts = 0
app.on('render-process-gone', (_event, _webContents, details) => {
  console.error('[main] render-process-gone:', details)
  if (details?.reason === 'clean-exit') return
  if (rendererReloadAttempts < 1) {
    rendererReloadAttempts += 1
    console.warn('[main] 渲染进程异常退出，自动重载一次')
    try {
      getMainWindow()?.reload()
    } catch (err) {
      console.error('[main] 渲染进程重载失败:', err)
    }
    return
  }
  console.warn('[main] 渲染进程再次异常退出，已停止自动重载，请手动重启应用')
})
app.on('child-process-gone', (_event, details) => {
  console.error('[main] child-process-gone:', details)
})

const serviceManager = new ServiceManager()
// ===== 自动化工作台：远程控制（IM→设备→执行→回传） =====
// 桌面端作为"执行器"：连接云端 sync 网关接收 remote:command，执行后 remote:result 回传
const remoteControl = getRemoteControlManager()
const remoteApiBase = ST_API_BASE.replace(/\/api$/, '')
/** Hermes 对话服务（registerIpcHandlers 内初始化；B1 统一对话入口） */
let hermesChatService: HermesChatService | null = null
/** Hermes 会话首选模型（setModel 写入；send 未显式指定时缺省取用） */
let hermesPreferredModel = ''
/** Hermes 本地 API 端口（与 hermes-client.ts / service-manager 注入一致） */
const HERMES_LOCAL_PORT = 8642

/** 读取云端登录 token（auth.json 由渲染层登录时同步写入；已加密落盘，见 secure-json-store） */
function readRemoteToken(): string {
  return readAuthToken()
}

/**
 * 确保本地 Hermes Agent 运行并监听 :8642：
 * 状态 running 但端口未监听（残留/假活）→ 强制重启；未运行 → 启动；随后等待端口就绪。
 */
async function ensureHermes(): Promise<void> {
  const info = serviceManager.getInfo('hermes')
  const alive = info && info.status === 'running' && (await waitForLocalPort(HERMES_LOCAL_PORT, 2000, 500))
  if (alive) return
  if (info && info.status === 'running') {
    console.log('[hermes-chat] Hermes 状态异常（端口未监听），自动重启...')
    const ok = await serviceManager.restart('hermes')
    if (!ok) throw new Error('Hermes 重启失败，请到服务管理页检查后再试')
  } else {
    console.log('[hermes-chat] Hermes 未运行，自动启动...')
    const ok = await serviceManager.start('hermes')
    if (!ok) throw new Error('Hermes 启动失败，请到服务管理页检查后再试')
  }
  const ready = await waitForLocalPort(HERMES_LOCAL_PORT)
  if (!ready) throw new Error('Hermes 启动超时，请稍后重试')
}

/** 启动远程控制：注入依赖 + 读取本地 token，有 token 即连接云端网关 */
async function bootstrapRemoteControl(): Promise<void> {
  try {
    remoteControl.setApiBaseProvider(async () => remoteApiBase)
    remoteControl.setAuthTokenProvider(async () => readRemoteToken() || null)
    remoteControl.setStatusProvider(() => serviceManager.getAllStatus())
    remoteControl.setChatProvider(createRemoteChatProvider())
    const fp = await getDeviceFingerprint()
    remoteControl.setConfig({ serverUrl: remoteApiBase, token: readRemoteToken(), deviceId: fp.fingerprint })
    if (readRemoteToken()) {
      remoteControl.updateSettings({ enabled: true, securityLevel: 'medium' })
    }
  } catch (err) {
    console.warn('[remote-control] bootstrap failed:', err)
  }
}

/** 自动化工作台对话咨询：未知命令 → 本地 Hermes AI 回答 */
function createRemoteChatProvider(): (text: string) => Promise<string | null> {
  return async (text: string): Promise<string | null> => {
    const svc = hermesChatService
    const token = readRemoteToken()
    if (!svc || !token) return null
    let fullText = ''
    try {
      await svc.send(
        { text, token },
        (chunk) => { fullText += chunk },
        () => undefined,
      )
    } catch (err) {
      console.warn('[remote-control] 对话咨询失败，回退无法识别:', (err as Error).message)
      return null
    }
    const trimmed = fullText?.trim?.() ?? ''
    return trimmed ? trimmed.slice(0, 2000) : null
  }
}
const isDev = !app.isPackaged
let appUpdater: AppUpdater | null = null

// 单实例锁 - 防止多开
// ===== computer-control MCP 模式（--shentong-mcp-server 拉起，不创建窗口/托盘） =====
if (process.argv.includes('--shentong-mcp-server')) {
  app.whenReady().then(() => {
    void runComputerControlMcpServer().catch((err) => {
      console.error('[computer-control-mcp] 服务异常:', err)
      process.exit(1)
    })
  })
} else if (process.argv.includes(CRON_DAEMON_FLAG)) {
  // 定时守护模式：计划任务登录拉起，不建窗口/托盘，仅跑主进程定时引擎（客户端完全退出也继续执行）
  void startCronDaemon()
} else {
  const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    // 清理旧版本遗留的下载临时文件（避免残留半成品导致“运行时下载失败”）
    cleanupStaleTempFiles()
    // 一次性迁移旧版 OpenClaw 数据目录（OpenClaw 已移除）
    migrateLegacyOpenClawData()
    app.setAppUserModelId('com.shentong.ai')

    // P0-2: IPC 安全边界——注册任何通道前安装来源校验守卫（只信任主窗口顶层页面）
    initIpcGuard(() => getMainWindow(), isDev)
    hardenIpc()

    const mainWindow = createMainWindow(serviceManager, isDev)
    createTray(mainWindow, serviceManager)
    // 扫码登录阶段推进广播到主窗口（waiting/scanned/expired/success/error）
    setScanEventSink((event) => {
      try {
        if (!mainWindow.isDestroyed()) mainWindow.webContents.send('platform-account:scan-status', event)
      } catch {
        /* 窗口广播失败不影响扫码 */
      }
    })
    // n8n 界面汉化注入（n8n-trans 用户脚本，幂等）：n8n 每次加载即把汉化脚本注入内嵌 iframe
    ensureN8nI18n()

    // 本地 n8n 自动登录注入：n8n 每次就绪后自动登录并给 iframe 请求附加会话 Cookie
    // （Electron 新内核阻止第三方 Cookie，iframe 内无法保存登录态，必须由主进程注入）
    serviceManager.on('status-changed', (name: string, status: string) => {
      if (name === 'n8n' && status === 'running') {
        void ensureN8nAuth()
        ensureN8nI18n()
      }
    })
    // 自动更新：启动时实例化并检查更新（Task 35.3）
    appUpdater = new AppUpdater(mainWindow)
    appUpdater.checkForUpdates()
    registerIpcHandlers()
    registerHermesFsIpc()
    // 无人值守定时任务引擎（主进程常驻）：窗口关闭/最小化到托盘后仍按到期执行
    bootstrapCronEngine()
    // 自动化工作台 D4：开机自启（托盘常驻，保证 IM→设备闭环开机即用）
    try {
      app.setLoginItemSettings({ openAtLogin: true })
    } catch (err) {
      console.warn('[remote-control] 开机自启设置失败:', err)
    }    // 自动化工作台 D1：注册 computer-control MCP 服务（幂等）
    registerComputerControlMcp()
    // 自动化工作台：启动远程控制（有登录 token 即连接云端）
    void bootstrapRemoteControl()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow(serviceManager, isDev)
      }
    })
  })

  // 应用退出前标记，允许窗口真正关闭
  app.on('before-quit', () => {
    setQuitting(true)
    cronEngine?.stop()
    void serviceManager.stopAll()
    remoteControl.destroy()
  })

  app.on('will-quit', () => {
    destroyTray()
  })
}

// 主窗口全部关闭时不退出（最小化到托盘）
// Windows/Linux: 托盘常驻模式，用户可通过托盘菜单恢复窗口
// macOS: 标准行为是不退出，activate 事件负责重建窗口（已在上方处理）
app.on('window-all-closed', () => {
  // 由托盘 + close 拦截处理，这里不做退出
})

/** 注册 IPC 处理器 */
function registerIpcHandlers(): void {
  const llmIntegrations = new LlmIntegrationsStore(
    join(app.getPath('userData'), 'llm-integrations.json'),
  )

  // ===== Hermes 本地直达对话（B1 统一对话入口；计费归引擎层 llm-proxy） =====
  const getSoulOverrideDir = () => join(app.getPath('userData'), 'hermes-chat', 'soul');
  const readProfileSoul = (profileId: string): string | null => {
    try {
      const overrideFile = join(getSoulOverrideDir(), profileId + '.md');
      if (existsSync(overrideFile)) return readFileSync(overrideFile, 'utf8');
      const file = join(getEdictProfilesDir(), profileId + '.md');
      if (!existsSync(file)) return null;
      return readFileSync(file, 'utf8');
    } catch {
      return null;
    }
  };
  hermesChatService = new HermesChatService({
    sessionToken: () => getCredential(HERMES_SESSION_TOKEN_CREDENTIAL) ?? '',
    contextDir: authContextDir(),
    // 敏感凭据（auth.json）走 safeStorage 保护的密文落盘，禁止明文（安全审计 S-05）
    writeSecureFile: writeSecureJson,
    readSoul: readProfileSoul,
  })

  // 登录/刷新 token 时同步写 auth.json（n8n-run-workflow 工具卡读 ST_AUTH_FILE）
  ipcMain.on('hermes-chat:sync-auth', (_event, token: unknown) => {
    if (typeof token === 'string' && token.trim()) {
      hermesChatService!.syncAuthToken(token.trim())
      // 自动化工作台：登录/刷新 token 后更新远程控制连接（IM→设备闭环需要有效 JWT）
      void (async () => {
        const fp = await getDeviceFingerprint()
        remoteControl.setConfig({ serverUrl: remoteApiBase, token: token.trim(), deviceId: fp.fingerprint })
        if (!remoteControl.getSettings().enabled) {
          remoteControl.updateSettings({ enabled: true, securityLevel: 'medium' })
        } else {
          await remoteControl.disconnect()
          await remoteControl.connect().catch((err: Error) => {
            console.error('[remote-control] reconnect on token refresh failed:', err)
          })
        }
      })()
    }
  })

  // 飞书平台设置（凭证解密读取）；战略文档读取与多维表格初始化共用
  const feishuDeps: FeishuSettingsDeps = {
    getCredential: (k) => getCredential(k),
    setCredential: (k, v) => setCredential(k, v),
    deleteCredential: (k) => deleteCredential(k),
  }
  /**
   * 战略方向文档运行时读取（best-effort）：中书省节点取全文、尚书省派发节点取摘要。
   * 凭证可能刚保存，每次调用现建客户端；读不到返回 null，编排在 prompt 里注明「战略未接入」。
   */
  const readStrategy = async (maxChars: number) => {
    const client = buildFeishuClient(feishuDeps)
    if (!client) return null
    const res = await readStrategicDoc(getEdictDataRoot(), client, { maxChars })
    if (!res.text) return null
    const source = res.source === 'feishu' ? (res.fetchedAt ? '飞书实时（' + res.fetchedAt + '）' : '飞书实时') : res.source === 'cache' ? '缓存' : '未知'
    return { text: res.text, source }
  }
  /** 规范/蓝本只读根（开发 resources/，打包 process.resourcesPath）：建表与产出落飞书共用 */
  const edictResourcesRoot = app.isPackaged ? process.resourcesPath : join(process.cwd(), 'resources')
  /**
   * 产出落飞书（best-effort）：任务创建/收口时把任务记录写「军机处·任务主表」、产出写「归档索引表」。
   * 未建表 / 未配凭证 / 接口失败都只记日志，不影响看板流程。
   */
  const syncTaskToFeishu = async (task: EdictTask) => {
    const client = buildFeishuClient(feishuDeps)
    if (!client) return
    const writer = { dataRoot: getEdictDataRoot(), resourcesRoot: edictResourcesRoot, client }
    const taskRes = await appendTaskToBoard(writer, task)
    if (!taskRes.ok && !taskRes.skipped) console.warn('[feishu-board] 任务主表写入失败: ' + taskRes.error)
    if (task.output) {
      const archiveRes = await appendArchiveToBoard(writer, {
        taskId: task.id,
        title: task.title,
        agentLabel: task.official || '官署',
        output: task.output,
      })
      if (!archiveRes.ok && !archiveRes.skipped) console.warn('[feishu-board] 归档索引写入失败: ' + archiveRes.error)
    }
  }
  const edictDeps = createEdictDeps({ readStrategy, syncTaskToFeishu })
  const disposeEdictIpc = registerEdictIpc(edictDeps, { pollIntervalMs: 3000 })
  const disposeEdictExtraIpc = registerEdictExtraIpc(
    createEdictExtraDeps(edictDeps, {
      // P1：Hermes 真实运行状态（serviceManager 服务状态 + 端口监听），替代 config.yaml 假状态
      getHermesRuntimeStatus: async () => {
        const st = await serviceManager.getServiceStatus("hermes");
        const alive = st === "running";
        return {
          alive,
          probe: alive,
          status: alive ? "Hermes 运行时正常" : st === "unknown" ? "Hermes 状态未知（未启动）" : "Hermes 运行时未启动",
          checkedAt: new Date().toISOString(),
        };
      },
    }),
    {}
  )
  // 官署详情：飞书表清单 / SOUL 占位符渲染（定时任务与执行日志走既有 scheduled-task / scheduledRuns API）
  const disposeOfficialDetailIpc = registerOfficialDetailIpc({
    dataRoot: getEdictDataRoot(),
    readSoul: (id) => {
      try {
        const overrideFile = join(getSoulOverrideDir(), id + '.md')
        if (existsSync(overrideFile)) return readFileSync(overrideFile, 'utf8')
        const bp = join(getEdictProfilesDir(), id + '.md')
        if (!existsSync(bp)) return null
        return readFileSync(bp, 'utf8')
      } catch {
        return null
      }
    },
  })
  // 飞书平台设置 + 多维表格一键创建
  const initFeishuBitable = async (options?: { force?: boolean }) => {
    const client = buildFeishuClient(feishuDeps)
    if (!client) return { ok: false, error: '飞书凭证未配置' }
    return initBitable({
      client,
      dataRoot: getEdictDataRoot(),
      resourcesRoot: edictResourcesRoot,
      force: options?.force,
      onProgress: (p) => {
        const win = getMainWindow()
        if (win && !win.isDestroyed()) win.webContents.send('feishu:init-progress', p)
      },
    })
  }
  /**
   * 战略方向文档：由**中书省**牵头维护（一键组队第 5 步）。
   * 创建/复用飞书云文档 → 回填中书省表清单 → 重写中书省 SOUL 让占位符变成真实链接。
   */
  const runStrategicDoc = async () => {
    const client = buildFeishuClient(feishuDeps)
    if (!client) return { ok: false, error: '飞书凭证未配置，跳过战略方向文档' }
    return createOrReuseStrategicDoc({
      client,
      dataRoot: getEdictDataRoot(),
      // 建档后往「中书省·战略表」补 V1.0（best-effort：失败不影响建档）
      recordInitialVersion: async (state) => {
        const client = buildFeishuClient(feishuDeps)
        if (!client) return
        const res = await appendStrategyVersionToBoard(
          { dataRoot: getEdictDataRoot(), resourcesRoot: edictResourcesRoot, client },
          {
            version: 'V1.0',
            reason: '一键组队首次建档',
            summary: '按《战略方向文档》初始提纲建立战略基准（目标/客户/打法/资源/度量/风险）',
            kpi: '方案一次通过率 ≥60%',
            execTable: '军机处·任务主表（共享）',
          },
        )
        if (!res.ok && !res.skipped) console.warn('[feishu-board] 战略表写入失败: ' + res.error)
      },
      refreshSoul: () => {
        try {
          writeRenderedSoul(
            join(getEdictProfilesDir(), 'zhongshu.md'),
            join(app.getPath('userData'), 'hermes-home', 'profiles', 'zhongshu', 'SOUL.md'),
            getOfficialTables(getEdictDataRoot(), 'zhongshu'),
          )
        } catch {
          // 刷新 SOUL 失败不影响战略文档本身
        }
      },
    })
  }
  /** 预填种子数据（对标 RRClaw「爆款提示词.csv」预填）：把《关键词种子.json》灌进「礼部·关键词表」 */
  const seedTemplates = async () => {
    const client = buildFeishuClient(feishuDeps)
    if (!client) return { ok: false, error: '飞书凭证未配置，跳过种子数据' }
    const res = await seedStarterData({ dataRoot: getEdictDataRoot(), resourcesRoot: edictResourcesRoot, client })
    if (!res.ok && !res.skipped) return { ok: false, error: res.error }
    return { ok: true }
  }
  const disposeFeishuIpc = registerFeishuIpc({
    ...feishuDeps,
    initTables: initFeishuBitable,
    getBitable: () => readBitableState(getEdictDataRoot()),
  })

  // 一键组队（套餐 → 飞书表 + SOUL + Agent + 定时任务）
  const disposeTeamIpc = registerTeamIpc({
    hermesHome: join(app.getPath('userData'), 'hermes-home'),
    userDataDir: app.getPath('userData'),
    edictProfilesDir: getEdictProfilesDir(),
    edictDataRoot: getEdictDataRoot(),
    initBitable: initFeishuBitable,
    createStrategicDoc: runStrategicDoc,
    seedTemplates,
    ensureAgents: (ids) => ensureEdictHermesProfiles(ids),
    stApiBase: ST_API_BASE,
    getAuthToken: readRemoteToken,
    emitProgress: (p) => {
      const win = getMainWindow()
      if (win && !win.isDestroyed()) win.webContents.send('team:creation-progress', p)
    },
  })
  app.on('will-quit', () => {
    disposeFeishuIpc()
    disposeTeamIpc()
  })

  // 引导官署 Hermes profiles（幂等：缺失创建 + SOUL.md 注入 + config.yaml 同步），失败不影响启动
  // 只补当前「编制」（一键组队选的套餐）内的官署：编制外的不再被无脑建回来
  ensureEdictHermesProfiles(undefined, resolveRoster(app.getPath('userData'))).then((r) => {
    if (r.created.length) console.log('[edict-bridge] 已引导官署 profiles: ' + r.created.join(','))
    else if (!r.ok) console.warn('[edict-bridge] 官署 profiles 引导跳过: ' + (r.reason || '未知'))
  })
  app.on('will-quit', () => {
    disposeEdictIpc()
    disposeEdictExtraIpc()
    disposeOfficialDetailIpc()
  })


  // 注入用户 llm-proxy 静态 Key（登录后由渲染层调用；Hermes / ST-Claw 模型通道指向云端 llm-proxy）
  ipcMain.on('hermes-chat:set-proxy-key', (_event, key: string) => {
    serviceManager.setLlmProxyKey(key || '')
  })

  // ===== Hermes 对话 IPC（:8642 OpenAI 兼容流式；计费归引擎层 llm-proxy） =====
  ipcMain.handle(
    'hermes-chat:send',
    async (
      event,
      payload: {
        text: string
        token: string
        history?: HermesChatMessage[]
        knowledgeBaseId?: number
        sessionId?: number
        modelId?: string
        profileId?: string
        soul?: string
        reasoningEffort?: string
      },
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const push = (channel: string, data: unknown): void => {
        if (win && !win.isDestroyed()) {
          win.webContents.send(channel, data)
        }
      }
      try {
        await ensureHermes()
        const result = await hermesChatService!.send(
          {
            text: payload.text,
            token: payload.token,
            history: payload.history,
            knowledgeBaseId: payload.knowledgeBaseId,
            sessionId: payload.sessionId,
            modelId: payload.modelId || hermesPreferredModel || undefined,
            profileId: payload.profileId,
            soul: payload.soul,
            reasoningEffort: payload.reasoningEffort,
          },
          (chunk) => push('hermes-chat:message', { content: chunk }),
          (e) => {
            if (e.type === 'tool-call') push('hermes-chat:tool-call', e.toolCall)
            else if (e.type === 'finalize') push('hermes-chat:finalize', { content: e.content })
            else if (e.type === 'done') push('hermes-chat:done', { usage: e.usage })
            else if (e.type === 'lifecycle') push('hermes-chat:lifecycle', e.lifecycle)
          },
        )
        push('hermes-chat:done', { usage: result.usage })
        return { ok: true, aborted: result.aborted }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[hermes-chat] send failed:', message)
        push('hermes-chat:error', { message })
        return { ok: false }
      }
    },
  )

  ipcMain.on('hermes-chat:abort', () => {
    hermesChatService!.abort()
  })

  // 同步用户首选对话模型（send 未显式指定模型时缺省取用；引擎仍走 llm-proxy 映射）
  ipcMain.on('hermes-chat:set-model', (_event, modelId: string) => {
    hermesPreferredModel = typeof modelId === 'string' ? modelId.trim() : ''
  })

  // Hermes dashboard gateway WS URL（token 内嵌；渲染层建立 JSON-RPC WS）
  ipcMain.handle('hermes-gateway:get-url', () => {
    const token = getCredential(HERMES_SESSION_TOKEN_CREDENTIAL) ?? ''
    if (!token) return { error: 'Hermes 会话 token 缺失' }
    return { wsUrl: 'ws://127.0.0.1:8642/api/ws?token=' + encodeURIComponent(token) }
  })

  // 官署人格 SOUL 读取/保存（自定义覆盖优先；无覆盖时回退蓝本）
  ipcMain.handle('hermes-soul:get', (_event, profileId: unknown) => {
    const id = typeof profileId === 'string' && profileId.trim() ? profileId.trim() : ''
    if (!id) return { ok: false, error: '人格 id 为空' }
    try {
      const overrideFile = join(getSoulOverrideDir(), id + '.md')
      if (existsSync(overrideFile)) return { ok: true, id, content: readFileSync(overrideFile, 'utf8'), source: 'custom' }
      const blueprintFile = join(getEdictProfilesDir(), id + '.md')
      if (existsSync(blueprintFile)) return { ok: true, id, content: readFileSync(blueprintFile, 'utf8'), source: 'blueprint' }
      return { ok: false, id, error: '未找到该人格的 SOUL' }
    } catch (err) {
      return { ok: false, id, error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle('hermes-soul:save', (_event, profileId: unknown, content: unknown) => {
    const id = typeof profileId === 'string' && profileId.trim() ? profileId.trim() : ''
    const text = typeof content === 'string' ? content : ''
    if (!id) return { ok: false, error: '人格 id 为空' }
    try {
      const dir = getSoulOverrideDir()
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, id + '.md'), text, 'utf8')
      return { ok: true, id }
    } catch (err) {
      return { ok: false, id, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // 设置页每类默认模型同步（方案 B：chat/vision/image/video/tts → Hermes/ST-Claw 配置 + 重启）
  ipcMain.on('model-defaults:sync', (_event, dto: unknown) => {
    void serviceManager.syncModelDefaults(dto == null ? null : (dto as import('./model-defaults').UserModelDefaultsInput))
  })

  // ===== 本地 Hermes 技能中心（hermes skills CLI 封装） ===== 
  ipcMain.handle('hermes-skills:list', () => listSkills())
  ipcMain.handle('hermes-skills:search', (_e, query: string) => searchSkills(typeof query === 'string' ? query : ''))
  ipcMain.handle('hermes-skills:install', (_e, identifier: string) => installSkill(typeof identifier === 'string' ? identifier : ''))
  ipcMain.handle('hermes-skills:update', (_e, name?: string) => updateSkills(typeof name === 'string' && name ? name : undefined))
  ipcMain.handle('hermes-skills:uninstall', (_e, name: string) => uninstallSkill(typeof name === 'string' ? name : ''))
  ipcMain.handle('hermes-skills:check', () => checkSkills())
  ipcMain.handle('hermes-skills:install-local', async () => {
    const win = getMainWindow() ?? BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win ?? undefined as any, {
      title: '选择包含 SKILL.md 的本地技能文件夹',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (res.canceled || !res.filePaths[0]) return { ok: false, error: '已取消选择' }
    return installSkillLocal(res.filePaths[0])
  })
  // ===== Hermes 官方状态（P1：/api/status + /api/system/stats，面板只读；各失败独立降级为 null） =====
  ipcMain.handle('hermes-status:get', async () => {
    const client = new HermesClient()
    const [status, stats] = await Promise.all([
      client.status().catch(() => null),
      client.getSystemStats().catch(() => null),
    ])
    return { status, stats }
  })
  // ===== Hermes 记忆本地读写桥（MEMORY.md/USER.md；add/replace/remove/list） =====
  ipcMain.handle('hermes-memory:list', (_e, target) => handleMemoryOp('list', target))
  ipcMain.handle('hermes-memory:add', (_e, target, text) => handleMemoryOp('add', target, text))
  ipcMain.handle('hermes-memory:replace', (_e, target, match, text) => handleMemoryOp('replace', target, match, text))
  ipcMain.handle('hermes-memory:remove', (_e, target, text) => handleMemoryOp('remove', target, text))

  // ===== Hermes 第三方记忆 Provider 配置（active + env，本地 JSON 持久化） =====
  ipcMain.handle('hermes-memory-provider:get', () => handleMemoryProviderOp('get'))
  ipcMain.handle('hermes-memory-provider:set-active', (_e, name) => handleMemoryProviderOp('set-active', name))
  ipcMain.handle('hermes-memory-provider:set-env', (_e, name, key, value) => handleMemoryProviderOp('set-env', name, key, value))

  // ===== Hermes 工具集启用/停用（config.yaml platform_toolsets.cli） =====
  ipcMain.handle('hermes-tools:get', () => ({ ok: true, toolsets: getHermesToolsets() }))
  ipcMain.handle('hermes-tools:set-enabled', (_e, key, enabled) => setHermesToolsetEnabled(typeof key === 'string' ? key : '', enabled === true))
  ipcMain.handle('hermes-tools:list-mcp', () => ({ ok: true, servers: getHermesMcpServers() }))

  // ===== Hermes 逐步编排（团队任务 → 子代理逐节点执行 + 人工/自评确认 + 打回原因重做） =====
  ipcMain.handle(
    'hermes-orchestrate:submit',
    async (_event, payload: { token: string; input: OrchestrateInput; autoConfirm?: boolean; reviewEnabled?: boolean; reviewModel?: string }) => {
      if (!payload?.token || !payload?.input) return { ok: false, error: '参数缺失' }
      try {
        const input = { ...payload.input }
        // Hermes 独立评审：默认开启（产品默认）；reviewModel 可选（缺省用默认 chat 模型）
        input.reviewEnabled = payload.reviewEnabled !== false
        if (typeof payload.reviewModel === 'string' && payload.reviewModel) input.reviewModel = payload.reviewModel
        const executeMode = input.executeMode ?? (input.teamId != null ? 'team' : 'auto')
        input.executeMode = executeMode
        // 成员来源按执行方式：team=团队成员；agent=单个 Agent；auto=不注入（Hermes 原生子代理）
        if (executeMode === 'team' && !input.teamMembers && input.teamId != null) {
          input.teamMembers = await loadTeamMembers(payload.token, input.teamId)
        } else if (executeMode === 'agent' && input.agentId != null && !input.teamMembers) {
          const agentProfile = await loadAgentProfile(payload.token, input.agentId)
          if (agentProfile) input.teamMembers = [agentProfile]
        }
        // 协作流程注入：仅团队模式；未显式传 workflow 时拉取团队已配置流程（Hermes 按流程当主干，不跳步）
        if (executeMode === 'team' && !input.workflow && input.teamId != null) {
          try {
            const wfRes = await fetch(ST_API_BASE + '/teams/' + input.teamId + '/workflow', {
              headers: { Authorization: 'Bearer ' + payload.token },
              signal: AbortSignal.timeout(10000),
            })
            if (wfRes.ok) {
              const raw = (await wfRes.json()) as Array<{
                id?: number
                name?: unknown
                description?: unknown
                sortOrder?: unknown
                assigneeMemberIds?: unknown
              }>
              if (Array.isArray(raw) && raw.length > 0) {
                input.workflow = raw
                  .filter((n) => n && typeof n.name === 'string' && n.name.trim().length > 0)
                  .map((n, i) => ({
                    id: typeof n.id === 'number' ? n.id : undefined,
                    name: String(n.name).trim(),
                    ...(typeof n.description === 'string' && n.description.trim() ? { description: n.description } : {}),
                    order: Number.isFinite(Number(n.sortOrder)) ? Number(n.sortOrder) : i,
                    ...(Array.isArray(n.assigneeMemberIds) && n.assigneeMemberIds.length > 0
                      ? { assigneeIds: n.assigneeMemberIds.filter((x: unknown) => typeof x === 'number') }
                      : {}),
                  }))
                  .sort((a, b) => a.order - b.order)
              }
            }
          } catch (err) {
            console.warn('[hermes-orchestrate] 拉取团队协作流程失败，按动态拆解继续:', err)
          }
        }
        const taskKey = 'team:' + input.teamTaskId
        if (stepRunners.has(taskKey)) return { ok: true, started: true } // 已在运行：幂等，不重复起
        stepAutoConfirm.set(taskKey, !!payload.autoConfirm)
        const handle = createStepRunner(input, buildStepRunnerDeps(payload.token, taskKey, input))
        stepRunners.set(taskKey, handle)
        void handle
          .wait()
          .then(() => undefined)
          .catch((e) => { console.error("[step-runner] 任务执行失败:", e); })
          .finally(() => {
            stepRunners.delete(taskKey)
            stepAutoConfirm.delete(taskKey)
          })
        return { ok: true, started: true }
      } catch (err) {
        console.error('[hermes-orchestrate] submit failed:', err)
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )

  ipcMain.handle(
    'hermes-orchestrate:pause',
    async (_event, payload: { teamTaskId: number }) => {
      if (!payload?.teamTaskId) return { ok: false, error: '参数缺失' }
      const handle = stepRunners.get('team:' + payload.teamTaskId)
      if (!handle) return { ok: false, error: '任务未在运行' }
      handle.pause()
      return { ok: true }
    },
  )

  ipcMain.handle(
    'hermes-orchestrate:resume',
    async (_event, payload: { teamTaskId: number }) => {
      if (!payload?.teamTaskId) return { ok: false, error: '参数缺失' }
      const handle = stepRunners.get('team:' + payload.teamTaskId)
      if (!handle) return { ok: false, error: '任务未在运行' }
      handle.resume()
      return { ok: true }
    },
  )

  ipcMain.handle(
    'hermes-orchestrate:stop',
    async (_event, payload: { teamTaskId: number }) => {
      if (!payload?.teamTaskId) return { ok: false, error: '参数缺失' }
      const handle = stepRunners.get('team:' + payload.teamTaskId)
      if (!handle) return { ok: false, error: '任务未在运行' }
      handle.stop()
      return { ok: true }
    },
  )

  ipcMain.handle(
    'hermes-orchestrate:delete',
    async (_event, payload: { token: string; teamId?: number; teamTaskId: number }) => {
      if (!payload?.token || !payload.teamTaskId) return { ok: false, error: '参数缺失' }
      const taskKey = 'team:' + payload.teamTaskId
      const handle = stepRunners.get(taskKey)
      if (handle) handle.stop() // 删除前先停止运行
      // 删除路由：team 模式走团队任务接口；auto/agent 模式（无团队归属）走「我的任务」接口
      const url = payload.teamId != null
        ? `${ST_API_BASE}/teams/${payload.teamId}/tasks/${payload.teamTaskId}`
        : `${ST_API_BASE}/team-tasks/${payload.teamTaskId}`
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + payload.token },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) return { ok: false, error: '删除失败: HTTP ' + res.status }
      return { ok: true }
    },
  )
  ipcMain.handle(
    'hermes-orchestrate:confirm-step',
    async (_event, payload: { token: string; teamTaskId: number; stepIndex: number }) => {
      if (!payload?.teamTaskId || typeof payload.stepIndex !== 'number') return { ok: false, error: '参数缺失' }
      const handle = stepRunners.get('team:' + payload.teamTaskId)
      if (!handle) return { ok: false, error: '任务未在运行（可能未开始或已结束）' }
      handle.confirmStep(payload.stepIndex)
      return { ok: true }
    },
  )

  ipcMain.handle(
    'hermes-orchestrate:reject-step',
    async (_event, payload: { token: string; teamTaskId: number; stepIndex: number; reason?: string }) => {
      if (!payload?.teamTaskId || typeof payload.stepIndex !== 'number') return { ok: false, error: '参数缺失' }
      const reason = typeof payload.reason === 'string' ? payload.reason.trim() : ''
      if (!reason) return { ok: false, error: '打回必须填写原因' }
      const handle = stepRunners.get('team:' + payload.teamTaskId)
      if (!handle) return { ok: false, error: '任务未在运行（可能未开始或已结束）' }
      handle.rejectStep(payload.stepIndex, reason)
      return { ok: true }
    },
  )

  ipcMain.handle(
    'hermes-orchestrate:set-auto-confirm',
    async (_event, payload: { token: string; teamTaskId: number; autoConfirm: boolean }) => {
      if (!payload?.teamTaskId) return { ok: false, error: '参数缺失' }
      const taskKey = 'team:' + payload.teamTaskId
      if (!stepRunners.has(taskKey)) return { ok: false, error: '任务未在运行（可能未开始或已结束）' }
      stepAutoConfirm.set(taskKey, !!payload.autoConfirm)
      return { ok: true }
    },
  )

ipcMain.handle(
    'hermes-orchestrate:load-members',
    async (_event, payload: { token: string; teamId: number }) => {
      if (!payload?.token || !payload?.teamId) return { ok: false, error: '参数缺失' }
      try {
        const members = await loadTeamMembers(payload.token, payload.teamId)
        return { ok: true, members }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )

  // ===== 自定义大模型接入（本机保存） =====
  ipcMain.handle('llm-integrations:list', () => llmIntegrations.list())
  ipcMain.handle('llm-integrations:save', (_e, integration: LlmIntegration) =>
    llmIntegrations.save(integration),
  )
  ipcMain.handle('llm-integrations:remove', (_e, id: string) => llmIntegrations.remove(id))
  ipcMain.handle(
    'llm-integrations:test',
    (_e, args: { baseUrl: string; apiKey: string; model: string }) => {
      // 安全审计 S-41：主进程代发请求天然是 SSRF 入口。
      // 放行环回/局域网（自建 Ollama / vLLM / 网关是正常用法），但链路本地与云元数据地址永不放行，
      // 且非 http(s) 一律拒绝。
      const decision = evaluateOutboundUrl(args?.baseUrl ?? '', { allowPrivate: true })
      if (!decision.ok) {
        console.warn('[llm-integrations] 连通性测试地址被拒绝：' + decision.reason)
        return { ok: false, message: describeOutboundDeny(decision.reason) }
      }
      return llmIntegrations.test(args?.baseUrl ?? '', args?.apiKey ?? '', args?.model ?? '')
    },
  )

  // 从后端同步启用中的 MCP 到 Hermes 本地配置（登录后由渲染层触发）
  ipcMain.handle('mcp:syncFromBackend', async (_e, token: string) => {
    const t = typeof token === 'string' ? token : ''
    const hermesCfg = join(app.getPath('userData'), 'hermes-home', 'config.yaml')
    return syncHermesMcpFromBackend(t, hermesCfg, ST_API_BASE)
  })

  // 服务管理
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      await shell.openExternal(url)
    }
  })

  // 封面设计器：主进程拉取远程媒体（绕过 CORS，canvas 免污染）
  // 安全审计 S-23：主进程代渲染层发请求 = SSRF 入口。每一跳都过出站策略（拒绝内网/环回/云元数据），
  // 并限制重定向次数，避免「公网地址 302 → 内网地址」绕过入口检查。
  const MEDIA_MAX_REDIRECTS = 3
  const fetchMediaOnce = (target: URL, hop = 0): Promise<{ data: string; mime: string }> =>
    new Promise((resolve, reject) => {
      const decision = evaluateOutboundUrl(target.href, { allowedHosts: mediaAllowedHosts() })
      if (!decision.ok) {
        console.warn('[media] 出站地址被拒绝：' + target.href + '（' + decision.reason + '）')
        reject(new Error('媒体地址被安全策略拒绝：' + describeOutboundDeny(decision.reason)))
        return
      }
      const safeTarget = new URL(decision.url)
      const getter = safeTarget.protocol === 'https:' ? httpsGet : httpGet
      const req = getter(
        safeTarget,
        { headers: { 'User-Agent': 'ShenTongAI-Desktop', Accept: '*/*' }, timeout: 60000 },
        (res) => {
          const status = res.statusCode ?? 0
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume()
            if (hop >= MEDIA_MAX_REDIRECTS) {
              reject(new Error('媒体重定向次数过多（>' + MEDIA_MAX_REDIRECTS + '）'))
              return
            }
            let next: URL
            try {
              next = new URL(res.headers.location, safeTarget)
            } catch {
              reject(new Error('媒体重定向地址无效'))
              return
            }
            resolve(fetchMediaOnce(next, hop + 1))
            return
          }
          if (status !== 200) {
            res.resume()
            reject(new Error('媒体拉取失败 HTTP ' + status))
            return
          }
          const chunks: Buffer[] = []
          let total = 0
          res.on('data', (c: Buffer) => {
            total += c.length
            if (total > 50 * 1024 * 1024) {
              req.destroy(new Error('媒体文件过大（>50MB）'))
              return
            }
            chunks.push(c)
          })
          res.on('end', () =>
            resolve({
              mime: String(res.headers['content-type'] || 'application/octet-stream'),
              data: Buffer.concat(chunks).toString('base64'),
            }),
          )
          res.on('error', reject)
        },
      )
      req.on('error', reject)
      req.on('timeout', () => req.destroy(new Error('媒体拉取超时')))
    })
  ipcMain.handle('media:fetch-buffer', async (_event, mediaUrl: string) => {
    const decision = evaluateOutboundUrl(typeof mediaUrl === 'string' ? mediaUrl : '', {
      allowedHosts: mediaAllowedHosts(),
    })
    if (!decision.ok) {
      console.warn('[media] 请求被拒绝：' + decision.reason)
      throw new Error(describeOutboundDeny(decision.reason))
    }
    let result: { data: string; mime: string }
    try {
      result = await fetchMediaOnce(new URL(decision.url))
    } catch (err) {
      throw new Error((err as Error).message || '媒体拉取失败')
    }
    return result
  })

  // 本地 N8N 工作流真执行（替代后端假桩：桌面直连 127.0.0.1:5678 webhook）
  ipcMain.handle('n8n:run-workflow', async (_event, input: { paths?: string[]; payload?: unknown; timeoutMs?: number }) =>
    runLocalN8nWorkflow({ paths: input?.paths ?? [], payload: input?.payload, timeoutMs: input?.timeoutMs }))

  // 业务流直跑（对标 RRClaw 确定型定时任务：直接跑随包 Python 业务流引擎，不走 LLM 现场编排）
  ipcMain.handle('flow:run', async (_event, flowId: string, options?: { params?: Record<string, unknown>; timeoutMs?: number }) =>
    runFlow(typeof flowId === 'string' ? flowId : '', {
      params: options?.params,
      timeoutMs: options?.timeoutMs,
    }))
  ipcMain.handle('flow:list', async () => listFlows())

  // 发布平台账号（桌面端扫码绑定登录态；管理后台只控制平台开关）
  ipcMain.handle('platform-account:get-platforms', () => getSupportedPlatforms())
  ipcMain.handle('platform-account:setup-login', (_e, platform: string) =>
    setupLogin(typeof platform === 'string' ? platform : ''),
  )
  ipcMain.handle('platform-account:test-login', (_e, platform: string) =>
    testLogin(typeof platform === 'string' ? platform : ''),
  )
  ipcMain.handle('platform-account:open-account', (_e, platform: string) =>
    openAccount(typeof platform === 'string' ? platform : ''),
  )
  ipcMain.handle(
    'platform-account:open-publish',
    (_e, platform: string, payload?: { title?: string; description?: string; tags?: string }) =>
      openPublish(typeof platform === 'string' ? platform : '', payload),
  )
  ipcMain.handle(
    'platform-account:save-session',
    (_e, platform: string, cookiesJson: string, displayName?: string) =>
      saveSession(
        typeof platform === 'string' ? platform : '',
        typeof cookiesJson === 'string' ? cookiesJson : '',
        typeof displayName === 'string' ? displayName : undefined,
      ),
  )
  ipcMain.handle('platform-account:remove-session', (_e, platform: string) =>
    removeSession(typeof platform === 'string' ? platform : ''),
  )
  // 扫码登录事件流：立即返回 scanId，阶段推进通过 platform-account:scan-status 广播
  ipcMain.handle('platform-account:start-scan', (_e, platform: string) =>
    startScan(typeof platform === 'string' ? platform : ''),
  )
  ipcMain.handle('platform-account:get-scan-status', (_e, platform: string) =>
    getScanStatus(typeof platform === 'string' ? platform : ''),
  )
  ipcMain.handle('platform-account:cancel-scan', () => cancelScan())
  ipcMain.handle('platform-account:verify-session', (_e, platform: string) =>
    verifySession(typeof platform === 'string' ? platform : ''),
  )
  // 渠道凭证真实校验：转调后端 POST /channels/:id/test（后端适配器 healthCheck）
  ipcMain.handle('platform-account:test-channel', async (_e, channelId: number) => {
    try {
      const token = readRemoteToken()
      if (!token) return { ok: false, online: false, message: '未登录，请先登录后测试', platform: '' }
      const base = ST_API_BASE.replace(/\/api$/, '')
      const res = await fetch(`${base}/api/channels/${Number(channelId)}/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20000),
      })
      const body = (await res.json().catch(() => null)) as { data?: { ok?: boolean; online?: boolean; message?: string; platform?: string } } | null
      const data = body?.data
      if (!data) return { ok: false, online: false, message: `后端返回异常（HTTP ${res.status}）`, platform: '' }
      return {
        ok: data.ok ?? true,
        online: Boolean(data.online),
        message: data.message ?? '',
        platform: data.platform ?? '',
      }
    } catch (err) {
      return { ok: false, online: false, message: (err as Error).message, platform: '' }
    }
  })

  // 本地视频解析器（对标轻语 video-parser：抖音/快手/B站/小红书/视频号链接 → 本地视频文件）
  registerVideoParserIpc()

  ipcMain.handle('service:getStatus', () => serviceManager.getAllStatus())
  ipcMain.handle('service:status', (_event, name: ServiceName) =>
    serviceManager.getInfo(name)
  )
  ipcMain.handle('service:list', () => serviceManager.getAllInfo())
  ipcMain.handle('service:start', (_event, name: ServiceName) => serviceManager.start(name))
  ipcMain.handle('service:stop', (_event, name: ServiceName) => serviceManager.stop(name))
  ipcMain.handle('service:restart', (_event, name: ServiceName) => serviceManager.restart(name))
  ipcMain.handle('service:checkEnv', () => serviceManager.checkEnvironment())
  ipcMain.handle('service:checkEnvComponents', () => checkEnvComponents())
  ipcMain.handle('service:installEnvComponent', (_e, id: EnvComponentStatus['id']) =>
    installEnvComponent(id),
  )
  ipcMain.handle('service:install', (_event, name: ServiceName) => serviceManager.install(name))

  // 服务型模块管理（启用/停用/重载/装配审计）
  // 模块 MCP 能力口闭环：启用模块声明的 mcpServer 写入 Hermes config.yaml（Hermes 侧 mcp_servers）；
  // 停用模块按 mcpServer.name 移除，避免失效 server 残留。
  const syncModuleMcpServers = async (): Promise<void> => {
    try {
      const moduleServers = serviceManager.getModuleMcpServers().map((s) => ({ ...s, enabled: true }))
      const { removed } = listModuleMcpNames(disabledModuleSet(app.getPath('userData')))
      if (moduleServers.length === 0 && removed.length === 0) return
      writeHermesMcpServers(join(app.getPath('userData'), 'hermes-home', 'config.yaml'), moduleServers, removed)
    } catch (err) {
      console.error('[module-mcp] 同步模块 MCP 配置失败:', err)
    }
  }

  const broadcastModules = () => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('modules:changed', {
        modules: listModules(disabledModuleSet(app.getPath('userData'))),
      })
    }
  }

  ipcMain.handle('modules:list', () => listModules(disabledModuleSet(app.getPath('userData'))))
  ipcMain.handle('modules:setEnabled', async (_event, id: string, enabled: boolean) => {
    try {
      if (typeof id !== 'string' || !id.trim()) return { ok: false, error: '模块 id 非法', added: [], removed: [] }
      setModuleDisabled(app.getPath('userData'), id.trim(), !enabled)
      const { added, removed } = await serviceManager.reloadRows()
      await syncModuleMcpServers()
      broadcastModules()
      return { ok: true, added, removed }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), added: [], removed: [] }
    }
  })
  ipcMain.handle('modules:reload', async () => {
    try {
      const { added, removed } = await serviceManager.reloadRows()
      await syncModuleMcpServers()
      broadcastModules()
      return { ok: true, added, removed }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), added: [], removed: [] }
    }
  })
  ipcMain.handle('modules:uninstall', async (_event, id: string, disposition: 'keep' | 'export' | 'delete') => {
    try {
      if (typeof id !== 'string' || !id.trim()) return { ok: false, id: '', disposition, error: '模块 id 非法' }
      const d = (disposition === 'export' || disposition === 'delete' || disposition === 'keep') ? disposition : 'keep'
      let exportTargetDir: string | undefined
      if (d === 'export') {
        const win = getMainWindow()
        const r = win
          ? await dialog.showOpenDialog(win, { title: '选择导出目录', properties: ['openDirectory', 'createDirectory'] })
          : await dialog.showOpenDialog({ title: '选择导出目录', properties: ['openDirectory', 'createDirectory'] })
        if (r.canceled || !r.filePaths?.[0]) return { ok: false, id, disposition: d, error: '已取消导出' }
        exportTargetDir = r.filePaths[0]
      }
      const result = await serviceManager.uninstallModule(id, d, exportTargetDir)
      await syncModuleMcpServers()
      broadcastModules()
      return result
    } catch (err) {
      return { ok: false, id, disposition, error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle('modules:installFromSource', async (_event, source: string, opts?: { expectedSha256?: string; signature?: string; publicKey?: string; allowUnverified?: boolean }) => {
    try {
      if (typeof source !== 'string' || !source.trim()) return { ok: false, error: '模块来源不能为空' }
      const result = await installModuleFromSource({ source, expectedSha256: opts?.expectedSha256, signature: opts?.signature, publicKey: opts?.publicKey, allowUnverified: opts?.allowUnverified })
      broadcastModules()
      return result
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle('modules:dump', () => {
    const modules: ModuleInfo[] = listModules(disabledModuleSet(app.getPath('userData')))
    return { rows: serviceManager.getAllInfo(), modules }
  })

  // 运行时下载安装位置（方案 B：更改后不迁移，仅对新下载生效）
  ipcMain.handle('service:get-runtime-dir', () => {
    try {
      return getRuntimeDirInfo()
    } catch (err) {
      console.error('[ipc] service:get-runtime-dir failed:', err)
      return {
        path: defaultRuntimeRoot(),
        defaultPath: defaultRuntimeRoot(),
        freeBytes: 0,
        totalBytes: 0,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })
  ipcMain.handle('service:set-runtime-dir', async () => {
    const win = getMainWindow()
    const options: Electron.OpenDialogOptions = {
      title: '选择运行时下载安装位置',
      properties: ['openDirectory', 'createDirectory'],
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths?.[0]) {
      return { ok: false, canceled: true }
    }
    return setRuntimeRoot(result.filePaths[0])
  })

  // 服务状态变更 → 转发到渲染进程
  serviceManager.on('status-changed', (name: ServiceName, status: string, info: unknown) => {
    const payload = { name, status, info }
    getMainWindow()?.webContents.send('service:status-changed', payload)
  })
  // 服务错误事件 → 转发到渲染进程
  serviceManager.on('service-error', (payload: unknown) => {
    getMainWindow()?.webContents.send('service:error', payload)
  })
  // 服务安装进度 → 转发到渲染进程
  serviceManager.on('install-progress', (payload: unknown) => {
    getMainWindow()?.webContents.send('service:install-progress', payload)
  })

  // 启动即同步模块 MCP（启用模块声明的 mcpServer 写入 Hermes config.yaml）
  void syncModuleMcpServers()

  // 应用信息与更新
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:checkUpdate', () => {
    appUpdater?.checkForUpdates()
    return Promise.resolve()
  })
  ipcMain.handle('app:quitAndInstall', () => {
    appUpdater?.installUpdate()
    return Promise.resolve()
  })

  // Office 等距 2.5D 画布 WebGL 降级逃生通道：关闭硬件加速并重启
  // 注意：app.disableHardwareAcceleration() 理论上应在 app.ready 前调用；
  // 此处作为用户手动触发的兜底方案，在重启后下一次启动时生效。
  ipcMain.handle('office:disable-hardware-acceleration', () => {
    app.disableHardwareAcceleration()
    app.relaunch()
    app.quit()
  })

  // 自动更新（Task 35.3）- update:status 为主进程主动推送，无需 handle
  ipcMain.handle('update:check', () => {
    appUpdater?.checkForUpdates()
    return Promise.resolve()
  })
  ipcMain.handle('update:download', () => {
    appUpdater?.downloadUpdate()
    return Promise.resolve()
  })
  ipcMain.handle('update:install', () => {
    appUpdater?.installUpdate()
    return Promise.resolve()
  })

  // 设备指纹（返回指纹哈希字符串，保持 preload 契约 Promise<string>）
  ipcMain.handle('device:getFingerprint', async () => (await getDeviceFingerprint()).fingerprint)

  // 窗口控制
  ipcMain.on('window:minimize', () => getMainWindow()?.minimize())
  ipcMain.on('window:maximize', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', () => getMainWindow()?.close())

  // 本地数据库（SQLCipher 加密）
  // 登录后调用：从 userToken + salt 派生密钥，初始化数据库；失败则进入降级模式
  ipcMain.handle('db:initialize', async (_event, userToken: string): Promise<boolean> => {
    try {
      const salt = getOrCreateSalt()
      const key = deriveDbKey(userToken, salt)
      await localDb.initialize(key)
      return !localDb.isDegraded()
    } catch (err) {
      console.error('[ipc] db:initialize failed:', err)
      return false
    }
  })

  // 同步查询降级状态（渲染进程通过 sendSync 调用）
  ipcMain.on('db:isDegraded', (event) => {
    event.returnValue = localDb.isDegraded()
  })

  // 登出时关闭数据库（fire-and-forget）
  ipcMain.on('db:close', () => {
    localDb.close()
  })

  // 降级事件转发到渲染进程，由其显示提示并回退到云端 API
  localDb.on('db:degraded', (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[ipc] db:degraded forwarded to renderer:', message)
    getMainWindow()?.webContents.send('db:degraded', { message })
  })

  // ===== 同步队列操作（离线调用队列 + 上行同步） =====
  // 降级模式下返回空结果，渲染进程据此走云端 API

  ipcMain.handle('syncQueue:enqueue', async (_event, item: SyncQueueItem): Promise<number> => {
    if (localDb.isDegraded()) return -1
    try {
      const result = await localDb.run(
        `INSERT INTO local_sync_queue (client_txn_id, entity_type, entity_id, operation, payload, status, retry_count)
         VALUES (?, ?, ?, ?, ?, 'pending', 0)`,
        [item.client_txn_id, item.entity_type, item.entity_id, item.operation, JSON.stringify(item.payload)]
      )
      return result.lastID
    } catch (err) {
      console.error('[ipc] syncQueue:enqueue failed:', err)
      return -1
    }
  })

  ipcMain.handle('syncQueue:getPending', async (_event, limit: number): Promise<SyncQueueRow[]> => {
    if (localDb.isDegraded()) return []
    try {
      const rows = await localDb.all<SyncQueueRow>(
        `SELECT * FROM local_sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`,
        [limit]
      )
      // payload 字段反序列化
      return rows.map((row) => ({
        ...row,
        payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
      }))
    } catch (err) {
      console.error('[ipc] syncQueue:getPending failed:', err)
      return []
    }
  })

  ipcMain.handle(
    'syncQueue:updateStatus',
    async (_event, id: number, status: 'synced' | 'failed' | 'pending', retryCount: number, errorMessage?: string): Promise<void> => {
      if (localDb.isDegraded()) return
      try {
        const syncedAt = status === 'synced' ? new Date().toISOString() : null
        await localDb.run(
          `UPDATE local_sync_queue SET status = ?, retry_count = ?, error_message = ?, synced_at = COALESCE(?, synced_at) WHERE id = ?`,
          [status, retryCount, errorMessage ?? null, syncedAt, id]
        )
      } catch (err) {
        console.error('[ipc] syncQueue:updateStatus failed:', err)
      }
    }
  )

  ipcMain.handle('syncQueue:exists', async (_event, client_txn_id: string): Promise<boolean> => {
    if (localDb.isDegraded()) return false
    try {
      const row = await localDb.get<{ c: number }>(
        `SELECT COUNT(*) AS c FROM local_sync_queue WHERE client_txn_id = ?`,
        [client_txn_id]
      )
      return (row?.c ?? 0) > 0
    } catch (err) {
      console.error('[ipc] syncQueue:exists failed:', err)
      return false
    }
  })

  // ===== 本地需求单（一期 MVP：本地优先，降级返回空/空操作） =====
  const BRIEF_COLUMNS = `
  id, client_brief_id AS clientBriefId, user_id AS userId, title, goal,
  target_audience AS targetAudience, platforms, style, deadline, status,
  source_chat_session_id AS sourceChatSessionId, source_chat_summary AS sourceChatSummary,
  cloud_synced AS cloudSynced, created_at AS createdAt, updated_at AS updatedAt
`

  const random8 = (): string => Math.random().toString(36).slice(2, 10)

  interface BriefRow extends Omit<LocalBrief, 'platforms'> {
    platforms: unknown
  }

  interface CreateBriefInput {
    userId: number
    title: string
    goal?: string
    targetAudience?: string
    platforms?: string[]
    style?: string
    deadline?: string | null
    status?: LocalBrief['status']
    sourceChatSessionId?: number | null
    sourceChatSummary?: string | null
  }

  type UpdateBriefPatch = Partial<
    Pick<LocalBrief, 'title' | 'goal' | 'targetAudience' | 'platforms' | 'style' | 'deadline' | 'status'>
  >

  const deserializeBrief = (row: BriefRow): LocalBrief => ({
    ...row,
    platforms:
      row.platforms == null
        ? undefined
        : typeof row.platforms === 'string'
          ? JSON.parse(row.platforms)
          : row.platforms
  })

  ipcMain.handle('db:briefs:list', async (): Promise<LocalBrief[]> => {
    if (localDb.isDegraded()) return []
    try {
      const rows = await localDb.all<BriefRow>(
        `SELECT ${BRIEF_COLUMNS} FROM local_briefs ORDER BY created_at DESC`
      )
      return rows.map(deserializeBrief)
    } catch (err) {
      console.error('[ipc] db:briefs:list failed:', err)
      return []
    }
  })

  ipcMain.handle('db:briefs:create', async (_event, input: CreateBriefInput): Promise<LocalBrief | null> => {
    if (localDb.isDegraded()) return null
    try {
      const clientBriefId = `lb_${Date.now()}_${random8()}`
      const result = await localDb.run(
        `INSERT INTO local_briefs (client_brief_id, user_id, title, goal, target_audience, platforms, style, deadline, status, source_chat_session_id, source_chat_summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          clientBriefId,
          input.userId,
          input.title,
          input.goal ?? null,
          input.targetAudience ?? null,
          input.platforms ? JSON.stringify(input.platforms) : null,
          input.style ?? null,
          input.deadline ?? null,
          input.status ?? 'draft',
          input.sourceChatSessionId ?? null,
          input.sourceChatSummary ?? null
        ]
      )
      const row = await localDb.get<BriefRow>(
        `SELECT ${BRIEF_COLUMNS} FROM local_briefs WHERE id = ?`,
        [result.lastID]
      )
      return row ? deserializeBrief(row) : null
    } catch (err) {
      console.error('[ipc] db:briefs:create failed:', err)
      return null
    }
  })

  ipcMain.handle('db:briefs:update', async (_event, id: number, patch: UpdateBriefPatch): Promise<LocalBrief | undefined> => {
    if (localDb.isDegraded()) return undefined
    try {
      const sets: string[] = []
      const params: unknown[] = []
      if (patch.title !== undefined) {
        sets.push('title = ?')
        params.push(patch.title)
      }
      if (patch.goal !== undefined) {
        sets.push('goal = ?')
        params.push(patch.goal)
      }
      if (patch.targetAudience !== undefined) {
        sets.push('target_audience = ?')
        params.push(patch.targetAudience)
      }
      if (patch.platforms !== undefined) {
        sets.push('platforms = ?')
        params.push(JSON.stringify(patch.platforms))
      }
      if (patch.style !== undefined) {
        sets.push('style = ?')
        params.push(patch.style)
      }
      if (patch.deadline !== undefined) {
        sets.push('deadline = ?')
        params.push(patch.deadline)
      }
      if (patch.status !== undefined) {
        sets.push('status = ?')
        params.push(patch.status)
      }
      if (sets.length > 0) {
        sets.push('updated_at = CURRENT_TIMESTAMP')
        params.push(id)
        await localDb.run(`UPDATE local_briefs SET ${sets.join(', ')} WHERE id = ?`, params)
      }
      const row = await localDb.get<BriefRow>(
        `SELECT ${BRIEF_COLUMNS} FROM local_briefs WHERE id = ?`,
        [id]
      )
      return row ? deserializeBrief(row) : undefined
    } catch (err) {
      console.error('[ipc] db:briefs:update failed:', err)
      return undefined
    }
  })

  ipcMain.handle('db:briefs:remove', async (_event, id: number): Promise<void> => {
    if (localDb.isDegraded()) return
    try {
      await localDb.run('DELETE FROM local_briefs WHERE id = ?', [id])
    } catch (err) {
      console.error('[ipc] db:briefs:remove failed:', err)
    }
  })

  ipcMain.handle('db:briefs:markSynced', async (_event, clientBriefId: string): Promise<void> => {
    if (localDb.isDegraded()) return
    try {
      await localDb.run(
        `UPDATE local_briefs SET cloud_synced = 1, updated_at = CURRENT_TIMESTAMP WHERE client_brief_id = ?`,
        [clientBriefId]
      )
    } catch (err) {
      console.error('[ipc] db:briefs:markSynced failed:', err)
    }
  })

  // ===== 定时任务执行日志（独立于任务本体，对标 RRClaw cron_run_logs） =====
  // 每次定时触发写一条 running；执行结束回填 success/error + 耗时 + 摘要。降级模式返回空。
  const mapScheduledRun = (row: Record<string, unknown>): LocalScheduledRun => ({
    id: row.id as number,
    runId: row.run_id as string,
    scheduledId: row.scheduled_id as number,
    userId: row.user_id as number,
    title: (row.title as string) ?? undefined,
    executeKind: (row.execute_kind as 'llm' | 'flow') ?? 'llm',
    flowId: (row.flow_id as string) ?? null,
    status: (row.status as LocalScheduledRun['status']) ?? 'running',
    errorMessage: (row.error_message as string) ?? null,
    resultSummary: (row.result_summary as string) ?? null,
    durationMs: (row.duration_ms as number) ?? null,
    teamTaskId: (row.team_task_id as number) ?? null,
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string) ?? null
  })

  ipcMain.handle('db:scheduledRuns:create', async (_event, input: {
    scheduledId: number
    userId: number
    title?: string
    executeKind: 'llm' | 'flow'
    flowId?: string | null
    teamTaskId?: number | null
  }): Promise<LocalScheduledRun | null> => {
    if (localDb.isDegraded()) return null
    try {
      const runId = `sr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
      const result = await localDb.run(
        `INSERT INTO local_scheduled_runs (run_id, scheduled_id, user_id, title, execute_kind, flow_id, status, team_task_id)
         VALUES (?, ?, ?, ?, ?, ?, 'running', ?)`,
        [runId, input.scheduledId, input.userId, input.title ?? null, input.executeKind, input.flowId ?? null, input.teamTaskId ?? null]
      )
      const row = await localDb.get<Record<string, unknown>>('SELECT * FROM local_scheduled_runs WHERE id = ?', [result.lastID])
      return row ? mapScheduledRun(row) : null
    } catch (err) {
      console.error('[ipc] db:scheduledRuns:create failed:', err)
      return null
    }
  })

  ipcMain.handle('db:scheduledRuns:finish', async (_event, id: number, patch: {
    status: 'success' | 'error'
    errorMessage?: string | null
    resultSummary?: string | null
    durationMs?: number | null
  }): Promise<void> => {
    if (localDb.isDegraded()) return
    try {
      await localDb.run(
        `UPDATE local_scheduled_runs
           SET status = ?, error_message = ?, result_summary = ?, duration_ms = ?, finished_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [patch.status, patch.errorMessage ?? null, patch.resultSummary ?? null, patch.durationMs ?? null, id]
      )
    } catch (err) {
      console.error('[ipc] db:scheduledRuns:finish failed:', err)
    }
  })

  ipcMain.handle('db:scheduledRuns:list', async (_event, scheduledId?: number, limit = 50): Promise<LocalScheduledRun[]> => {
    if (localDb.isDegraded()) return []
    try {
      const rows = scheduledId
        ? await localDb.all<Record<string, unknown>>(
            'SELECT * FROM local_scheduled_runs WHERE scheduled_id = ? ORDER BY id DESC LIMIT ?',
            [scheduledId, limit]
          )
        : await localDb.all<Record<string, unknown>>('SELECT * FROM local_scheduled_runs ORDER BY id DESC LIMIT ?', [limit])
      return rows.map(mapScheduledRun)
    } catch (err) {
      console.error('[ipc] db:scheduledRuns:list failed:', err)
      return []
    }
  })

  ipcMain.handle('db:scheduledRuns:remove', async (_event, id: number): Promise<void> => {
    if (localDb.isDegraded()) return
    try {
      await localDb.run('DELETE FROM local_scheduled_runs WHERE id = ?', [id])
    } catch (err) {
      console.error('[ipc] db:scheduledRuns:remove failed:', err)
    }
  })

  // ===== 运行时校验与下载（Task 8 - 内置本地服务运行时） =====

  // 校验所有服务运行时完整性（SHA-256）
  ipcMain.handle('runtime:verify', async () => {
    const results = await verifyAll()
    return { results, allPassed: Object.values(results).every(Boolean) }
  })

  // 校验单个服务运行时完整性
  ipcMain.handle('runtime:verify-one', async (_event, name: ServiceName) => {
    return await verifyIntegrity(name)
  })

  // 下载服务运行时到 userData 目录（含进度推送与 SHA-256 校验）
  ipcMain.handle('runtime:download', async (event, name: ServiceName) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const ok = await downloadRuntime(name, (progress) => {
      win?.webContents.send('runtime:download-progress', {
        name,
        ...progress
      })
    })
    return ok
  })

  // 取消正在进行的下载（保留临时文件以便断点续传）
  ipcMain.handle('runtime:cancel-download', async (_event, name: ServiceName) => {
    cancelDownload(name)
    return true
  })

  // ===== 本地内容市场（下载安装官方内容到本地） =====

  ipcMain.handle('market:install', async (_event, type: MarketItemType, id: number, name: string, version: string, pkg: Record<string, unknown>) =>
    installMarketItem(type, id, name, version, pkg))

  ipcMain.handle('market:installGithubSkill', async (_event, sourceId: number, name: string, candidates: Array<{ owner: string; repo: string; defaultBranch?: string }>) =>
    installGithubSkill(sourceId, name, candidates))

  ipcMain.handle('market:uninstall', async (_event, type: MarketItemType, id: number | string) =>
    uninstallMarketItem(type, id))

  ipcMain.handle('market:list', async () => listInstalled())

  ipcMain.handle('market:export', async () => exportMarketBundle())

  ipcMain.handle('market:import', async () => importMarketBundle())
  ipcMain.handle('market:detail', async (_event, type: MarketItemType, id: number | string) =>
    getInstalledDetail(type, id))

  ipcMain.handle('market:importDir', async (_event, type: MarketItemType) =>
    importCustomDir(type))

  ipcMain.handle('market:register', async (_event, type: MarketItemType, id: number | string, name: string, version: string, dir: string) =>
    registerChatInstalled(type, id, name, version, dir))

  ipcMain.handle('market:update', async (_event, type: MarketItemType, id: number, name: string, version: string, pkg: Record<string, unknown>) =>
    updateMarketItem(type, id, name, version, pkg))

  ipcMain.handle('market:syncChat', async () => syncChatInstalled())

}
}
