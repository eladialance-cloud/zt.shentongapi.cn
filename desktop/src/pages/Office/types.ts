/**
 * AI 办公室 2D 画布 — 类型定义 (v0.3.1 Task 7)
 */

export type AIEmployeeStatus =
  | 'IDLE'
  | 'WORKING'
  | 'WORKING_DEEP'
  | 'MOVING'
  | 'VISITING'
  | 'IN_MEETING'
  | 'AT_RESOURCE'
  | 'RESTING'
  | 'OFFLINE';

/** 网格单元类型 */
export type CellType =
  | 'FLOOR'
  | 'CHAIR'
  | 'RESOURCE_LIBRARY'
  | 'MEETING_ROOM'
  | 'RESOURCE_SKILL'
  | 'RESOURCE_DEVICE'
  | 'OBSTACLE';

/** 网格单元 */
export interface GridCell {
  /** 列 (0-59) */
  x: number;
  /** 行 (0-39) */
  y: number;
  type: CellType;
}

/** 像素坐标 */
export interface PixelPoint {
  x: number;
  y: number;
}

/** AI 员工 */
export interface AIEmployee {
  id: string;
  name: string;
  emoji: string;
  role: 'business' | 'content' | 'delivery' | 'finance' | 'service';
  themeColor: string;
  themeColorLight: string;
  /** 工位像素坐标 */
  workstation: PixelPoint;
  /** 当前像素坐标 */
  currentPos: PixelPoint;
  /** 目标像素坐标 */
  targetPos: PixelPoint;
  status: AIEmployeeStatus;
  /** 状态开始时间戳 (ms) */
  statusStartTime: number;
  /** A* 像素路径 */
  path: PixelPoint[];
  /** 今日完成数 */
  todayCompleted: number;
  /** 待办数 */
  todoCount: number;
  /** 移动速度 px/s */
  moveSpeed?: number;
  /** 上次重新规划时间 (ms) */
  lastRepathAt?: number;
  /** Task 8: 任务完成动画起始时间戳 (ms)，触发 ✅ 弹簧动画 1.0s */
  taskCompleteAt?: number;
  /** Task 8: 任务失败动画起始时间戳 (ms)，触发 ⚠ 抖动动画 0.8s */
  taskFailedAt?: number;
  /** Task 7: 当前移动方向（8 方向枚举，MOVING 状态下有效） */
  direction?: 'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right' | 'down-left' | 'down-right';
  /** Task PNG迁移: 角色 PNG 精灵图模板目录 (对应 src/assets/office/iso/characters/ai-employee-NN/) */
  charTemplateDir?: string;
}

/** 任务流边 */
export interface TaskFlowEdge {
  id: string;
  fromEmployeeId: string;
  toEmployeeId: string;
  active: boolean;
  /** 粒子进度数组 (0-1) */
  particles: Array<{ progress: number }>;
  /** 上次粒子生成时间戳 (ms)，用于 20 粒子/秒生成频率控制（可选，向后兼容） */
  lastSpawnAt?: number;
}

/** 区域定义 */
export interface OfficeArea {
  id: string;
  label: string;
  /** 像素坐标 (左上角) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 区域颜色 (rgba) */
  color: string;
  /** 入口坐标 (网格坐标) */
  entrance?: { x: number; y: number };
  /** 入口对应的格子类型 */
  cellType?: CellType;
}

/** 家具类型 */
export type FurnitureType =
  | 'desk'
  | 'chair'
  | 'monitor'
  | 'roundTable'
  | 'meetingChair'
  | 'sofa'
  | 'coffeeMachine'
  | 'plant'
  | 'bookshelf'
  | 'toolWall'
  | 'serverCabinet'
  | 'receptionDesk';

/** 家具 */
export interface Furniture {
  type: FurnitureType;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 额外样式参数 (颜色/旋转) */
  color?: string;
  label?: string;
}

/** 热点 */
export interface Hotspot {
  id: string;
  x: number;
  y: number;
  radius: number;
  label: string;
  /** 关联员工 id (可选) */
  employeeId?: string;
}

/** 办公室日志事件 */
export interface OfficeLogEvent {
  id: string;
  timestamp: number;
  employeeId?: string;
  employeeName?: string;
  type: 'status_change' | 'task_complete' | 'task_fail' | 'meeting' | 'visit';
  text: string;
}

/** 状态更新事件 (WebSocket) */
export interface StatusUpdateEvent {
  employeeId: string;
  status: AIEmployeeStatus;
  /** 关联员工名 (可选) */
  reason?: string;
}

/* ============================================================
 * Task 9: 5 种对话气泡类型
 * ============================================================ */

/** 对话气泡类型 */
export type ChatBubbleType = 'text' | 'icon' | 'thinking' | 'emotion' | 'voice';

/** 对话气泡实例 */
export interface OfficeChatBubble {
  /** 唯一 ID */
  id: string;
  /** 关联 AI 员工 ID */
  employeeId: string;
  /** 气泡类型 */
  type: ChatBubbleType;
  /** 文字/思考/语音字幕内容 */
  content: string;
  /** 情绪 emoji / 图标气泡图标 */
  emoji?: string;
  /** 显示时长 (ms)，默认 3000 */
  duration?: number;
  /** 创建时间戳 (ms) */
  createdAt: number;
}

/* ============================================================
 * Task 10: Demo 场景控制接口
 * ============================================================ */

/** Demo 场景控制器 */
export interface DemoController {
  /** Demo 唯一 ID */
  id: string;
  /** Demo 标题 */
  title: string;
  /** Demo 描述 */
  description: string;
  /** 启动 Demo */
  play: (ctx: DemoContext) => Promise<void>;
  /** 停止 Demo */
  stop: () => void;
}

/** Demo 上下文（由 Office2DPage 提供） */
export interface DemoContext {
  /** 切换员工状态（可选 pos 设置目标位置） */
  setEmployeeStatus: (id: string, status: AIEmployeeStatus, pos?: { x: number; y: number }) => void;
  /** 添加对话气泡（可选 duration 指定显示时长 ms，默认 3000） */
  addBubble: (employeeId: string, type: ChatBubbleType, content: string, emoji?: string, duration?: number) => void;
  /** 移动员工到指定位置（A* 寻路），返回 Promise 完成时表示到达 */
  moveEmployee: (id: string, to: { x: number; y: number }, speed?: number) => Promise<void>;
  /** 更新 Demo 进度条 */
  showProgress: (percent: number, text: string) => void;
  /** 显示底部解说文本 */
  showNarration: (text: string) => void;
}

/** Demo 运行时状态 */
export interface DemoRuntimeState {
  /** 是否正在播放 */
  isPlaying: boolean;
  /** 进度百分比 0-100 */
  progressPercent: number;
  /** 进度提示文本 */
  progressText: string;
  /** 底部解说文本 */
  narration: string;
}

/* ============================================================
 * Task 24: 设置面板参数类型
 * ============================================================ */

/** 性能模式（影响 RAF fps） */
export type PerformanceMode = 'high' | 'balanced' | 'power-saving';

/** Office 设置面板参数 */
export interface OfficeSettings {
  /** 动效开关（false 时停止 RAF 仅渲染静态画面） */
  animationEnabled: boolean;
  /** 主题色（更新所有 AI 员工 themeColor） */
  themeColor: string;
  /** 性能模式：high 60fps / balanced 30fps / power-saving 15fps */
  performanceMode: PerformanceMode;
  /** 角色显示数量（1-5，取前 N 个 AI 员工） */
  visibleEmployeeCount: number;
}

/** 默认 Office 设置 */
export const DEFAULT_OFFICE_SETTINGS: OfficeSettings = {
  animationEnabled: true,
  themeColor: '#1677FF',
  performanceMode: 'balanced',
  visibleEmployeeCount: 5,
};

/** localStorage 持久化 key */
const OFFICE_SETTINGS_KEY = 'office-settings';

/** 从 localStorage 加载 Office 设置（合并默认值） */
export function loadOfficeSettings(): OfficeSettings {
  try {
    const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(OFFICE_SETTINGS_KEY) : null;
    if (cached) {
      return { ...DEFAULT_OFFICE_SETTINGS, ...(JSON.parse(cached) as Partial<OfficeSettings>) };
    }
  } catch {
    // localStorage 不可用或解析失败：返回默认值
  }
  return DEFAULT_OFFICE_SETTINGS;
}

/** 保存 Office 设置到 localStorage */
export function saveOfficeSettings(settings: OfficeSettings): void {
  try {
    localStorage.setItem(OFFICE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage 不可用：忽略
  }
}
