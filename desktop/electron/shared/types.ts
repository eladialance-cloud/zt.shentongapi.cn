// 主进程 / 渲染进程共享类型定义
// 该文件同时被 tsconfig.node.json 与 tsconfig.web.json 包含

export type ServiceName = "openclaw" | "n8n" | "mcp" | "hermes" | "video-claw";

export type ServiceStatus =
  "running" | "stopped" | "starting" | "error" | "unknown";

export interface ServiceInfo {
  name: ServiceName;
  displayName: string;
  status: ServiceStatus;
  port: number;
  pid?: number;
  /** 启动时间（ISO 8601 字符串） */
  startTime?: string;
  /** CPU 占用百分比（0-100） */
  cpuUsage?: number;
  /** 内存占用 MB */
  memoryUsage?: number;
  /** 错误信息（status=error 时存在） */
  error?: string;
}

export interface ServiceEnvCheck {
  openclaw: boolean;
  n8n: boolean;
  mcp: boolean;
  hermes: boolean;
}

/** 运行时下载安装位置信息 */
export interface RuntimeDirInfo {
  /** 当前运行时根目录 */
  path: string;
  /** 默认根目录（userData/runtime） */
  defaultPath: string;
  /** 所在磁盘剩余空间（字节） */
  freeBytes: number;
  /** 所在磁盘总空间（字节） */
  totalBytes: number;
  /** 获取目录信息失败时的错误信息（渲染层展示用） */
  error?: string;
}

/** 选择运行时目录结果 */
export type ChooseRuntimeDirResult =
  | { ok: true; path: string }
  | { ok: false; error?: string; canceled?: boolean };

/** 运行时 manifest 中单个服务的入口定义 */
export interface RuntimeManifestEntry {
  version: string;
  displayName: string;
  port: number;
  /** 平台 -> 入口文件名（如 win32 -> n8n.exe） */
  entry: Record<string, string>;
  /** 平台-架构 -> 下载地址（如 win32-x64） */
  downloadUrl: Record<string, string>;
  /** 平台-架构 -> SHA-256 哈希（构建期填充，空字符串表示未填充） */
  sha256: Record<string, string>;
  /** 服务类型（local = 本地运行时） */
  type?: string;
  /** 平台-架构 -> 归档大小（字节，构建期填充） */
  size?: Record<string, number>;
}

/** runtime/manifest.json 的类型结构 */
export interface RuntimeManifest {
  version: string;
  services: Record<ServiceName, RuntimeManifestEntry>;
}

/** 解析后的运行时启动命令组合 */
export interface ResolvedRuntime {
  cmd: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  /** 来源:builtin(内置)/ userData(用户目录补丁)/ host(宿主机命令) */
  source: "builtin" | "userData" | "host";
}

/** 状态变更事件 payload（通过 webContents.send('service:status-changed', payload) 推送） */
export interface ServiceStatusChangedPayload {
  name: ServiceName;
  status: ServiceStatus;
  info: ServiceInfo;
}

/** 服务错误事件 payload（通过 webContents.send('service:error', payload) 推送） */
export interface ServiceErrorPayload {
  name: ServiceName;
  message: string;
  /** 已重试次数 */
  retryCount: number;
}

export interface UpdateCheckResult {
  available: boolean;
  version?: string;
  forceUpdate: boolean;
  releaseNotes?: string;
}

/** 更新状态（通过 webContents.send('update:status', payload) 推送到渲染进程） */
export interface UpdateStatusPayload {
  /** 当前状态 */
  status:
    | "checking"
    | "available"
    | "not-available"
    | "downloading"
    | "downloaded"
    | "error";
  /** 新版本号 */
  version?: string;
  /** 更新日志 */
  releaseNotes?: string;
  /** 是否强制更新 */
  forceUpdate: boolean;
  /** 是否命中灰度 */
  grayscaleHit: boolean;
  /** 灰度百分比（服务端下发） */
  grayscalePercent?: number;
  /** 下载进度 0-100 */
  progress: number;
  /** 附加信息（错误消息等） */
  message?: string;
}

/** 运行时下载进度（通过 webContents.send('runtime:download-progress', payload) 推送） */
export interface RuntimeDownloadProgress {
  /** 服务名 */
  name: ServiceName;
  /** 进度百分比 0-100 */
  percent: number;
  /** 下载速率 KB/s */
  speedKBs: number;
  /** 预计剩余秒数 */
  etaSec: number;
}

/** 运行时校验结果（runtime:verify 通道返回值） */
export interface RuntimeVerifyResult {
  /** 各服务完整性 */
  results: Record<ServiceName, boolean>;
  /** 全部通过 */
  allPassed: boolean;
}

/** 同步队列实体类型 */
export type SyncEntityType =
  "chat_session" | "chat_message" | "workflow_execution" | "plugin_call_log" | "brief";

/** 同步队列操作类型 */
export type SyncOperation = "create" | "update" | "delete";

/** 同步队列项（入队时使用） */
export interface SyncQueueItem {
  client_txn_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  operation: SyncOperation;
  payload: unknown;
}

/** 同步队列行（数据库中的完整记录） */
export interface SyncQueueRow {
  id: number;
  client_txn_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  operation: SyncOperation;
  payload: unknown;
  status: "pending" | "synced" | "failed";
  retry_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

/** 本地需求单（一期本地 MVP，字段命名与云端 briefs 对齐，snake_case 落库 camelCase 出参） */
export interface LocalBrief {
  id: number;
  clientBriefId: string;
  userId: number;
  title: string;
  goal?: string;
  targetAudience?: string;
  platforms?: string[];
  style?: string;
  deadline?: string | null;
  status: "draft" | "confirmed" | "executing" | "completed" | "cancelled";
  sourceChatSessionId?: number | null;
  sourceChatSummary?: string | null;
  cloudSynced: boolean;
  createdAt: string;
  updatedAt: string;
}

// 设备指纹（采集本机硬件/系统特征生成 SHA-256 哈希）
export interface DeviceFingerprint {
  fingerprint: string; // SHA-256 哈希（64 字符 hex）
  hostname: string;
  platform: string; // win32/darwin/linux
  arch: string; // x64/arm64
  macAddress: string;
  appVersion: string;
}

// 完整设备信息（指纹 + 设备名 + CPU/内存）
export interface DeviceInfo extends DeviceFingerprint {
  deviceName: string;
  cpus: number;
  totalMemory: number;
}


/** 市场内容类型 */
export type MarketItemType = "skill" | "plugin" | "workflow" | "agent" | "mcp";

/** 本地内容来源:官方下载 / 自定义导入 / 对话中 OpenClaw 安装 / GitHub 开源技能直连下载 */
export type MarketSource = "official" | "custom" | "chat" | "github";

/** 本地已安装记录（market/installed.json 条目） */
export interface InstalledRecord {
  type: MarketItemType;
  /** 官方下载=数字市场 id;自定义导入/对话安装=字符串标识(slug/文件名) */
  id: number | string;
  name: string;
  version: string;
  dir: string;
  installedAt: string;
  /** 来源,缺省视为 official(存量数据) */
  source?: MarketSource;
  /** 官方最新版本(渲染层更新检测结果,不持久化) */
  latestVersion?: string;
}

/** 本地详情(我的详情页读本地文件后返回) */
export interface MarketItemDetail {
  type: MarketItemType;
  id: number | string;
  name: string;
  version: string;
  dir: string;
  source: MarketSource;
  installedAt: string;
  description: string;
  /**
   * 分类专用载荷:
   * agent=systemPrompt / tools 引用;skill=SKILL.md 全文;workflow=workflowJson;plugin=manifest 对象
   */
  detail: Record<string, unknown>;
}

/** 下载安装包结果（后端 GET /api/market/items/:type/:id/download） */
export interface MarketDownloadResult {
  type: MarketItemType;
  id: number;
  version: string;
  name: string;
  sha256: string;
  size: number;
  pkg: Record<string, unknown>;
}

// 通过 contextBridge 暴露给渲染进程的 API 形状
/** OpenClaw 本地直达对话相关类型 */
export interface OpenClawChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OpenClawToolCall {
  id: string;
  name: string;
  input: unknown;
  /** 工具调用状态：start 开始 / done 完成 / error 失败 */
  state?: 'start' | 'done' | 'error';
  /** 工具执行结果摘要（done/error 时） */
  output?: string;
}

export interface OpenClawUsage {
  input: number;
  output: number;
  total: number;
}

/** openclaw-chat:message 推送 payload */
export interface OpenClawChatMessagePayload {
  content: string;
}

/** openclaw-chat:done 推送 payload */
export interface OpenClawChatDonePayload {
  usage?: OpenClawUsage;
}

/** openclaw-chat:error 推送 payload */
/** OpenClaw Agent 生命周期信息 */
export interface OpenClawLifecycleInfo {
  phase: 'start' | 'finishing' | 'end' | 'error';
  stopReason?: string;
  error?: string;
}

/** openclaw-chat:lifecycle 推送 payload */
export interface OpenClawChatLifecyclePayload {
  lifecycle: OpenClawLifecycleInfo;
}

export interface OpenClawChatErrorPayload {
  message: string;
}

/** 自定义大模型接入（仅存本机 userData，OpenAI 兼容端点） */
export interface LlmIntegrationModel {
  /** 上游模型 ID（如 gpt-4o / deepseek-chat） */
  id: string;
  /** 显示名（缺省取模型 ID） */
  name?: string;
  /** chat=文本对话 / vision=支持图片输入 */
  modelType?: "chat" | "vision";
}

export interface LlmIntegration {
  /** 本地唯一 id（uuid） */
  id: string;
  /** 接入名称（如「我的 OpenAI」） */
  name: string;
  /** OpenAI 兼容 Base URL（如 https://api.openai.com/v1） */
  baseUrl: string;
  /** API Key（仅存本机） */
  apiKey: string;
  models: LlmIntegrationModel[];
  createdAt: number;
  updatedAt: number;
}

export interface LlmIntegrationTestResult {
  ok: boolean;
  message?: string;
}

export interface LlmIntegrationStoreResult {
  ok: boolean;
  integrations: LlmIntegration[];
  error?: string;
}


export interface HermesSkillItem {
  name: string;
  source?: string;
  version?: string;
  builtin?: boolean;
}

export interface HermesSkillsListResult {
  ok: boolean;
  error?: string;
  items?: HermesSkillItem[];
  stdout?: string;
}

export interface HermesMemoryCard {
  source: "memory" | "profile";
  text: string;
}

export interface HermesEvolutionResult {
  ok: boolean;
  error?: string;
  memory?: HermesMemoryCard[];
  journey?: Record<string, unknown> | null;
  journeyRaw?: string;
  curator?: string;
  memoryStatus?: string;
}

export interface HermesSkillsOpResult {
  ok: boolean;
  error?: string;
  stdout?: string;
}

export interface ElectronAPI {
  service: {
    getStatus(): Promise<Record<ServiceName, ServiceStatus>>;
    /** 获取单个服务的完整信息（含 pid/cpu/memory/startTime） */
    status(name: ServiceName): Promise<ServiceInfo>;
    /** 获取所有服务的完整信息列表 */
    list(): Promise<ServiceInfo[]>;
    start(name: ServiceName): Promise<boolean>;
    stop(name: ServiceName): Promise<boolean>;
    restart(name: ServiceName): Promise<boolean>;
    checkEnv(): Promise<ServiceEnvCheck>;
    install(name: ServiceName): Promise<boolean>;
    /** 获取当前运行时下载安装位置（路径 + 磁盘空间） */
    getRuntimeDir(): Promise<RuntimeDirInfo>;
    /** 弹窗选择新的下载安装位置（方案 B：不迁移已下载内容） */
    chooseRuntimeDir(): Promise<ChooseRuntimeDirResult>;
    /** 监听服务状态变更，返回取消监听函数 */
    onStatusChanged(
      callback: (payload: ServiceStatusChangedPayload) => void,
    ): () => void;
    /** 监听服务错误事件，返回取消监听函数 */
    onError(callback: (payload: ServiceErrorPayload) => void): () => void;
    onInstallProgress(callback: (payload: InstallProgressPayload) => void): () => void;
  };
  app: {
    getVersion(): Promise<string>;
    checkUpdate(): Promise<void>;
    quitAndInstall(): Promise<void>;
    disableHardwareAcceleration?(): Promise<void>;
    /** 使用系统默认浏览器打开外部链接（真实支付跳转用） */
    openExternal(url: string): Promise<void>;
  };
  /** 设置页每类默认模型同步（chat/vision/image/video/tts → Hermes/ST-Claw 配置） */
  modelDefaultsSync(dto: { chat?: string | null; vision?: string | null; image?: string | null; video?: string | null; tts?: string | null } | null): void;

  /** 本地 Hermes 技能中心（封装 hermes skills CLI） */
  hermesSkills: {
    list(): Promise<HermesSkillsListResult>;
    search(query: string): Promise<HermesSkillsListResult>;
    install(identifier: string): Promise<HermesSkillsOpResult>;
    update(name?: string): Promise<HermesSkillsOpResult>;
    uninstall(name: string): Promise<HermesSkillsOpResult>;
    check(): Promise<HermesSkillsOpResult>;
  };
  /** Hermes 进化可视化（记忆 + journey + curator） */
  hermesEvolution: {
    get(): Promise<HermesEvolutionResult>;
  };

  /** 自动更新（electron-updater 封装） */
  updater: {
    /** 手动检查更新 */
    check(): Promise<void>;
    /** 触发下载更新 */
    download(): Promise<void>;
    /** 退出并安装更新 */
    install(): Promise<void>;
    /** 监听更新状态变更，返回取消监听函数 */
    onStatus(callback: (payload: UpdateStatusPayload) => void): () => void;
  };
  window: {
    minimize(): void;
    maximize(): void;
    close(): void;
  };
  device: {
    getFingerprint(): Promise<string>;
  };
  db: {
    /** 初始化本地数据库（登录后调用），返回是否成功（失败则进入降级模式） */
    initialize(userToken: string): Promise<boolean>;
    /** 检查本地数据库是否处于降级模式（同步） */
    isDegraded(): boolean;
    /** 关闭本地数据库（登出时调用） */
    close(): void;
    briefs: {
      list(): Promise<LocalBrief[]>;
      create(input: {
        userId: number;
        title: string;
        goal?: string;
        targetAudience?: string;
        platforms?: string[];
        style?: string;
        deadline?: string | null;
        status?: LocalBrief["status"];
        sourceChatSessionId?: number | null;
        sourceChatSummary?: string | null;
      }): Promise<LocalBrief | null>;
      update(
        id: number,
        patch: Partial<Pick<LocalBrief, "title" | "goal" | "targetAudience" | "platforms" | "style" | "deadline" | "status">>,
      ): Promise<LocalBrief | undefined>;
      remove(id: number): Promise<void>;
      /** 标记本地需求单已同步到云端（按 clientBriefId） */
      markSynced(clientBriefId: string): Promise<void>;
    };
  };
  /** 同步队列操作（离线调用队列 + 上行同步） */
  /** 本地内容市场（下载安装官方内容到本地） */
  market: {
    /** 安装：写入本地目录并更新 installed.json（pkg 来自后端下载接口） */
    install(
      type: MarketItemType,
      id: number,
      name: string,
      version: string,
      pkg: Record<string, unknown>,
    ): Promise<{ ok: boolean; dir?: string; error?: string }>;
    /** GitHub 开源技能直连下载安装（候选仓库依次尝试 main/master 分支 tar.gz） */
    installGithubSkill(
      sourceId: number,
      name: string,
      candidates: Array<{ owner: string; repo: string }>,
    ): Promise<{ ok: boolean; dir?: string; error?: string }>;
    /** 卸载：删除本地目录并更新清单 */
    uninstall(type: MarketItemType, id: number | string): Promise<{ ok: boolean; error?: string }>;
    /** 本地已安装清单 */
    list(): Promise<InstalledRecord[]>;
    /** 导出个人内容（个人知识库 + 清单）为 .zip，返回保存路径或 null（取消） */
    export(): Promise<{ ok: boolean; path?: string; error?: string }>;
    /** 从 .zip 导入个人内容，返回导入记录数 */
    import(): Promise<{ ok: boolean; imported?: number; error?: string }>;
    /** 读取本地详情(我的详情页) */
    detail(type: MarketItemType, id: number | string): Promise<{ ok: boolean; detail?: MarketItemDetail; error?: string }>;
    /** 自定义导入(选择本地目录/文件) */
    importDir(type: MarketItemType): Promise<{ ok: boolean; record?: InstalledRecord; error?: string }>;
    /** 登记对话安装内容(source=chat) */
    register(type: MarketItemType, id: number | string, name: string, version: string, dir: string): Promise<{ ok: boolean; error?: string }>;
    /** 更新本地内容(官方新版) */
    update(type: MarketItemType, id: number, name: string, version: string, pkg: Record<string, unknown>): Promise<{ ok: boolean; dir?: string; error?: string }>;
    /** 扫描本地运行时目录补登记 */
    syncChat(): Promise<{ ok: boolean; added?: number; error?: string }>;
  };
  /** 把后端启用中的 MCP 写入 OpenClaw 本地配置 */
  openclawMcp: {
    syncFromBackend(token: string): Promise<{ ok: boolean; count?: number; error?: string }>;
  };
  syncQueue: {
    /** 入队：写入 local_sync_queue，返回自增 id */
    enqueue(item: SyncQueueItem): Promise<number>;
    /** 读取 status=pending 的记录，最多 limit 条 */
    getPending(limit: number): Promise<SyncQueueRow[]>;
    /** 更新记录状态（同步成功/失败时调用） */
    updateStatus(
      id: number,
      status: "synced" | "failed" | "pending",
      retryCount: number,
      errorMessage?: string,
    ): Promise<void>;
    /** 根据 client_txn_id 查询是否已存在 */
    exists(client_txn_id: string): Promise<boolean>;
  };


/** 自定义大模型接入（本机保存，OpenAI 兼容端点；测试连接与增删改查） */
  llmIntegrations: {
    list(): Promise<LlmIntegration[]>;
    save(integration: LlmIntegration): Promise<LlmIntegrationStoreResult>;
    remove(id: string): Promise<LlmIntegrationStoreResult>;
    test(
      baseUrl: string,
      apiKey: string,
      model: string,
    ): Promise<LlmIntegrationTestResult>;
  };


  /** OpenClaw 本地直达对话（记账在云端，消息走本地 OpenClaw） */
  openclawChat: {
    /** 注入用户 llm-proxy 静态 Key（登录后调用；OpenClaw openai provider 指向云端 llm-proxy） */
    setProxyKey(key: string): void;
    /** 同步用户首选对话模型到 OpenClaw 配置（agents.defaults.model；当前会话由主进程 sessions.patch 处理） */
    setModel(modelId: string): void;
    /** 发送一条消息：本地 OpenClaw 流式对话（扣费由云端 llm-proxy 完成）。流式内容经 onMessage 推送 */
    send(
      text: string,
      token: string,
      history?: OpenClawChatMessage[],
      knowledgeBaseId?: number,
      sessionId?: number,
      modelId?: string,
    ): Promise<{ ok: boolean; aborted?: boolean }>;
    /** 中断当前对话（本地 abort） */
    abort(): void;
    /** 流式文本块（openclaw-chat:message） */
    onMessage(cb: (payload: OpenClawChatMessagePayload) => void): () => void;
    /** 终审/来源标注后的最终文本（openclaw-chat:finalize；渲染层用其覆盖流式内容） */
    onFinalize(cb: (payload: OpenClawChatMessagePayload) => void): () => void;
    /** 工具调用（openclaw-chat:tool-call） */
    onToolCall(cb: (toolCall: OpenClawToolCall) => void): () => void;
    /** Agent 生命周期（openclaw-chat:lifecycle） */
    onLifecycle(cb: (payload: OpenClawChatLifecyclePayload) => void): () => void;
    /** 完成（openclaw-chat:done） */
    onDone(cb: (payload: OpenClawChatDonePayload) => void): () => void;
    /** 错误（openclaw-chat:error） */
    onError(cb: (payload: OpenClawChatErrorPayload) => void): () => void;
  };
}

/** 通过 contextBridge.exposeInMainWorld('runtime', ...) 暴露给渲染进程的运行时 API 形状 */
export interface RuntimeAPI {
  /** 校验所有服务运行时完整性，返回各服务结果与是否全部通过 */
  verify(): Promise<RuntimeVerifyResult>;
  /** 校验单个服务运行时完整性（SHA-256） */
  verifyOne(name: ServiceName): Promise<boolean>;
  /** 下载服务运行时到 userData 目录（含 SHA-256 校验与解压） */
  download(name: ServiceName): Promise<boolean>;
  /** 取消正在进行的下载（保留临时文件以便断点续传） */
  cancelDownload(name: ServiceName): Promise<boolean>;
  /** 监听下载进度推送，返回取消监听函数（便于 React useEffect cleanup） */
  onDownloadProgress(
    callback: (progress: RuntimeDownloadProgress) => void,
  ): () => void;
}

/** 远程控制来源平台 */
export type RemoteControlPlatform = "feishu" | "wecom";

/** 远程控制命令类型 */
export type RemoteCommandType =
  | "run_workflow"
  | "query_status"
  | "stop_task"
  | "delete_file"
  | "format_disk"
  | "execute_system_command"
  | "modify_system_config"
  | "unknown";

/** 远程控制安全等级 */
export type RemoteSecurityLevel = "high" | "medium" | "low";

/** 远程命令 */
export interface RemoteCommand {
  commandId: string;
  type: RemoteCommandType;
  payload: Record<string, unknown>;
  raw: string;
  source: RemoteControlPlatform;
}

/** 远程命令执行结果 */
export interface RemoteCommandResult {
  commandId: string;
  status: "success" | "failed" | "running" | "need_confirmation";
  progress?: number;
  message?: string;
  description?: string;
  data?: unknown;
}

/** IM 平台绑定状态 */
export interface IMPlatformBinding {
  bound: boolean;
  chatId?: string;
  userId?: string;
}

/** 远程控制设置 */
export interface RemoteControlSettings {
  enabled: boolean;
  securityLevel: RemoteSecurityLevel;
  feishu: IMPlatformBinding;
  wecom: IMPlatformBinding;
  deviceWhitelist: Record<string, unknown>[];
}

/** 安装进度推送 */
export interface InstallProgressPayload {
  name: ServiceName;
  percent: number;
  status: "downloading" | "extracting" | "verifying" | "completed" | "error";
  message?: string;
}
