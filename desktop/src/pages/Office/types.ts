/**
 * AI 鍔炲叕瀹?2D 鐢诲竷 鈥?绫诲瀷瀹氫箟 (v0.3.1 Task 7)
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

/** 缃戞牸鍗曞厓绫诲瀷 */
export type CellType =
  | 'FLOOR'
  | 'CHAIR'
  | 'RESOURCE_LIBRARY'
  | 'MEETING_ROOM'
  | 'RESOURCE_SKILL'
  | 'RESOURCE_DEVICE'
  | 'OBSTACLE';

/** 缃戞牸鍗曞厓 */
export interface GridCell {
  /** 鍒?(0-59) */
  x: number;
  /** 琛?(0-39) */
  y: number;
  type: CellType;
}

/** 鍍忕礌鍧愭爣 */
export interface PixelPoint {
  x: number;
  y: number;
}

/** AI 鍛樺伐 */
export interface AIEmployee {
  id: string;
  name: string;
  emoji: string;
  role: string;
  themeColor: string;
  themeColorLight: string;
  /** 宸ヤ綅鍍忕礌鍧愭爣 */
  workstation: PixelPoint;
  /** 褰撳墠鍍忕礌鍧愭爣 */
  currentPos: PixelPoint;
  /** 鐩爣鍍忕礌鍧愭爣 */
  targetPos: PixelPoint;
  status: AIEmployeeStatus;
  /** 鐘舵€佸紑濮嬫椂闂存埑 (ms) */
  statusStartTime: number;
  /** A* 鍍忕礌璺緞 */
  path: PixelPoint[];
  /** 浠婃棩瀹屾垚鏁?*/
  todayCompleted: number;
  /** 寰呭姙鏁?*/
  todoCount: number;
  /** 绉诲姩閫熷害 px/s */
  moveSpeed?: number;
  /** 涓婃閲嶆柊瑙勫垝鏃堕棿 (ms) */
  lastRepathAt?: number;
  /** Task 8: 浠诲姟瀹屾垚鍔ㄧ敾璧峰鏃堕棿鎴?(ms)锛岃Е鍙?鉁?寮圭哀鍔ㄧ敾 1.0s */
  taskCompleteAt?: number;
  /** Task 8: 浠诲姟澶辫触鍔ㄧ敾璧峰鏃堕棿鎴?(ms)锛岃Е鍙?鈿?鎶栧姩鍔ㄧ敾 0.8s */
  taskFailedAt?: number;
  /** Task 7: 褰撳墠绉诲姩鏂瑰悜锛? 鏂瑰悜鏋氫妇锛孧OVING 鐘舵€佷笅鏈夋晥锛?*/
  direction?: 'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right' | 'down-left' | 'down-right';
  /** Task PNG杩佺Щ: 瑙掕壊 PNG 绮剧伒鍥炬ā鏉跨洰褰?(瀵瑰簲 src/assets/office/iso/characters/ai-employee-NN/) */
  charTemplateDir?: string;
}

/** 浠诲姟娴佽竟 */
export interface TaskFlowEdge {
  id: string;
  fromEmployeeId: string;
  toEmployeeId: string;
  active: boolean;
  /** 绮掑瓙杩涘害鏁扮粍 (0-1) */
  particles: Array<{ progress: number }>;
  /** 涓婃绮掑瓙鐢熸垚鏃堕棿鎴?(ms)锛岀敤浜?20 绮掑瓙/绉掔敓鎴愰鐜囨帶鍒讹紙鍙€夛紝鍚戝悗鍏煎锛?*/
  lastSpawnAt?: number;
}

/** 鍖哄煙瀹氫箟 */
export interface OfficeArea {
  id: string;
  label: string;
  /** 鍍忕礌鍧愭爣 (宸︿笂瑙? */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 鍖哄煙棰滆壊 (rgba) */
  color: string;
  /** 鍏ュ彛鍧愭爣 (缃戞牸鍧愭爣) */
  entrance?: { x: number; y: number };
  /** 鍏ュ彛瀵瑰簲鐨勬牸瀛愮被鍨?*/
  cellType?: CellType;
}

/** 瀹跺叿绫诲瀷 */
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

/** 瀹跺叿 */
export interface Furniture {
  type: FurnitureType;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 棰濆鏍峰紡鍙傛暟 (棰滆壊/鏃嬭浆) */
  color?: string;
  label?: string;
}

/** 鐑偣 */
export interface Hotspot {
  id: string;
  x: number;
  y: number;
  radius: number;
  label: string;
  /** 鍏宠仈鍛樺伐 id (鍙€? */
  employeeId?: string;
}

/** 鍔炲叕瀹ゆ棩蹇椾簨浠?*/
export interface OfficeLogEvent {
  id: string;
  timestamp: number;
  employeeId?: string;
  employeeName?: string;
  type: 'status_change' | 'task_complete' | 'task_fail' | 'meeting' | 'visit';
  text: string;
}

/** 鐘舵€佹洿鏂颁簨浠?(WebSocket) */
export interface StatusUpdateEvent {
  employeeId: string;
  status: AIEmployeeStatus;
  /** 鍏宠仈鍛樺伐鍚?(鍙€? */
  reason?: string;
}

/* ============================================================
 * Task 9: 5 绉嶅璇濇皵娉＄被鍨? * ============================================================ */

/** 瀵硅瘽姘旀场绫诲瀷 */
export type ChatBubbleType = 'text' | 'icon' | 'thinking' | 'emotion' | 'voice';

/** 瀵硅瘽姘旀场瀹炰緥 */
export interface OfficeChatBubble {
  /** 鍞竴 ID */
  id: string;
  /** 鍏宠仈 AI 鍛樺伐 ID */
  employeeId: string;
  /** 姘旀场绫诲瀷 */
  type: ChatBubbleType;
  /** 鏂囧瓧/鎬濊€?璇煶瀛楀箷鍐呭 */
  content: string;
  /** 鎯呯华 emoji / 鍥炬爣姘旀场鍥炬爣 */
  emoji?: string;
  /** 鏄剧ず鏃堕暱 (ms)锛岄粯璁?3000 */
  duration?: number;
  /** 鍒涘缓鏃堕棿鎴?(ms) */
  createdAt: number;
}

/* ============================================================
 * Task 10: Demo 鍦烘櫙鎺у埗鎺ュ彛
 * ============================================================ */

/** Demo 鍦烘櫙鎺у埗鍣?*/
export interface DemoController {
  /** Demo 鍞竴 ID */
  id: string;
  /** Demo 鏍囬 */
  title: string;
  /** Demo 鎻忚堪 */
  description: string;
  /** 鍚姩 Demo */
  play: (ctx: DemoContext) => Promise<void>;
  /** 鍋滄 Demo */
  stop: () => void;
}

/** Demo 涓婁笅鏂囷紙鐢?Office2DPage 鎻愪緵锛?*/
export interface DemoContext {
  /** 鍒囨崲鍛樺伐鐘舵€侊紙鍙€?pos 璁剧疆鐩爣浣嶇疆锛?*/
  setEmployeeStatus: (id: string, status: AIEmployeeStatus, pos?: { x: number; y: number }) => void;
  /** 娣诲姞瀵硅瘽姘旀场锛堝彲閫?duration 鎸囧畾鏄剧ず鏃堕暱 ms锛岄粯璁?3000锛?*/
  addBubble: (employeeId: string, type: ChatBubbleType, content: string, emoji?: string, duration?: number) => void;
  /** 绉诲姩鍛樺伐鍒版寚瀹氫綅缃紙A* 瀵昏矾锛夛紝杩斿洖 Promise 瀹屾垚鏃惰〃绀哄埌杈?*/
  moveEmployee: (id: string, to: { x: number; y: number }, speed?: number) => Promise<void>;
  /** 鏇存柊 Demo 杩涘害鏉?*/
  showProgress: (percent: number, text: string) => void;
  /** 鏄剧ず搴曢儴瑙ｈ鏂囨湰 */
  showNarration: (text: string) => void;
}

/** Demo 杩愯鏃剁姸鎬?*/
export interface DemoRuntimeState {
  /** 鏄惁姝ｅ湪鎾斁 */
  isPlaying: boolean;
  /** 杩涘害鐧惧垎姣?0-100 */
  progressPercent: number;
  /** 杩涘害鎻愮ず鏂囨湰 */
  progressText: string;
  /** 搴曢儴瑙ｈ鏂囨湰 */
  narration: string;
}

/* ============================================================
 * Task 24: 璁剧疆闈㈡澘鍙傛暟绫诲瀷
 * ============================================================ */

/** 鎬ц兘妯″紡锛堝奖鍝?RAF fps锛?*/
export type PerformanceMode = 'high' | 'balanced' | 'power-saving';

/** Office 璁剧疆闈㈡澘鍙傛暟 */
export interface OfficeSettings {
  /** 鍔ㄦ晥寮€鍏筹紙false 鏃跺仠姝?RAF 浠呮覆鏌撻潤鎬佺敾闈級 */
  animationEnabled: boolean;
  /** 涓婚鑹诧紙鏇存柊鎵€鏈?AI 鍛樺伐 themeColor锛?*/
  themeColor: string;
  /** 鎬ц兘妯″紡锛歨igh 60fps / balanced 30fps / power-saving 15fps */
  performanceMode: PerformanceMode;
  /** 瑙掕壊鏄剧ず鏁伴噺锛?-5锛屽彇鍓?N 涓?AI 鍛樺伐锛?*/
  visibleEmployeeCount: number;
}

/** 榛樿 Office 璁剧疆 */
export const DEFAULT_OFFICE_SETTINGS: OfficeSettings = {
  animationEnabled: true,
  themeColor: '#1677FF',
  performanceMode: 'balanced',
  visibleEmployeeCount: 5,
};

/** localStorage 鎸佷箙鍖?key */
const OFFICE_SETTINGS_KEY = 'office-settings';

/** 浠?localStorage 鍔犺浇 Office 璁剧疆锛堝悎骞堕粯璁ゅ€硷級 */
export function loadOfficeSettings(): OfficeSettings {
  try {
    const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(OFFICE_SETTINGS_KEY) : null;
    if (cached) {
      return { ...DEFAULT_OFFICE_SETTINGS, ...(JSON.parse(cached) as Partial<OfficeSettings>) };
    }
  } catch {
    // localStorage ??????????????
    }
  return DEFAULT_OFFICE_SETTINGS;
}

/** 淇濆瓨 Office 璁剧疆鍒?localStorage */
export function saveOfficeSettings(settings: OfficeSettings): void {
  try {
    localStorage.setItem(OFFICE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage 涓嶅彲鐢細蹇界暐
  }
}
