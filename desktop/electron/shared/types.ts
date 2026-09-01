// 主进程 / 渲染进程共享类型定义
// 该文件同时被 tsconfig.node.json 与 tsconfig.web.json 包含



import type {
  EdictAgentConfig,
  EdictAgentStatusInfo,
  EdictAgentsStatusData,
  EdictBoard,
  EdictCourtDiscussResult,
  EdictModelChangeEntry,
  EdictMorningBrief,
  EdictOfficial,
  EdictOp,
  EdictPipelineResult,
  EdictRemoteSkillItem,
  EdictRemoteSkillsResult,
  EdictSessionItem,
  EdictSkillContentResult,
  EdictSkillLibraryResult,
  EdictStats,
  EdictSubConfig,
  EdictNotifyConfig,
  EdictTask,
  EdictTodo,
} from "./edict-types";
export type {
  EdictAgentConfig,
  EdictAgentStatusInfo,
  EdictAgentsStatusData,
  EdictBoard,
  EdictCourtDiscussResult,
  EdictModelChangeEntry,
  EdictMorningBrief,
  EdictNotifyConfig,
  EdictOfficial,
  EdictOp,
  EdictPipelineResult,
  EdictRemoteSkillItem,
  EdictRemoteSkillsResult,
  EdictSessionItem,
  EdictSkillContentResult,
  EdictSkillLibraryResult,
  EdictStats,
  EdictSubConfig,
  EdictTask,
  EdictTodo,
};


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


/** Hermes 官方状态（P1：GET /api/status + /api/system/stats，面板只读） */
export interface HermesStatusPayload {
  version?: string;
  overall?: string;
  active_agents?: number;
  active_sessions?: number;
  [key: string]: unknown;
}

export interface HermesSystemStatsPayload {
  hermes_version?: string;
  cpu_percent?: number;
  memory?: Record<string, unknown>;
  disk?: Record<string, unknown>;
  process?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface HermesStatusResult {
  status: HermesStatusPayload | null;
  stats: HermesSystemStatsPayload | null;
}

export interface HermesSkillsOpResult {
  ok: boolean;
  error?: string;
  stdout?: string;
}
export type HermesMemoryTarget = "memory" | "profile";

export interface HermesMemoryEntry {
  target: HermesMemoryTarget;
  text: string;
}


/** 逐步编排：单步执行结果（子代理完成一个节点后输出） */
export interface OrchestrateStepOutput {
  type: string;
  url?: string;
  content?: string;
}

/** 确认记录：verdict pass=通过 rework=打回；by=hermes 自评 / user 人工 */
export interface OrchestrateStepReview {
  verdict: "pass" | "rework";
  reason?: string;
  by: "hermes" | "user";
  at?: string;
}

/** 逐步编排：单步（子代理节点）状态 */
export type OrchestrateStepStatus = "pending" | "running" | "pending_review" | "done" | "rejected";

/** 逐步编排：单个子代理节点 */
export interface OrchestrateStep {
  name: string;
  agentRole?: string;
  status: OrchestrateStepStatus;
  assigneeName?: string;
  outputs?: OrchestrateStepOutput[];
  review?: OrchestrateStepReview;
  /** 重做次数（打回自动重做，上限 2） */
  retryCount?: number;
  /** 最近一次打回原因/反馈（重做时注入 prompt） */
  lastFeedback?: string;
  /** 原始状态（含 pending_review/rejected），与顶层 status 的收敛值互补 */
  rawStatus?: OrchestrateStepStatus;
}

/** 逐步编排：提交入参 */
export interface OrchestrateInput {
  executionRef: string;
  teamTaskId: number;
  /** 执行团队 ID（auto/agent 模式可空） */
  teamId?: number;
  /** 执行方式：team=指定团队 auto=Hermes自动匹配 agent=指定单个Agent */
  executeMode?: "team" | "auto" | "agent";
  /** 指定单个 Agent（executeMode=agent 时指向 agents.id） */
  agentId?: number;
  briefId?: number;
  task: string;
  teamMembers?: TeamMemberProfileItem[];
  context?: Record<string, unknown>;
  modelDefaults?: {
    chat?: string;
    vision?: string;
    image?: string;
    video?: string;
    tts?: string;
  };
  timeoutMs?: number;
  /** Hermes 独立评审开关（缺省 false；渲染层提交时默认 true） */
  reviewEnabled?: boolean;
  /** 评审模型（缺省用默认 chat 模型） */
  reviewModel?: string;
}

/** 团队成员人设（渲染层经 load-members 获取后透传） */
export interface TeamMemberProfileItem {
  memberId: number;
  agentId: number;
  roleTitle: string;
  roleDescription?: string;
  systemPrompt?: string;
  modelId?: string;
  knowledgeBaseIds?: number[];
}

/** 逐步编排：IPC 通道返回 */
export interface OrchestrateSubmitResult {
  ok: boolean;
  started?: boolean;
  error?: string;
}

/** 逐步编排：确认/打回 IPC 入参 */
export interface OrchestrateStepActionPayload {
  token: string;
  /** 预留：IPC 实际按 teamTaskId 路由 */
  teamId?: number;
  teamTaskId: number;
  stepIndex: number;
  reason?: string;
}

export interface HermesMemoryOpResult {
  ok: boolean;
  error?: string;
  entries?: HermesMemoryEntry[];
  /** 超出字符上限时被逐出的最旧条目 */
  evicted?: string[];
}

/** 发布平台（桌面端扫码登录用；id 与后端 publish_platforms.platform 一致） */
export interface PlatformInfo {
  id: string;
  displayName: string;
  loginUrl: string;
  publishUrl: string;
  homeUrl: string;
}

/** 扫码登录结果（桌面端采集 cookies 加密存本地） */
export type PlatformSetupLoginResult =
  | { ok: true; cookiesJson: string; displayName?: string }
  | { ok: false; error: string };

/** 登录态测试结果 */
export type PlatformTestLoginResult =
  | { ok: true; online: boolean; status?: number | string; message?: string }
  | { ok: false; error: string };

/** 发布平台账号本地会话 API（桌面端扫码绑定；管理后台只控制平台开关） */
export interface PlatformAccountApi {
  /** 支持的平台列表（含登录/发布/主页地址） */
  getSupportedPlatforms(): Promise<PlatformInfo[]>;
  /** 弹出扫码登录窗口并采集 cookies（成功已写入本地会话） */
  setupLogin(platform: string): Promise<PlatformSetupLoginResult>;
  /** 用本地会话探测平台登录态 */
  testLogin(platform: string): Promise<PlatformTestLoginResult>;
  /** 系统浏览器打开平台主页 */
  openAccount(platform: string): Promise<void>;
  /** 用本地会话打开发布页并尽力预填标题/描述/标签 */
  openPublish(
    platform: string,
    payload?: { title?: string; description?: string; tags?: string },
  ): Promise<{ ok: boolean; error?: string }>;
  /** 保存本地会话（加密写入 userData/platform-sessions.json） */
  saveSession(
    platform: string,
    cookiesJson: string,
    displayName?: string,
  ): Promise<{ ok: boolean; error?: string }>;
  /** 移除本地会话 */
  removeSession(platform: string): Promise<{ ok: boolean }>;
}

/** 桌面端本地视频解析结果（对标轻语 videoParser：读取链接→打开页面→抓视频→落盘） */
export type VideoParseResult =
  | {
      ok: true
      videoPath: string
      title: string
      coverUrl?: string
      duration?: number
      platform: string
      mediaUrl: string
    }
  | { ok: false; error: string; platform?: string; pageText?: string }

/** 桌面端本地视频解析 API（渲染进程→主进程 IPC） */
export interface VideoParserApi {
  /** 从分享文本/口令中提取首个 URL */
  extractUrl(text: string): Promise<string | null>
  /** 校验链接是否为可解析的 http(s)/直链 */
  validateUrl(url: string): Promise<{ ok: boolean; platform: string }>
  /** 解析平台链接 → 本地视频文件（内置 Chromium 打开页面，等 video 元素/拦响应） */
  parse(url: string): Promise<VideoParseResult>
  /** 读取解析产物（仅限解析目录），供上传后端提取文案 */
  readFile(filePath: string): Promise<ArrayBuffer | null>
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
  /** 媒体代理：主进程拉取远程媒体（绕过 CORS，供 canvas 封面设计器免污染使用） */
  media: {
    /** 拉取远程文件为 base64 + mime（限 http/https，超时 60s，上限 50MB） */
    fetchBuffer(url: string): Promise<{ data: string; mime: string }>;
  };
  /** 发布平台账号（桌面端扫码绑定登录态，本地加密存储） */
  platformAccount: PlatformAccountApi;
  /** 桌面端本地视频解析器（对标轻语 videoParser：抖音/快手/B站/小红书/视频号链接 → 本地视频文件） */
  videoParser: VideoParserApi;

  /** 本地 N8N 工作流真执行（直连 127.0.0.1:5678 webhook） */
  n8n: {
    runWorkflow(input: {
      /** 候选 webhook 路径（按序尝试） */
      paths: string[];
      /** 工作流输入参数 */
      payload?: unknown;
      /** 总超时（毫秒） */
      timeoutMs?: number;
    }): Promise<{ ok: boolean; data?: unknown; error?: string; path?: string }>;
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
    /** 弹窗选择本地文件夹安装技能（需含 SKILL.md） */
    installLocal(): Promise<HermesSkillsOpResult>;
  };
  /** Hermes 官方状态（P1：/api/status + /api/system/stats，只读） */
  hermesStatus: {
    get(): Promise<HermesStatusResult>;
  };

  /** Hermes 记忆本地读写桥（MEMORY.md/USER.md，§ 分隔，幂等去重） */
  hermesMemory: {
    list(target: HermesMemoryTarget): Promise<HermesMemoryOpResult>;
    add(target: HermesMemoryTarget, text: string): Promise<HermesMemoryOpResult>;
    replace(target: HermesMemoryTarget, match: string, text: string): Promise<HermesMemoryOpResult>;
    remove(target: HermesMemoryTarget, text: string): Promise<HermesMemoryOpResult>;
  };

  /** Hermes 逐步编排（团队任务 → 子代理逐步执行 + 人工/自评确认） */
  hermesOrchestrate: {
    submit(payload: {
      token: string;
      input: OrchestrateInput;
      autoConfirm?: boolean;
      reviewEnabled?: boolean;
      reviewModel?: string;
    }): Promise<OrchestrateSubmitResult>;
    confirmStep(payload: OrchestrateStepActionPayload): Promise<OrchestrateSubmitResult>;
    rejectStep(payload: OrchestrateStepActionPayload): Promise<OrchestrateSubmitResult>;
    loadMembers(payload: { token: string; teamId: number }): Promise<{ ok: boolean; members?: TeamMemberProfileItem[]; error?: string }>;
    /** 运行中切换自动确认（自评）开关 */
    setAutoConfirm(payload: { token: string; teamTaskId: number; autoConfirm: boolean }): Promise<OrchestrateSubmitResult>;
    /** 暂停（当前节点跑完后挂起） */
    pause(payload: { teamTaskId: number }): Promise<OrchestrateSubmitResult>;
    /** 继续执行 */
    resume(payload: { teamTaskId: number }): Promise<OrchestrateSubmitResult>;
    /** 立即中断（杀掉当前 Hermes CLI，任务标记失败） */
    stop(payload: { teamTaskId: number }): Promise<OrchestrateSubmitResult>;
    /** 删除团队任务（先停止运行再调后端 DELETE） */
    deleteTask(payload: { token: string; teamId?: number; teamTaskId: number }): Promise<OrchestrateSubmitResult>;
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
      candidates: Array<{ owner: string; repo: string; defaultBranch?: string }>,
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


  /** 三省六部看板（OpenClaw 太子 + Hermes 官署执行，edict JSON 看板） */
  edict: EdictAPI;

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
    /** 同步最新云端 token 到 auth.json（登录/刷新 token 时调用，供工具卡读取） */
    syncAuth(token: string): void;
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





/** 三省六部 IPC API（edict:*，主进程 edict-bridge 注册） */
export interface EdictAPI {
  /** 下旨：太子建任务（create → Zhongshu）；返回 taskId */
  issue(input: { title: string; body?: string; priority?: string; dept?: string }): Promise<EdictOp<{ taskId: string }>>;
  /** 全量看板 */
  board(): Promise<EdictBoard>;
  /** 单个任务 */
  task(taskId: string): Promise<EdictOp<EdictTask | null>>;
  /** 状态流转（校验状态机，非法返回原因） */
  transition(taskId: string, to: string, note?: string): Promise<EdictOp>;
  /** 封驳（门下 → 中书，需 reason） */
  veto(taskId: string, reason: string): Promise<EdictOp>;
  /** 准奏（门下 → 尚书） */
  approve(taskId: string): Promise<EdictOp>;
  /** 完成收口（done） */
  complete(taskId: string, output?: string, summary?: string, actorAgentId?: string): Promise<EdictOp>;
  /** 阻塞 */
  block(taskId: string, reason: string): Promise<EdictOp>;
  /** 进展上报 */
  progress(taskId: string, text: string, plan?: string): Promise<EdictOp>;
  /** 编排执行：当前状态按状态机推进到终态（Hermes CLI 逐节点） */
  run(taskId: string, opts?: { maxVetoRounds?: number }): Promise<EdictOp<EdictPipelineResult>>;
  /** 官署状态 */
  officials(): Promise<EdictOfficial[]>;
  /** 军机处统计 */
  stats(): Promise<EdictStats>;
  /** 默认模型 + 官署 profiles */
  models(): Promise<{ default: string; profiles: { id: string; label: string }[] }>;
  /** 看板变化推送（edict:board-updated） */
  onBoardUpdated(cb: (board: EdictBoard) => void): () => void;
  /** 单任务变化推送（edict:task-updated） */
  onTaskUpdated(cb: (task: EdictTask) => void): () => void;
  /** 人工介入：取消任务 */
  cancel(taskId: string): Promise<EdictOp>;
  /** 人工介入：推进到下一合法状态 */
  advance(taskId: string): Promise<EdictOp>;
  /** 人工介入：重新触发三省六部编排（停滞重试） */
  retry(taskId: string): Promise<EdictOp>;
  /** 人工介入：停滞升级一步 */
  escalate(taskId: string): Promise<EdictOp>;
  /** 人工介入：解阻（Blocked → 重新起草） */
  unblock(taskId: string): Promise<EdictOp>;
  /** 结果回传通知：读取本地配置 */
  notifyConfig(): Promise<EdictNotifyConfig>;
  /** 结果回传通知：保存本地配置 */
  saveNotifyConfig(config: EdictNotifyConfig): Promise<EdictOp>;
  /** 结果回传通知：发送测试消息 */
  testNotify(): Promise<EdictOp>;

  /** 省部调度：全部官署 Agent 在线状态 */
  agentsStatus(): Promise<EdictAgentsStatusData>;
  /** 省部调度：唤醒（确保）指定官署 profile */
  agentWake(agentId: string): Promise<EdictOp>;
  /** 模型配置：官署 Agent 配置（含模型/技能/knownModels） */
  agentConfig(): Promise<EdictAgentConfig>;
  /** 模型配置：切换指定官署模型（写 Hermes config.yaml + 同步 profiles） */
  setModel(agentId: string, model: string): Promise<EdictOp>;
  /** 模型配置：模型变更日志 */
  modelChangeLog(): Promise<EdictModelChangeEntry[]>;
  /** 技能配置：读取官署技能文件内容 */
  skillContent(agentId: string, skillName: string): Promise<EdictSkillContentResult>;
  /** 技能配置：本地新增技能 */
  addSkill(agentId: string, skillName: string, description: string, trigger: string): Promise<EdictOp>;
  /** 技能配置：远程技能列表 */
  remoteSkillsList(): Promise<EdictRemoteSkillsResult>;
  /** 技能配置：添加远程技能 */
  addRemoteSkill(agentId: string, skillName: string, sourceUrl: string, description?: string): Promise<EdictOp>;
  /** 技能配置：更新远程技能 */
  updateRemoteSkill(agentId: string, skillName: string): Promise<EdictOp>;
  /** 技能配置：移除远程技能 */
  removeRemoteSkill(agentId: string, skillName: string): Promise<EdictOp>;
  /** 技能配置：技能库（技能市场《我的》：OpenClaw 内置 / Hermes 已装 / 云端技能包） */
  skillLibrary(): Promise<EdictSkillLibraryResult>;
  /** 技能配置：把技能库技能整目录复制到官署 profile */
  copySkill(agentId: string, source: string, skillName: string): Promise<EdictOp>;
  /** 技能配置：删除官署本地技能（可重新添加） */
  removeSkill(agentId: string, skillName: string): Promise<EdictOp>;
  /** 朝堂议政：开始议政 */
  courtDiscussStart(topic: string, officials: string[], taskId?: string): Promise<EdictCourtDiscussResult>;
  /** 朝堂议政：推进一轮（可带皇帝发言/天命） */
  courtDiscussAdvance(sessionId: string, userMessage?: string, decree?: string): Promise<EdictCourtDiscussResult>;
  /** 朝堂议政：散朝总结 */
  courtDiscussConclude(sessionId: string): Promise<EdictOp & { summary?: string }>;
  /** 朝堂议政：销毁会话 */
  courtDiscussDestroy(sessionId: string): Promise<EdictOp>;
  /** 朝堂议政：命运骰子 */
  courtDiscussFate(): Promise<{ ok: boolean; event: string }>;
  /** 天下要闻：简报 */
  morningBrief(): Promise<EdictMorningBrief>;
  /** 天下要闻：订阅配置 */
  morningConfig(): Promise<EdictSubConfig>;
  /** 天下要闻：保存订阅配置 */
  saveMorningConfig(config: EdictSubConfig): Promise<EdictOp>;
  /** 天下要闻：立即采集 */
  refreshMorning(): Promise<EdictOp>;
  /** 小任务/会话列表 */
  sessions(): Promise<EdictSessionItem[]>;
  /** 旨库：模板下旨（复用 issue 建任务） */
  createTask(input: { title: string; body?: string; priority?: string; dept?: string }): Promise<EdictOp<{ taskId: string }>>;
  /** 天下要闻：采集完成推送（edict:morning-updated） */
  onMorningUpdated(cb: (brief: EdictMorningBrief) => void): () => void;
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
