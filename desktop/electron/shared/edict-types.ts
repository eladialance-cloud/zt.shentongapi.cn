// 三省六部共享类型（主进程 / 渲染进程共用）
// 数据模型照搬 edict tasks_source.json 结构；状态机照搬 kanban/task.py STATE_TRANSITIONS。

/** 12 态状态机（权威流转表单一事实源：desktop/resources/edict/kanban/task.py） */
export type EdictState =
  | "Pending"
  | "Taizi"
  | "Zhongshu"
  | "Menxia"
  | "Assigned"
  | "Next"
  | "Doing"
  | "Review"
  | "Done"
  | "Blocked"
  | "Cancelled"
  | "PendingConfirm";

export const EDICT_STATES: EdictState[] = [
  "Pending", "Taizi", "Zhongshu", "Menxia", "Assigned", "Next",
  "Doing", "Review", "Done", "Blocked", "Cancelled", "PendingConfirm",
];

/** 看板流转日志（照搬 tasks_source.json flow_log） */
export interface EdictFlowLogEntry {
  at: string;
  from: string;
  to: string;
  remark: string;
  agent?: string;
  agentLabel?: string;
}

/** 子任务（照搬 tasks_source.json todos） */
export interface EdictTodo {
  id: string;
  title: string;
  status: "not-started" | "in-progress" | "completed";
  detail?: string;
}

/** 官署单轮完整输出（编排器把 Hermes 每节点完整回答落盘，供详情抽屉/回奏展示与素材入库） */
export interface EdictOfficialOutput {
  /** Hermes profile id（zhongshu/menxia/shangshu/hubu/libu/...） */
  agent: string;
  /** 官署中文名（中书省/门下省/尚书省/户部/...） */
  agentLabel: string;
  /** 执行节点状态（Zhongshu/Menxia/Assigned/Doing/...） */
  state: EdictState;
  /** 完整输出文本（含图片/视频链接，UI 用 MediaRenderer 预览） */
  output: string;
  /** ISO 时间 */
  at: string;
}

/** 看板任务（照搬 tasks_source.json 单条结构） */
export interface EdictTask {
  id: string;
  title: string;
  description?: string;
  priority?: string;
  state: EdictState;
  assigneeOrg?: string;
  creator?: string;
  tags?: string[];
  meta?: Record<string, unknown>;
  org?: string;
  official?: string;
  now?: string;
  eta?: string;
  block?: string;
  output?: string;
  ac?: string;
  archived?: boolean;
  flow_log: EdictFlowLogEntry[];
  progress_log: { at: string; agent: string; agentLabel?: string; text: string; todos?: string[] }[];
  todos: EdictTodo[];
  /** 官署完整输出记录（编排落盘，按时间追加） */
  official_outputs?: EdictOfficialOutput[];
  createdAt?: string;
  updatedAt?: string;
}

/** 看板数据（IPC edict:board / edict:board-updated 载荷） */
export interface EdictBoard {
  tasks: EdictTask[];
  updatedAt: string;
}

/** 官署状态（IPC edict:officials 载荷） */
export interface EdictOfficial {
  id: string;
  label: string;
  status: "idle" | "busy" | "offline";
  role: string;
}

/** 军机处统计（IPC edict:stats 载荷） */
export interface EdictStats {
  total: number;
  byState: Record<string, number>;
  active: number;
  done: number;
  blocked: number;
  vetoCount: number;
  avgDurationMs: number;
}

/** 统一操作结果（IPC 返回值） */
export type EdictOp<T = unknown> = { ok: true; data?: T } | { ok: false; error: string };

/** 编排单节点结果 */
export interface EdictPipelineStep {
  state: EdictState;
  output?: string;
  error?: string;
}

/** 编排整体结果（IPC edict:run 返回值） */
export interface EdictPipelineResult {
  taskId: string;
  finalState: EdictState;
  steps: EdictPipelineStep[];
}

// ===== 军机处补齐（edict 10 面板对齐）：省部调度 / 朝堂议政 / 模型配置 / 技能配置 / 小任务 / 天下要闻 =====

/** 官署 Agent 在线状态（省部调度 monitor） */
export interface EdictAgentStatusInfo {
  id: string;
  label: string;
  emoji: string;
  role: string;
  status: "running" | "idle" | "offline" | "unconfigured";
  statusLabel: string;
  lastActive?: string;
  model?: string;
  tasksActive: number;
}

/** 省部调度聚合状态（IPC edict:agents-status 载荷） */
export interface EdictAgentsStatusData {
  ok: boolean;
  gateway: { alive: boolean; probe: boolean; status: string };
  agents: EdictAgentStatusInfo[];
  checkedAt: string;
}

/** 朝堂议政消息（edict 原版 CourtMessage） */
export interface EdictCourtMessage {
  type: string;
  content: string;
  official_id?: string;
  official_name?: string;
  emotion?: string;
  action?: string;
  timestamp?: number;
}

/** 朝堂议政官员 */
export interface EdictCourtOfficial {
  id: string;
  name: string;
  emoji: string;
  role: string;
  personality: string;
  speaking_style: string;
}

/** 朝堂议政会话（持久化到 userData/edict-data/court-sessions/<id>.json） */
export interface EdictCourtSession {
  session_id: string;
  topic: string;
  phase: "session" | "concluded";
  round: number;
  officials: EdictCourtOfficial[];
  messages: EdictCourtMessage[];
  taskId?: string;
  created_at: string;
  updated_at: string;
}

/** 朝堂议政操作结果（IPC edict:court-discuss/* 载荷） */
export interface EdictCourtDiscussResult {
  ok: boolean;
  session_id?: string;
  topic?: string;
  round?: number;
  new_messages?: Array<{
    official_id: string;
    name: string;
    content: string;
    emotion?: string;
    action?: string;
  }>;
  scene_note?: string;
  total_messages?: number;
  /** start 时返回完整会话（供前端直接渲染朝堂布局/聊天记录） */
  officials?: EdictCourtOfficial[];
  messages?: EdictCourtMessage[];
  phase?: string;
  error?: string;
}

/** 已知模型（模型配置 models） */
export interface EdictKnownModel {
  id: string;
  label: string;
  provider: string;
}

/** 技能库条目（技能市场《我的》技能库：OpenClaw 内置 / Hermes 已装 / 云端技能包） */
export interface EdictLibrarySkill {
  name: string;
  description: string;
  /** 类别：开发/文档知识/沟通协作/运维系统/内容创作/任务流程/生活硬件/其他 */
  category: string;
  /** 依赖提示：离线可用 / 需账号 / 需 macOS / 需安装 CLI */
  deps: string;
  /** 来源：openclaw=OpenClaw 内置，hermes=Hermes 已装，market=云端技能包 */
  source: "openclaw" | "hermes" | "market";
  /** SKILL.md 所在目录 */
  dir: string;
}

export interface EdictSkillLibraryResult {
  ok: boolean;
  skills: EdictLibrarySkill[];
  error?: string;
}

/** 模型变更日志条目 */
export interface EdictModelChangeEntry {
  at: string;
  agentId: string;
  oldModel: string;
  newModel: string;
  rolledBack?: boolean;
}

/** 官署技能（技能配置 skills） */
export interface EdictSkillInfo {
  name: string;
  description: string;
  path: string;
}

/** 官署 Agent 配置（含模型与技能） */
export interface EdictAgentInfo {
  id: string;
  label: string;
  emoji: string;
  role: string;
  model: string;
  skills: EdictSkillInfo[];
}

/** 官署配置聚合（IPC edict:agent-config 载荷） */
export interface EdictAgentConfig {
  agents: EdictAgentInfo[];
  knownModels?: EdictKnownModel[];
}

/** 远程技能条目 */
export interface EdictRemoteSkillItem {
  skillName: string;
  agentId: string;
  sourceUrl: string;
  description: string;
  localPath: string;
  addedAt: string;
  lastUpdated: string;
  status: "valid" | "not-found" | string;
}

/** 远程技能列表结果 */
export interface EdictRemoteSkillsResult {
  ok: boolean;
  remoteSkills?: EdictRemoteSkillItem[];
  count?: number;
  listedAt?: string;
  error?: string;
}

/** 技能内容结果 */
export interface EdictSkillContentResult {
  ok: boolean;
  name?: string;
  agent?: string;
  content?: string;
  path?: string;
  error?: string;
}

/** 天下要闻条目 */
export interface EdictMorningNewsItem {
  title: string;
  summary?: string;
  desc?: string;
  link: string;
  source: string;
  image?: string;
  pub_date?: string;
}

/** 天下要闻简报（IPC edict:morning-brief 载荷） */
export interface EdictMorningBrief {
  date?: string;
  generated_at?: string;
  categories: Record<string, EdictMorningNewsItem[]>;
}

/** 订阅分类配置 */
export interface EdictSubCategoryConfig {
  name: string;
  enabled: boolean;
}

/** 自定义信息源 */
export interface EdictCustomFeed {
  name: string;
  url: string;
  category: string;
}

/** 订阅配置（IPC edict:morning-config 载荷） */
export interface EdictSubConfig {
  categories: EdictSubCategoryConfig[];
  keywords: string[];
  custom_feeds: EdictCustomFeed[];
  feishu_webhook: string;
}

/** 小任务/会话条目（IPC edict:sessions 载荷） */
export interface EdictSessionItem {
  id: string;
  title: string;
  agent: string;
  agentLabel?: string;
  org?: string;
  state: string;
  channel?: string;
  heartbeat?: string;
  lastMessage?: string;
  totalTokens?: number;
  updatedAt?: string;
  activity?: EdictCourtMessage[];
  isEdict: boolean;
}

/** 模型切换请求（IPC edict:set-model 载荷） */
export interface EdictSetModelInput {
  agentId: string;
  model: string;
}

/** Hermes 运行时真实状态（P1：端口/服务探测，替代 config.yaml 假状态） */
export interface EdictHermesRuntimeStatus {
  alive: boolean;
  probe: boolean;
  status: string;
  checkedAt?: string;
}

/** 三省六部结果回传通知配置（P5：桌面端本地持久化 webhook） */
export interface EdictNotifyConfig {
  enabled: boolean;
  feishuWebhook: string;
  wecomWebhook: string;
}
