// 预加载脚本 - 通过 contextBridge 暴露安全 API 给渲染进程
// 启用 contextIsolation: true，nodeIntegration: false

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  ServiceName,
  ServiceInfo,
  ServiceStatusChangedPayload,
  ServiceErrorPayload,
  SyncQueueRow,
  UpdateStatusPayload,
  ElectronAPI,
  RuntimeAPI,
  RuntimeDownloadProgress,
  InstallProgressPayload,
  MarketItemType,
  InstalledRecord,
  MarketItemDetail,
  OpenClawChatMessage,
  OpenClawChatMessagePayload,
  LocalBrief,
  LlmIntegration,
  OpenClawToolCall,
  OpenClawChatDonePayload,
  OpenClawChatLifecyclePayload,
  OpenClawChatErrorPayload,
  HermesMemoryTarget,
  HermesMemoryOpResult,
  HermesStatusResult,
  OrchestrateSubmitResult,
  OrchestrateInput,
  TeamMemberProfileItem,
  OrchestrateStepActionPayload,
  PlatformAccountApi,
  PlatformInfo,
  EdictAPI,
  EdictBoard,
  EdictTask,
  EdictOp,
  EdictOfficial,
  EdictStats,
  EdictPipelineResult,
  EdictAgentConfig,
  EdictAgentsStatusData,
  EdictCourtDiscussResult,
  EdictModelChangeEntry,
  EdictMorningBrief,
  EdictNotifyConfig,
  EdictRemoteSkillsResult,
  EdictSkillLibraryResult,
  EdictSessionItem,
  EdictSkillContentResult,
  EdictSubConfig,
} from '../shared/types'

const electronAPI: ElectronAPI = {
  service: {
    getStatus: () => ipcRenderer.invoke('service:getStatus'),
    status: (name: ServiceName) =>
      ipcRenderer.invoke('service:status', name) as Promise<ServiceInfo>,
    list: () => ipcRenderer.invoke('service:list') as Promise<ServiceInfo[]>,
    start: (name: ServiceName) => ipcRenderer.invoke('service:start', name),
    stop: (name: ServiceName) => ipcRenderer.invoke('service:stop', name),
    restart: (name: ServiceName) => ipcRenderer.invoke('service:restart', name),
    checkEnv: () => ipcRenderer.invoke('service:checkEnv'),
    install: (name: ServiceName) => ipcRenderer.invoke('service:install', name),
    getRuntimeDir: () => ipcRenderer.invoke('service:get-runtime-dir'),
    chooseRuntimeDir: () => ipcRenderer.invoke('service:set-runtime-dir'),
    onInstallProgress: (callback: (payload: InstallProgressPayload) => void) => {
      const handler = (
        _event: IpcRendererEvent,
        payload: InstallProgressPayload
      ): void => callback(payload)
      ipcRenderer.on('service:install-progress', handler)
      return () => {
        ipcRenderer.removeListener('service:install-progress', handler)
      }
    },
    onStatusChanged: (callback: (payload: ServiceStatusChangedPayload) => void) => {
      const handler = (
        _event: IpcRendererEvent,
        payload: ServiceStatusChangedPayload
      ): void => callback(payload)
      ipcRenderer.on('service:status-changed', handler)
      return () => {
        ipcRenderer.removeListener('service:status-changed', handler)
      }
    },
    onError: (callback: (payload: ServiceErrorPayload) => void) => {
      const handler = (
        _event: IpcRendererEvent,
        payload: ServiceErrorPayload
      ): void => callback(payload)
      ipcRenderer.on('service:error', handler)
      return () => {
        ipcRenderer.removeListener('service:error', handler)
      }
    }
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
    quitAndInstall: () => ipcRenderer.invoke('app:quitAndInstall'),
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    disableHardwareAcceleration: () => ipcRenderer.invoke('office:disable-hardware-acceleration')
  },
  updater: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    onStatus: (callback: (payload: UpdateStatusPayload) => void) => {
      const handler = (
        _event: IpcRendererEvent,
        payload: UpdateStatusPayload
      ): void => callback(payload)
      ipcRenderer.on('update:status', handler)
      return () => {
        ipcRenderer.removeListener('update:status', handler)
      }
    }
  },
  media: {
    fetchBuffer: (url: string) =>
      ipcRenderer.invoke('media:fetch-buffer', url) as Promise<{ data: string; mime: string }>,
  },

  platformAccount: {
    getSupportedPlatforms: () =>
      ipcRenderer.invoke('platform-account:get-platforms') as Promise<PlatformInfo[]>,
    setupLogin: (platform: string) =>
      ipcRenderer.invoke('platform-account:setup-login', platform),
    testLogin: (platform: string) =>
      ipcRenderer.invoke('platform-account:test-login', platform),
    openAccount: (platform: string) =>
      ipcRenderer.invoke('platform-account:open-account', platform),
    openPublish: (platform: string, payload?: { title?: string; description?: string; tags?: string }) =>
      ipcRenderer.invoke('platform-account:open-publish', platform, payload),
    saveSession: (platform: string, cookiesJson: string, displayName?: string) =>
      ipcRenderer.invoke('platform-account:save-session', platform, cookiesJson, displayName),
    removeSession: (platform: string) =>
      ipcRenderer.invoke('platform-account:remove-session', platform),
  },
  videoParser: {
    extractUrl: (text: string) =>
      ipcRenderer.invoke('video-parser:extract-url', text) as Promise<string | null>,
    validateUrl: (url: string) =>
      ipcRenderer.invoke('video-parser:validate-url', url) as Promise<{ ok: boolean; platform: string }>,
    parse: (url: string) => ipcRenderer.invoke('video-parser:parse', url),
    readFile: (filePath: string) =>
      ipcRenderer.invoke('video-parser:read-file', filePath) as Promise<ArrayBuffer | null>,
  },

  n8n: {
    runWorkflow: (input: { paths: string[]; payload?: unknown; timeoutMs?: number }) =>
      ipcRenderer.invoke('n8n:run-workflow', input) as Promise<{ ok: boolean; data?: unknown; error?: string; path?: string }>,
  },

  modelDefaultsSync: (dto) => ipcRenderer.send('model-defaults:sync', dto),
  hermesSkills: {
    list: () => ipcRenderer.invoke('hermes-skills:list'),
    search: (query) => ipcRenderer.invoke('hermes-skills:search', query),
    install: (identifier) => ipcRenderer.invoke('hermes-skills:install', identifier),
    update: (name) => ipcRenderer.invoke('hermes-skills:update', name),
    uninstall: (name) => ipcRenderer.invoke('hermes-skills:uninstall', name),
    check: () => ipcRenderer.invoke('hermes-skills:check'),
    installLocal: () => ipcRenderer.invoke('hermes-skills:install-local'),
  },
  hermesStatus: {
    get: () => ipcRenderer.invoke('hermes-status:get') as Promise<HermesStatusResult>,
  },
  hermesMemory: {
    list: (target: HermesMemoryTarget) =>
      ipcRenderer.invoke('hermes-memory:list', target) as Promise<HermesMemoryOpResult>,
    add: (target: HermesMemoryTarget, text: string) =>
      ipcRenderer.invoke('hermes-memory:add', target, text) as Promise<HermesMemoryOpResult>,
    replace: (target: HermesMemoryTarget, match: string, text: string) =>
      ipcRenderer.invoke('hermes-memory:replace', target, match, text) as Promise<HermesMemoryOpResult>,
    remove: (target: HermesMemoryTarget, text: string) =>
      ipcRenderer.invoke('hermes-memory:remove', target, text) as Promise<HermesMemoryOpResult>,
  },
  hermesOrchestrate: {
    submit: (payload: { token: string; input: OrchestrateInput; autoConfirm?: boolean; reviewEnabled?: boolean; reviewModel?: string }) =>
      ipcRenderer.invoke('hermes-orchestrate:submit', payload) as Promise<OrchestrateSubmitResult>,
    confirmStep: (payload: OrchestrateStepActionPayload) =>
      ipcRenderer.invoke('hermes-orchestrate:confirm-step', payload) as Promise<OrchestrateSubmitResult>,
    rejectStep: (payload: OrchestrateStepActionPayload) =>
      ipcRenderer.invoke('hermes-orchestrate:reject-step', payload) as Promise<OrchestrateSubmitResult>,
    loadMembers: (payload: { token: string; teamId: number }) =>
      ipcRenderer.invoke('hermes-orchestrate:load-members', payload) as Promise<{ ok: boolean; members?: TeamMemberProfileItem[]; error?: string }>,
    setAutoConfirm: (payload: { token: string; teamTaskId: number; autoConfirm: boolean }) =>
      ipcRenderer.invoke('hermes-orchestrate:set-auto-confirm', payload) as Promise<OrchestrateSubmitResult>,
    pause: (payload: { teamTaskId: number }) =>
      ipcRenderer.invoke('hermes-orchestrate:pause', payload) as Promise<OrchestrateSubmitResult>,
    resume: (payload: { teamTaskId: number }) =>
      ipcRenderer.invoke('hermes-orchestrate:resume', payload) as Promise<OrchestrateSubmitResult>,
    stop: (payload: { teamTaskId: number }) =>
      ipcRenderer.invoke('hermes-orchestrate:stop', payload) as Promise<OrchestrateSubmitResult>,
    deleteTask: (payload: { token: string; teamId: number; teamTaskId: number }) =>
      ipcRenderer.invoke('hermes-orchestrate:delete', payload) as Promise<OrchestrateSubmitResult>,
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  },
  device: {
    getFingerprint: () => ipcRenderer.invoke('device:getFingerprint')
  },
  db: {
    // 登录后调用：派生密钥 → 初始化 SQLCipher；失败返回 false（降级模式）
    initialize: (userToken: string) => ipcRenderer.invoke('db:initialize', userToken) as Promise<boolean>,
    // 同步查询降级状态（sendSync 阻塞，仅读布尔值，开销极小）
    isDegraded: () => ipcRenderer.sendSync('db:isDegraded') as boolean,
    // 登出时关闭数据库（fire-and-forget）
    close: () => {
      ipcRenderer.send('db:close')
    },
    briefs: {
      list: () => ipcRenderer.invoke('db:briefs:list') as Promise<LocalBrief[]>,
      create: (input) => ipcRenderer.invoke('db:briefs:create', input) as Promise<LocalBrief | null>,
      update: (id, patch) => ipcRenderer.invoke('db:briefs:update', id, patch) as Promise<LocalBrief | undefined>,
      remove: (id) => ipcRenderer.invoke('db:briefs:remove', id) as Promise<void>,
      markSynced: (clientBriefId) => ipcRenderer.invoke('db:briefs:markSynced', clientBriefId) as Promise<void>
    }
  },
  market: {
    install: (type: MarketItemType, id: number, name: string, version: string, pkg: Record<string, unknown>) =>
      ipcRenderer.invoke('market:install', type, id, name, version, pkg) as Promise<{ ok: boolean; dir?: string; error?: string }>,
    installGithubSkill: (sourceId: number, name: string, candidates: Array<{ owner: string; repo: string; defaultBranch?: string }>) =>
      ipcRenderer.invoke('market:installGithubSkill', sourceId, name, candidates) as Promise<{ ok: boolean; dir?: string; error?: string }>,
    uninstall: (type: MarketItemType, id: number | string) =>
      ipcRenderer.invoke('market:uninstall', type, id) as Promise<{ ok: boolean; error?: string }>,
    list: () => ipcRenderer.invoke('market:list') as Promise<InstalledRecord[]>,
    export: () => ipcRenderer.invoke('market:export') as Promise<{ ok: boolean; path?: string; error?: string }>,
    import: () => ipcRenderer.invoke('market:import') as Promise<{ ok: boolean; imported?: number; error?: string }>,
    detail: (type: MarketItemType, id: number | string) =>
      ipcRenderer.invoke('market:detail', type, id) as Promise<{ ok: boolean; detail?: MarketItemDetail; error?: string }>,
    importDir: (type: MarketItemType) =>
      ipcRenderer.invoke('market:importDir', type) as Promise<{ ok: boolean; record?: InstalledRecord; error?: string }>,
    register: (type: MarketItemType, id: number | string, name: string, version: string, dir: string) =>
      ipcRenderer.invoke('market:register', type, id, name, version, dir) as Promise<{ ok: boolean; error?: string }>,
    update: (type: MarketItemType, id: number, name: string, version: string, pkg: Record<string, unknown>) =>
      ipcRenderer.invoke('market:update', type, id, name, version, pkg) as Promise<{ ok: boolean; dir?: string; error?: string }>,
    syncChat: () => ipcRenderer.invoke('market:syncChat') as Promise<{ ok: boolean; added?: number; error?: string }>
  },
  openclawMcp: {
    /** 从后端同步启用中的 MCP 到 OpenClaw 本地配置（登录后调用） */
    syncFromBackend: (token: string) =>
      ipcRenderer.invoke('mcp:syncFromBackend', token) as Promise<{ ok: boolean; count?: number; error?: string }>,
  },
  llmIntegrations: {
    list: () => ipcRenderer.invoke('llm-integrations:list') as Promise<LlmIntegration[]>,
    save: (integration: LlmIntegration) =>
      ipcRenderer.invoke('llm-integrations:save', integration) as Promise<{ ok: boolean; integrations: LlmIntegration[]; error?: string }>,
    remove: (id: string) =>
      ipcRenderer.invoke('llm-integrations:remove', id) as Promise<{ ok: boolean; integrations: LlmIntegration[]; error?: string }>,
    test: (baseUrl: string, apiKey: string, model: string) =>
      ipcRenderer.invoke('llm-integrations:test', { baseUrl, apiKey, model }) as Promise<{ ok: boolean; message?: string }>,
  },
  edict: {
    issue: (input) =>
      ipcRenderer.invoke('edict:issue', input) as Promise<EdictOp<{ taskId: string }>>,
    board: () => ipcRenderer.invoke('edict:board') as Promise<EdictBoard>,
    task: (taskId: string) =>
      ipcRenderer.invoke('edict:task', taskId) as Promise<EdictOp<EdictTask | null>>,
    transition: (taskId: string, to: string, note?: string) =>
      ipcRenderer.invoke('edict:transition', taskId, to, note) as Promise<EdictOp>,
    veto: (taskId: string, reason: string) =>
      ipcRenderer.invoke('edict:veto', taskId, reason) as Promise<EdictOp>,
    approve: (taskId: string) =>
      ipcRenderer.invoke('edict:approve', taskId) as Promise<EdictOp>,
    complete: (taskId: string, output?: string, summary?: string, actorAgentId?: string) =>
      ipcRenderer.invoke('edict:complete', taskId, output, summary, actorAgentId) as Promise<EdictOp>,
    block: (taskId: string, reason: string) =>
      ipcRenderer.invoke('edict:block', taskId, reason) as Promise<EdictOp>,
    progress: (taskId: string, text: string, plan?: string) =>
      ipcRenderer.invoke('edict:progress', taskId, text, plan) as Promise<EdictOp>,
    run: (taskId: string, opts?: { maxVetoRounds?: number }) =>
      ipcRenderer.invoke('edict:run', taskId, opts) as Promise<EdictOp<EdictPipelineResult>>,
    officials: () => ipcRenderer.invoke('edict:officials') as Promise<EdictOfficial[]>,
    stats: () => ipcRenderer.invoke('edict:stats') as Promise<EdictStats>,
    models: () => ipcRenderer.invoke('edict:models'),
    cancel: (taskId: string) => ipcRenderer.invoke('edict:cancel', taskId) as Promise<EdictOp>,
    advance: (taskId: string) => ipcRenderer.invoke('edict:advance', taskId) as Promise<EdictOp>,
    retry: (taskId: string) => ipcRenderer.invoke('edict:retry', taskId) as Promise<EdictOp>,
    escalate: (taskId: string) => ipcRenderer.invoke('edict:escalate', taskId) as Promise<EdictOp>,
    unblock: (taskId: string) => ipcRenderer.invoke('edict:unblock', taskId) as Promise<EdictOp>,
    notifyConfig: () => ipcRenderer.invoke('edict:notify-config') as Promise<EdictNotifyConfig>,
    saveNotifyConfig: (config: EdictNotifyConfig) => ipcRenderer.invoke('edict:save-notify-config', config) as Promise<EdictOp>,
    testNotify: () => ipcRenderer.invoke('edict:test-notify') as Promise<EdictOp>,
    onBoardUpdated: (callback: (board: EdictBoard) => void) => {
      const handler = (_event: IpcRendererEvent, board: EdictBoard): void => callback(board)
      ipcRenderer.on('edict:board-updated', handler)
      return () => {
        ipcRenderer.removeListener('edict:board-updated', handler)
      }
    },
    onTaskUpdated: (callback: (task: EdictTask) => void) => {
      const handler = (_event: IpcRendererEvent, task: EdictTask): void => callback(task)
      ipcRenderer.on('edict:task-updated', handler)
      return () => {
        ipcRenderer.removeListener('edict:task-updated', handler)
      }
    },
    // ===== 补齐面板（edict-extra）：省部调度/模型/技能/朝堂议政/天下要闻/小任务/旨库 =====
    agentsStatus: () => ipcRenderer.invoke('edict:agents-status') as Promise<EdictAgentsStatusData>,
    agentWake: (agentId: string) => ipcRenderer.invoke('edict:agent-wake', agentId) as Promise<EdictOp>,
    agentConfig: () => ipcRenderer.invoke('edict:agent-config') as Promise<EdictAgentConfig>,
    setModel: (agentId: string, model: string) => ipcRenderer.invoke('edict:set-model', agentId, model) as Promise<EdictOp>,
    modelChangeLog: () => ipcRenderer.invoke('edict:model-change-log') as Promise<EdictModelChangeEntry[]>,
    skillContent: (agentId: string, skillName: string) =>
      ipcRenderer.invoke('edict:skill-content', agentId, skillName) as Promise<EdictSkillContentResult>,
    addSkill: (agentId: string, skillName: string, description: string, trigger: string) =>
      ipcRenderer.invoke('edict:add-skill', agentId, skillName, description, trigger) as Promise<EdictOp>,
    remoteSkillsList: () => ipcRenderer.invoke('edict:remote-skills-list') as Promise<EdictRemoteSkillsResult>,
    addRemoteSkill: (agentId: string, skillName: string, sourceUrl: string, description?: string) =>
      ipcRenderer.invoke('edict:add-remote-skill', agentId, skillName, sourceUrl, description) as Promise<EdictOp>,
    updateRemoteSkill: (agentId: string, skillName: string) =>
      ipcRenderer.invoke('edict:update-remote-skill', agentId, skillName) as Promise<EdictOp>,
    removeRemoteSkill: (agentId: string, skillName: string) =>
      ipcRenderer.invoke('edict:remove-remote-skill', agentId, skillName) as Promise<EdictOp>,
    skillLibrary: () => ipcRenderer.invoke('edict:skill-library') as Promise<EdictSkillLibraryResult>,
    copySkill: (agentId: string, source: string, skillName: string) =>
      ipcRenderer.invoke('edict:copy-skill', agentId, source, skillName) as Promise<EdictOp>,
    removeSkill: (agentId: string, skillName: string) =>
      ipcRenderer.invoke('edict:remove-skill', agentId, skillName) as Promise<EdictOp>,
    courtDiscussStart: (topic: string, officials: string[], taskId?: string) =>
      ipcRenderer.invoke('edict:court-discuss/start', topic, officials, taskId) as Promise<EdictCourtDiscussResult>,
    courtDiscussAdvance: (sessionId: string, userMessage?: string, decree?: string) =>
      ipcRenderer.invoke('edict:court-discuss/advance', sessionId, userMessage, decree) as Promise<EdictCourtDiscussResult>,
    courtDiscussConclude: (sessionId: string) =>
      ipcRenderer.invoke('edict:court-discuss/conclude', sessionId) as Promise<EdictOp & { summary?: string }>,
    courtDiscussDestroy: (sessionId: string) =>
      ipcRenderer.invoke('edict:court-discuss/destroy', sessionId) as Promise<EdictOp>,
    courtDiscussFate: () => ipcRenderer.invoke('edict:court-discuss/fate') as Promise<{ ok: boolean; event: string }>,
    morningBrief: () => ipcRenderer.invoke('edict:morning-brief') as Promise<EdictMorningBrief>,
    morningConfig: () => ipcRenderer.invoke('edict:morning-config') as Promise<EdictSubConfig>,
    saveMorningConfig: (config: EdictSubConfig) => ipcRenderer.invoke('edict:save-morning-config', config) as Promise<EdictOp>,
    refreshMorning: () => ipcRenderer.invoke('edict:refresh-morning') as Promise<EdictOp>,
    sessions: () => ipcRenderer.invoke('edict:sessions') as Promise<EdictSessionItem[]>,
    createTask: (input: { title: string; body?: string; priority?: string; dept?: string }) =>
      ipcRenderer.invoke('edict:create-task', input) as Promise<EdictOp<{ taskId: string }>>,
    onMorningUpdated: (callback: (brief: EdictMorningBrief) => void) => {
      const handler = (_event: IpcRendererEvent, brief: EdictMorningBrief): void => callback(brief)
      ipcRenderer.on('edict:morning-updated', handler)
      return () => {
        ipcRenderer.removeListener('edict:morning-updated', handler)
      }
    },
  },

  openclawChat: {
    /** 注入用户 llm-proxy 静态 Key（登录后调用；OpenClaw openai provider 指向云端 llm-proxy） */
    setProxyKey: (key: string) => {
      ipcRenderer.send('openclaw-chat:set-proxy-key', key)
    },
    /** 同步用户首选对话模型到 OpenClaw 配置（agents.defaults.model；当前会话由主进程 sessions.patch 处理） */
    setModel: (modelId: string) => {
      ipcRenderer.send('openclaw-chat:set-model', modelId)
    },
    send: (text: string, token: string, history?: OpenClawChatMessage[], knowledgeBaseId?: number, sessionId?: number, modelId?: string) =>
      ipcRenderer.invoke('openclaw-chat:send', { text, token, history, knowledgeBaseId, sessionId, modelId }) as Promise<{ ok: boolean; aborted?: boolean }>,
    abort: () => {
      ipcRenderer.send('openclaw-chat:abort')
    },
    /** 同步最新云端 token 到 auth.json（登录/刷新 token 时调用，供工具卡读取） */
    syncAuth: (token: string) => {
      ipcRenderer.send('openclaw-chat:sync-auth', token)
    },
    onMessage: (callback: (payload: OpenClawChatMessagePayload) => void) => {
      const handler = (_event: IpcRendererEvent, payload: OpenClawChatMessagePayload): void => callback(payload)
      ipcRenderer.on('openclaw-chat:message', handler)
      return () => {
        ipcRenderer.removeListener('openclaw-chat:message', handler)
      }
    },
    /** 终审/来源标注后的最终文本（openclaw-chat:finalize；渲染层用其覆盖流式内容） */
    onFinalize: (callback: (payload: OpenClawChatMessagePayload) => void) => {
      const handler = (_event: IpcRendererEvent, payload: OpenClawChatMessagePayload): void => callback(payload)
      ipcRenderer.on('openclaw-chat:finalize', handler)
      return () => {
        ipcRenderer.removeListener('openclaw-chat:finalize', handler)
      }
    },
    onToolCall: (callback: (toolCall: OpenClawToolCall) => void) => {
      const handler = (_event: IpcRendererEvent, toolCall: OpenClawToolCall): void => callback(toolCall)
      ipcRenderer.on('openclaw-chat:tool-call', handler)
      return () => {
        ipcRenderer.removeListener('openclaw-chat:tool-call', handler)
      }
    },
    /** Agent 生命周期（openclaw-chat:lifecycle）：start → finishing → end/error */
    onLifecycle: (callback: (payload: OpenClawChatLifecyclePayload) => void) => {
      const handler = (_event: IpcRendererEvent, payload: OpenClawChatLifecyclePayload): void => callback(payload)
      ipcRenderer.on('openclaw-chat:lifecycle', handler)
      return () => {
        ipcRenderer.removeListener('openclaw-chat:lifecycle', handler)
      }
    },
    onDone: (callback: (payload: OpenClawChatDonePayload) => void) => {
      const handler = (_event: IpcRendererEvent, payload: OpenClawChatDonePayload): void => callback(payload)
      ipcRenderer.on('openclaw-chat:done', handler)
      return () => {
        ipcRenderer.removeListener('openclaw-chat:done', handler)
      }
    },
    onError: (callback: (payload: OpenClawChatErrorPayload) => void) => {
      const handler = (_event: IpcRendererEvent, payload: OpenClawChatErrorPayload): void => callback(payload)
      ipcRenderer.on('openclaw-chat:error', handler)
      return () => {
        ipcRenderer.removeListener('openclaw-chat:error', handler)
      }
    }
  },
  syncQueue: {
    enqueue: (item) => ipcRenderer.invoke('syncQueue:enqueue', item) as Promise<number>,
    getPending: (limit) => ipcRenderer.invoke('syncQueue:getPending', limit) as Promise<SyncQueueRow[]>,
    updateStatus: (id, status, retryCount, errorMessage) =>
      ipcRenderer.invoke('syncQueue:updateStatus', id, status, retryCount, errorMessage) as Promise<void>,
    exists: (client_txn_id) => ipcRenderer.invoke('syncQueue:exists', client_txn_id) as Promise<boolean>
  }
}


const runtimeAPI: RuntimeAPI = {
  verify: () => ipcRenderer.invoke('runtime:verify'),
  verifyOne: (name: ServiceName) => ipcRenderer.invoke('runtime:verify-one', name),
  download: (name: ServiceName) => ipcRenderer.invoke('runtime:download', name),
  cancelDownload: (name: ServiceName) => ipcRenderer.invoke('runtime:cancel-download', name),
  onDownloadProgress: (callback: (progress: RuntimeDownloadProgress) => void) => {
    const handler = (
      _event: IpcRendererEvent,
      progress: RuntimeDownloadProgress
    ): void => callback(progress)
    ipcRenderer.on('runtime:download-progress', handler)
    return () => {
      ipcRenderer.removeListener('runtime:download-progress', handler)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI)
    contextBridge.exposeInMainWorld('runtime', runtimeAPI)
  } catch (err) {
    console.error('[preload] exposeInMainWorld failed:', err)
  }
} else {
  // @ts-expect-error fallback when context isolation disabled
  window.electronAPI = electronAPI
  // @ts-expect-error fallback when context isolation disabled
  window.runtime = runtimeAPI
}
