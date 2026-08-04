// 纯2D AI办公室类型定义

/** 智能体在办公室中的视觉状态 */
export type OfficeAgentState = 'idle' | 'working' | 'thinking' | 'walking' | 'talking'

/** AI员工（从API数据映射而来） */
export interface OfficeAgent {
  id: string
  name: string
  role: string
  emoji: string
  color: string
  state: OfficeAgentState
  task: string
  x: number
  y: number
  deskId: string
  facing: 1 | -1
  instanceStatus?: 'running' | 'stopped' | 'error'  // Hermes运行时状态
}

/** 工位定义 */
export interface OfficeDesk {
  id: string
  x: number
  y: number
  seatX: number
  seatY: number
  occupiedBy?: string
}

/** 办公室布局配置 */
export interface OfficeLayoutConfig {
  /** 列数 */
  cols: number
  /** 行数（0=自动计算） */
  rows: number
  /** 列间距 */
  colGap: number
  /** 行间距 */
  rowGap: number
  /** 座位相对工位的Y偏移 */
  seatOffsetY: number
}

/** 办公室色彩配置 */
export interface OfficeColorConfig {
  floor: string
  wall: string
  background: string
  deskTop: string
  chairColor: string
}

/** 完整办公室配置 */
export interface OfficeConfig {
  layout: OfficeLayoutConfig
  colors: OfficeColorConfig
  sceneWidth: number
  sceneHeight: number
  showLabels: boolean
  animationSpeed: number
}

export const DEFAULT_LAYOUT: OfficeLayoutConfig = {
  cols: 3,
  rows: 0,
  colGap: 160,
  rowGap: 150,
  seatOffsetY: 45,
}

export const DEFAULT_COLORS: OfficeColorConfig = {
  floor: '#F8FAFC',
  wall: '#FFFFFF',
  background: '#F1F5F9',
  deskTop: '#FFFFFF',
  chairColor: '#E2E8F0',
}

export const DEFAULT_CONFIG: OfficeConfig = {
  layout: DEFAULT_LAYOUT,
  colors: DEFAULT_COLORS,
  sceneWidth: 960,
  sceneHeight: 640,
  showLabels: true,
  animationSpeed: 1.0,
}

/** 预置主题 */
export const COLOR_PRESETS: Record<string, OfficeColorConfig> = {
  dark: {
    floor: '#F8FAFC',
    wall: '#FFFFFF',
    background: '#F1F5F9',
    deskTop: '#FFFFFF',
    chairColor: '#E2E8F0',
  },
  light: {
    floor: '#FFFFFF',
    wall: '#F0F0F0',
    background: '#FAFAFA',
    deskTop: '#FFFFFF',
    chairColor: '#E0E0E0',
  },
  warm: {
    floor: '#FFF8F0',
    wall: '#F5EDE0',
    background: '#FFF5EB',
    deskTop: '#FFFFFF',
    chairColor: '#E8D5C0',
  },
  nature: {
    floor: '#F0F7F0',
    wall: '#E0EDE0',
    background: '#F5FAF5',
    deskTop: '#FFFFFF',
    chairColor: '#C8DCC8',
  },
}
