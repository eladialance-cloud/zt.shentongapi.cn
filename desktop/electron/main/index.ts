// Electron 主进程入口

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import log from 'electron-log'
import { getRuntimeDirInfo, setRuntimeRoot, defaultRuntimeRoot, getRuntimeRoot } from './runtime-config'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import {
  OpenClawChatService,
  createCustomLlmCaller,
  createLocalOpenClawWsCaller,
  waitForLocalPort,
  OPENCLAW_LOCAL_PORT,
} from './openclaw-chat'
import { LlmIntegrationsStore } from './llm-integrations'
import type { OpenClawChatMessage } from './openclaw-chat'
import type { LlmIntegration } from '../shared/types'

// GPU 白名单开关：解决部分显卡/驱动/远程桌面环境下 WebGL 被 Chromium 黑名单拦截的问题
// 必须在 app.whenReady 之前设置
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('disable-gpu-sandbox')
// 允许在缺少 GPU 时使用 SwiftShader 软件渲染，保证 PixiJS 至少能创建 WebGL 上下文
app.commandLine.appendSwitch('enable-unsafe-swiftshader')
// 仅开发环境（未打包）启用远程调试端口，生产环境关闭
if (!app.isPackaged) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}
import { createMainWindow, getMainWindow, setQuitting } from './windows/main-window'
import { createTray, destroyTray } from './tray'
import { ServiceManager, ST_API_BASE } from './service-manager'
import { syncOpenClawMcpFromBackend } from './openclaw-mcp-sync'
import { AppUpdater } from './updater'
import { getDeviceFingerprint } from './device'
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
} from './local-market/local-content-manager'
import type { MarketItemType } from '../shared/types'
import type { ServiceName, SyncQueueItem, SyncQueueRow } from '../shared/types'
import type { LocalBrief } from '../shared/types'
import { orchestrate, type OrchestrateDeps, type OrchestrateInput, type TeamMemberProfile } from './hermes-orchestrator'
import { buildMemberProfiles, type MemberRow } from './hermes-member-profile'
import { listSkills, searchSkills, installSkill, updateSkills, uninstallSkill, checkSkills } from './hermes-skills'
import { getEvolution } from './hermes-evolution'
import { handleMemoryOp } from './hermes-memory'

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

/** 主进程编排依赖（真实实现）：PATCH 回写 + 上报 call_log + 产物登记 + Hermes CLI spawn */
function buildHermesOrchestrateDeps(token: string): OrchestrateDeps {
  const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
  const hermesRoot = join(getRuntimeRoot(), 'hermes')
  const hermesEnv = {
    ...process.env,
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

// 日志落盘：主进程 console 输出同步写入 userData/logs/main.log，便于远程排查
// 注意：必须先禁用 electron-log 的 console 传输，否则 log.* → console 传输 → console.*(已包装) → log.* 会递归；
// 且在 stdout/stderr 管道断开（EPIPE）时会无限触发 uncaughtException（7-26 日志已出现）
log.initialize()
log.transports.file.level = 'info'
log.transports.console.level = false
const __consoleLog = console.log.bind(console)
const __consoleWarn = console.warn.bind(console)
const __consoleError = console.error.bind(console)
// 打包版仅写文件（无终端），dev 下保留终端输出
const mirrorToConsole = !app.isPackaged
console.log = (...args: unknown[]) => { log.info(...args); if (mirrorToConsole) __consoleLog(...args) }
console.warn = (...args: unknown[]) => { log.warn(...args); if (mirrorToConsole) __consoleWarn(...args) }
console.error = (...args: unknown[]) => { log.error(...args); if (mirrorToConsole) __consoleError(...args) }

const serviceManager = new ServiceManager()
const isDev = !app.isPackaged
let appUpdater: AppUpdater | null = null

// 单实例锁 - 防止多开
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
    app.setAppUserModelId('com.shentong.ai')

    const mainWindow = createMainWindow(serviceManager, isDev)
    createTray(mainWindow, serviceManager)
    // 自动更新：启动时实例化并检查更新（Task 35.3）
    appUpdater = new AppUpdater(mainWindow)
    appUpdater.checkForUpdates()
    registerIpcHandlers()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow(serviceManager, isDev)
      }
    })
  })

  // 应用退出前标记，允许窗口真正关闭
  app.on('before-quit', () => {
    setQuitting(true)
    void serviceManager.stopAll()
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
  // ===== OpenClaw 本地直达对话（记账云端 + 对话本地） =====
  const llmIntegrations = new LlmIntegrationsStore(
    join(app.getPath('userData'), 'llm-integrations.json'),
  )
  const openClawChat = new OpenClawChatService({
    callOpenClaw: createLocalOpenClawWsCaller(),
    callCustomModel: createCustomLlmCaller(llmIntegrations),
    ensureOpenClaw: async () => {
      const info = serviceManager.getInfo('openclaw')
      // 状态机防御：status='running' 但端口未监听（进程残留/假活）时也强制重启，
      // 避免直接 fetch 127.0.0.1:8080 报 "fetch failed" 且永不自愈
      const alive =
        info &&
        info.status === 'running' &&
        (await waitForLocalPort(OPENCLAW_LOCAL_PORT, 2000, 500))
      if (alive) return
      if (info && info.status === 'running') {
        console.log('[openclaw-chat] OpenClaw 状态异常（端口未监听），自动重启...')
        const ok = await serviceManager.restart('openclaw')
        if (!ok) throw new Error('OpenClaw 重启失败，请到服务管理页检查后再试')
      } else {
        console.log('[openclaw-chat] OpenClaw 未运行，自动启动...')
        const ok = await serviceManager.start('openclaw')
        if (!ok) throw new Error('OpenClaw 启动失败，请到服务管理页检查后再试')
      }
      const ready = await waitForLocalPort(OPENCLAW_LOCAL_PORT)
      if (!ready) throw new Error('OpenClaw 启动超时，请稍后重试')
    },
    contextDir: join(app.getPath('userData'), 'openclaw-chat'),
  })

  ipcMain.handle(
    'openclaw-chat:send',
    async (
      event,
      payload: {
        text: string
        token: string
        history?: OpenClawChatMessage[]
        knowledgeBaseId?: number
        sessionId?: number
        modelId?: string
      },
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const push = (channel: string, data: unknown): void => {
        if (win && !win.isDestroyed()) {
          win.webContents.send(channel, data)
        }
      }
      try {
        const result = await openClawChat.send(
          {
            text: payload.text,
            token: payload.token,
            history: payload.history,
            knowledgeBaseId: payload.knowledgeBaseId,
            sessionId: payload.sessionId,
            modelId: payload.modelId,
          },
          (chunk) => push('openclaw-chat:message', { content: chunk }),
          (e) => {
            if (e.type === 'tool-call') push('openclaw-chat:tool-call', e.toolCall)
            else if (e.type === 'done') push('openclaw-chat:done', { usage: e.usage })
            else if (e.type === 'lifecycle') push('openclaw-chat:lifecycle', { lifecycle: e.lifecycle })
          },
          (finalContent) => push('openclaw-chat:finalize', { content: finalContent }),
        )
        push('openclaw-chat:done', { usage: result.usage })
        return { ok: true, aborted: result.aborted }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[openclaw-chat] send failed:', message)
        push('openclaw-chat:error', { message })
        return { ok: false }
      }
    },
  )

  ipcMain.on('openclaw-chat:abort', () => {
    openClawChat.abort()
  })

  // 注入用户 llm-proxy 静态 Key（登录后由渲染层调用；OpenClaw 的 openai provider 指向云端 llm-proxy）
  ipcMain.on('openclaw-chat:set-proxy-key', (_event, key: string) => {
    serviceManager.setOpenClawProxyKey(key || '')
  })
  // 同步用户首选对话模型到 OpenClaw 配置（agents.defaults.model，新会话默认模型；当前会话由 WS sessions.patch 处理）
  ipcMain.on('openclaw-chat:set-model', (_event, modelId: string) => {
    serviceManager.setOpenClawPreferredModel(typeof modelId === 'string' ? modelId : '')
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
  ipcMain.handle('hermes-evolution:get', () => getEvolution())
  // ===== Hermes 记忆本地读写桥（MEMORY.md/USER.md；add/replace/remove/list） =====
  ipcMain.handle('hermes-memory:list', (_e, target) => handleMemoryOp('list', target))
  ipcMain.handle('hermes-memory:add', (_e, target, text) => handleMemoryOp('add', target, text))
  ipcMain.handle('hermes-memory:replace', (_e, target, match, text) => handleMemoryOp('replace', target, match, text))
  ipcMain.handle('hermes-memory:remove', (_e, target, text) => handleMemoryOp('remove', target, text))

  // ===== Hermes 编排（团队驱动执行）：提交任务 → 状态机 + 团队指派 + CLI + 回写 =====
  ipcMain.handle(
    'hermes-orchestrate:submit',
    async (_event, payload: { token: string; input: OrchestrateInput }) => {
      if (!payload?.token || !payload?.input) return { ok: false, error: '参数缺失' }
      try {
        const input = { ...payload.input }
        if (!input.teamMembers && input.teamId) {
          input.teamMembers = await loadTeamMembers(payload.token, input.teamId)
        }
        const result = await orchestrate(input, buildHermesOrchestrateDeps(payload.token))
        return { ok: true, result }
      } catch (err) {
        console.error('[hermes-orchestrate] submit failed:', err)
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
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
    (_e, args: { baseUrl: string; apiKey: string; model: string }) =>
      llmIntegrations.test(args?.baseUrl ?? '', args?.apiKey ?? '', args?.model ?? ''),
  )

  // 从后端同步启用中的 MCP 到 OpenClaw 本地配置（登录后由渲染层触发）
  ipcMain.handle('mcp:syncFromBackend', async (_e, token: string) =>
    syncOpenClawMcpFromBackend(typeof token === 'string' ? token : ''),
  )

  // 服务管理
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      await shell.openExternal(url)
    }
  })
  ipcMain.handle('service:getStatus', () => serviceManager.getAllStatus())
  ipcMain.handle('service:status', (_event, name: ServiceName) =>
    serviceManager.getInfo(name)
  )
  ipcMain.handle('service:list', () => serviceManager.getAllInfo())
  ipcMain.handle('service:start', (_event, name: ServiceName) => serviceManager.start(name))
  ipcMain.handle('service:stop', (_event, name: ServiceName) => serviceManager.stop(name))
  ipcMain.handle('service:restart', (_event, name: ServiceName) => serviceManager.restart(name))
  ipcMain.handle('service:checkEnv', () => serviceManager.checkEnvironment())
  ipcMain.handle('service:install', (_event, name: ServiceName) => serviceManager.install(name))

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

  ipcMain.handle('market:installGithubSkill', async (_event, sourceId: number, name: string, candidates: Array<{ owner: string; repo: string }>) =>
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
