/**
 * Office 素材路径配置
 *
 * 素材物理位置: src/assets/office/iso/
 * 采用 Vite asset import 方式（在 asset-loader.ts 中 import，此处仅定义相对路径常量）。
 *
 * 相对路径约定：以 'office/iso/...' 开头（不含 'src/assets/' 前缀），
 * asset-loader.ts 会维护一张「相对路径 → Vite 解析 URL」映射表。
 */

export const ASSET_PATHS = {
  background: 'office/iso/furniture/office-background.png',
  deskWithMonitor: 'office/iso/furniture/desk-with-monitor.png',
  chair: 'office/iso/furniture/chair.png',
  meetingTable: 'office/iso/furniture/meeting-table.png',
  largeScreen: 'office/iso/furniture/large-screen.png',
  plant: 'office/iso/furniture/plant.png',
  receptionDesk: 'office/iso/furniture/reception-desk.png',
  bookshelf: 'office/iso/decorations/bookshelf.png',
  loungeSofa: 'office/iso/decorations/lounge-sofa.png',
  screenDivider: 'office/iso/decorations/screen-divider.png',
  tileCarpet: 'office/iso/tiles/tile-carpet.png',
  tileWoodFloor: 'office/iso/tiles/tile-wood-floor.png',
  wallGlassPartition: 'office/iso/walls/wall-glass-partition.png',
  wallExterior: 'office/iso/walls/wall-iso-exterior.png',
  characters: {
    templates: [
      'office/iso/characters/ai-employee-01',
      'office/iso/characters/ai-employee-02',
      'office/iso/characters/ai-employee-03',
      'office/iso/characters/ai-employee-04',
      'office/iso/characters/ai-employee-05',
      'office/iso/characters/ai-employee-06',
    ],
  },
} as const

/** 角色精灵图动作类型（对应精灵图文件名 {action}-{dir}-{frame}.png 中的 action） */
export type CharAction = 'idle' | 'walking' | 'working' | 'meeting'

/** 角色精灵图方向缩写（对应精灵图文件名中的 dir：n/ne/e/se/s/sw/w/nw） */
export type CharDir = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

/**
 * 构造角色精灵图相对路径（不含 base URL，用于在 asset-loader.ts 的映射表中查找）。
 *
 * 文件名格式：`{action}-{dir}-{frame}.png`，frame 用 `padStart(2, '0')` 补零
 * （如 frame=1 → '01'，与磁盘文件 idle-e-01.png 对齐）。
 *
 * @param templateDir 模板目录相对路径（如 'office/iso/characters/ai-employee-01'）
 * @param action 动作类型
 * @param dir 8 方向缩写
 * @param frame 帧序号（1-based）
 * @returns 形如 'office/iso/characters/ai-employee-01/idle-e-01.png' 的相对路径
 */
export function charSpriteUrl(
  templateDir: string,
  action: CharAction,
  dir: CharDir,
  frame: number,
): string {
  const frameStr = String(frame).padStart(2, '0')
  return `${templateDir}/${action}-${dir}-${frameStr}.png`
}

/**
 * 获取指定动作的帧数。
 *
 * 精灵图帧数：walking 有 4 帧（01-04），其余动作（idle/working/meeting）各 3 帧（01-03）。
 *
 * @param action 动作类型
 * @returns walking 返回 4，其他返回 3
 */
export function getFrameCount(action: CharAction): number {
  return action === 'walking' ? 4 : 3
}

/**
 * AIEmployeeStatus → CharAction 映射。
 *
 * 覆盖全部 9 个 AIEmployeeStatus 值：
 *   IDLE → idle
 *   WORKING / WORKING_DEEP → working
 *   MOVING / VISITING → walking
 *   IN_MEETING → meeting
 *   AT_RESOURCE / RESTING / OFFLINE → idle
 *
 * 使用 exhaustive switch（无 default），新增状态值时编译器会报错提醒补全映射。
 *
 * @param status AI 员工状态
 * @returns 角色精灵图动作类型
 */
export function statusToAction(status: AIEmployeeStatus): CharAction {
  switch (status) {
    case 'IDLE':
      return 'idle'
    case 'WORKING':
    case 'WORKING_DEEP':
      return 'working'
    case 'MOVING':
    case 'VISITING':
      return 'walking'
    case 'IN_MEETING':
      return 'meeting'
    case 'AT_RESOURCE':
    case 'RESTING':
    case 'OFFLINE':
      return 'idle'
    default:
      // M4 fix: 运行时兼底，防止非法状态值导致 undefined
      console.warn(`[asset-config] 未知状态: ${status}, 回退为 idle`)
      return 'idle'
  }
}

/**
 * Direction → CharDir 映射。
 *
 * 覆盖全部 8 个 Direction 值（精灵图文件名使用缩写方向）：
 *   up → n
 *   up-right → ne
 *   right → e
 *   down-right → se
 *   down → s
 *   down-left → sw
 *   left → w
 *   up-left → nw
 *
 * 使用 exhaustive switch（无 default），新增方向值时编译器会报错提醒补全映射。
 *
 * @param dir 8 方向枚举（来自 spritesheet-loader）
 * @returns 角色精灵图方向缩写
 */
export function directionToCharDir(dir: Direction): CharDir {
  switch (dir) {
    case 'up':
      return 'n'
    case 'up-right':
      return 'ne'
    case 'right':
      return 'e'
    case 'down-right':
      return 'se'
    case 'down':
      return 's'
    case 'down-left':
      return 'sw'
    case 'left':
      return 'w'
    case 'up-left':
      return 'nw'
    default:
      // M4 fix: 运行时兼底，防止非法方向值导致 undefined
      console.warn(`[asset-config] 未知方向: ${dir}, 回退为 s`)
      return 's'
  }
}

// 类型导入放在文件末尾，避免循环依赖前置（type-only import 会被擦除，无运行时 TDZ）
import type { AIEmployeeStatus } from './types'
import type { Direction } from './sprites/spritesheet-loader'
