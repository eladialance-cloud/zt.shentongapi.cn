import { Assets, Texture } from 'pixi.js'
import { getCharSpriteUrl } from '../asset-loader'
import { statusToAction, directionToCharDir, getFrameCount, type CharAction, type CharDir } from '../asset-config'
import type { AIEmployeeStatus } from '../types'

/**
 * spritesheet-loader.ts — Sprite Sheet 加载器（接口兼容层）
 *
 * 当前实现：返回 null，走 CSS keyframes fallback。
 * 未来若有美术资源（32 帧 Sprite Sheet：8 方向 × 4 帧，单帧 48×48px），
 * 可替换此实现为真实 Image 加载 + 切片逻辑，渲染层无需改动。
 *
 * spec 用户已确认决策（不可变更）：
 *   "Sprite Sheet：不依赖美术资源，用 CSS keyframes fallback 模拟 8 方向走动动画，
 *    保留 Sprite Sheet 接口兼容性"
 */

/** 8 方向枚举（与 walk-animation.css 中的 keyframes 一一对应） */
export type Direction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'up-left'
  | 'up-right'
  | 'down-left'
  | 'down-right';

/** 单帧切片信息 */
export interface SpriteFrame {
  /** 在 Sprite Sheet 中的起始 x 坐标 */
  sx: number;
  /** 在 Sprite Sheet 中的起始 y 坐标 */
  sy: number;
  /** 帧宽度（px，默认 48） */
  sw: number;
  /** 帧高度（px，默认 48） */
  sh: number;
}

/** Sprite Sheet 配置（8 方向 × 4 帧 = 32 帧） */
export interface SpriteSheetConfig {
  /** 单帧宽度 */
  frameWidth: number;
  /** 单帧高度 */
  frameHeight: number;
  /** 每方向帧数 */
  framesPerDirection: number;
  /** 方向 → 行映射（第几行） */
  directionRow: Record<Direction, number>;
}

/** 默认 Sprite Sheet 配置（48×48 × 8 行 4 列） */
export const DEFAULT_SPRITE_SHEET_CONFIG: SpriteSheetConfig = {
  frameWidth: 48,
  frameHeight: 48,
  framesPerDirection: 4,
  directionRow: {
    'down':        0,
    'down-left':   1,
    'left':        2,
    'up-left':     3,
    'up':          4,
    'up-right':    5,
    'right':       6,
    'down-right':  7,
  },
};

/**
 * 加载 Sprite Sheet 资源。
 *
 * 当前实现：返回 null（fallback 走 CSS keyframes）。
 * 未来实现可参考：
 * ```ts
 * const img = new Image();
 * img.src = url;
 * await img.decode();
 * return img;
 * ```
 *
 * @param url Sprite Sheet 资源 URL
 * @returns 加载成功返回 HTMLImageElement，否则返回 null
 */
export async function loadSpriteSheet(_url: string): Promise<HTMLImageElement | null> {
  // 当前 fallback：不依赖美术资源，直接返回 null
  // 渲染层（renderer.ts / iso-renderer.ts）会通过其他方式模拟走动动画
  return null;
}

/**
 * 从 Sprite Sheet 中获取指定方向的某一帧切片。
 *
 * 当前实现：返回默认切片信息（不会真正被使用，因为 loadSpriteSheet 返回 null）。
 * 未来加载真实 Sprite Sheet 后，渲染层会通过此函数计算切片源坐标。
 *
 * @param _sheet 已加载的 Sprite Sheet（当前为 null）
 * @param direction 8 方向之一
 * @param frame 当前帧索引（0-3，循环）
 * @returns 帧切片信息
 */
export function getSpriteFrame(
  _sheet: HTMLImageElement | null,
  direction: Direction,
  frame: number,
): SpriteFrame {
  const cfg = DEFAULT_SPRITE_SHEET_CONFIG;
  const row = cfg.directionRow[direction] ?? 0;
  const col = ((frame % cfg.framesPerDirection) + cfg.framesPerDirection) % cfg.framesPerDirection;
  return {
    sx: col * cfg.frameWidth,
    sy: row * cfg.frameHeight,
    sw: cfg.frameWidth,
    sh: cfg.frameHeight,
  };
}

/**
 * 根据 dx/dy 移动向量计算 8 方向枚举。
 *
 * 用于 OfficeCanvas/renderer.ts 中 MOVING 状态时根据移动向量推导精灵方向。
 *
 * @param dx X 方向位移（正：朝右，负：朝左）
 * @param dy Y 方向位移（正：朝下，负：朝上）
 * @returns 8 方向枚举之一
 */
export function directionFromDelta(dx: number, dy: number): Direction {
  if (dx === 0 && dy === 0) return 'down';
  const angle = Math.atan2(dy, dx) * 180 / Math.PI; // -180 ~ 180
  // 8 个方向各占 45° 区间，以右为 0°
  // down-right: -22.5 ~ 22.5
  // right:     22.5 ~ 67.5
  // up-right:   67.5 ~ 112.5
  // up:        112.5 ~ 157.5
  // up-left:   157.5 ~ 180 or -180 ~ -157.5
  // left:     -157.5 ~ -112.5
  // down-left: -112.5 ~ -67.5
  // down:      -67.5 ~ -22.5
  if (angle >= -22.5 && angle < 22.5) return 'down-right';
  if (angle >= 22.5 && angle < 67.5) return 'right';
  if (angle >= 67.5 && angle < 112.5) return 'up-right';
  if (angle >= 112.5 && angle < 157.5) return 'up';
  if (angle >= 157.5 || angle < -157.5) return 'up-left';
  if (angle >= -157.5 && angle < -112.5) return 'left';
  if (angle >= -112.5 && angle < -67.5) return 'down-left';
  return 'down'; // -67.5 ~ -22.5
}

/**
 * 获取 8fps 循环动画的当前帧索引（0-3）。
 *
 * @param timestamp 当前时间戳（ms）
 * @param startTime 动画开始时间戳（ms）
 * @returns 帧索引（0-3）
 */
export function getWalkFrameIndex(timestamp: number, startTime: number): number {
  const elapsed = Math.max(0, timestamp - startTime);
  // 8fps = 125ms/帧，4 帧循环
  return Math.floor(elapsed / 125) % 4;
}

/* ============================================================
 * PNG 精灵图加载（Task 3 新增）
 * 从 src/assets/office/iso/characters/ai-employee-NN/ 加载 PNG 精灵图
 * 每张 PNG 是一帧角色画面，文件名: {action}-{dir}-{NN}.png
 * ============================================================ */

/** 已加载的精灵纹理缓存: key = "templateDir/action/dir/frame" */
const spriteCache = new Map<string, Texture>()

/**
 * 异步加载角色精灵纹理并缓存。
 *
 * @param templateDir 角色模板目录相对路径 (如 'office/iso/characters/ai-employee-01')
 * @param action 动作 (idle/walking/working/meeting)
 * @param dir 方向 (n/ne/e/se/s/sw/w/nw)
 * @param frame 帧号 (1-based)
 * @returns PIXI Texture
 */
export async function loadCharSprite(
  templateDir: string,
  action: CharAction,
  dir: CharDir,
  frame: number,
): Promise<Texture> {
  const key = `${templateDir}/${action}/${dir}/${frame}`
  const cached = spriteCache.get(key)
  if (cached) return cached

  const url = getCharSpriteUrl(templateDir, action, dir, frame)
  const tex = await Assets.load<Texture>(url)
  spriteCache.set(key, tex)
  return tex
}

/**
 * 同步获取已缓存的精灵纹理（须先调用 loadCharSprite 预加载）。
 *
 * @returns PIXI Texture 或 null（未加载）
 */
export function getCachedSprite(
  templateDir: string,
  action: CharAction,
  dir: CharDir,
  frame: number,
): Texture | null {
  const key = `${templateDir}/${action}/${dir}/${frame}`
  return spriteCache.get(key) ?? null
}

/**
 * 根据员工状态 + 方向 + 时间戳，获取当前帧的精灵纹理（同步，依赖预加载）。
 *
 * @param templateDir 角色模板目录
 * @param status 员工状态 (AIEmployeeStatus)
 * @param dir 移动方向 (Direction)
 * @param timestamp 当前时间戳 (ms)
 * @param statusStartTime 状态开始时间戳 (ms)
 * @returns PIXI Texture 或 null（未加载/未预加载）
 */
export function getEmployeeSprite(
  templateDir: string,
  status: AIEmployeeStatus,
  dir: Direction,
  timestamp: number,
  statusStartTime: number,
): Texture | null {
  const action = statusToAction(status)
  const charDir = directionToCharDir(dir)
  const frameCount = getFrameCount(action)

  // 8fps 循环动画: 125ms/帧
  const elapsed = Math.max(0, timestamp - statusStartTime)
  const frameIndex = Math.floor(elapsed / 125) % frameCount
  const frame = frameIndex + 1

  // 1. 先查 spriteCache（保持原逻辑）
  const cached = getCachedSprite(templateDir, action, charDir, frame)
  if (cached) return cached

  // 2. 兜底: 从 PixiJS Assets 缓存同步取纹理（preloadOfficeAssets 已预加载）
  //    取到后回填 spriteCache，后续帧直接命中 cache
  try {
    const url = getCharSpriteUrl(templateDir, action, charDir, frame)
    const tex = Assets.get(url) as Texture | undefined
    if (tex) {
      const key = `${templateDir}/${action}/${charDir}/${frame}`
      spriteCache.set(key, tex)
      return tex
    }
  } catch {
    // getCharSpriteUrl 或 Assets.get 抛错时静默走 fallback
  }
  return null
}
